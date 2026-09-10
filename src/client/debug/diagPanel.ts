// ============================================================
// diagPanel.ts — 実機診断パネル（Android Chrome 暗転バグ調査用）
//
// `?fcmsdebug=1` を付けて開いたときだけ有効。React や他モジュールに依存しない
// 素の DOM スクリプトで、画面最前面（z-index 最大）に状態を描画し続ける。
// USB デバッグ無しで「暗転して進行不能」の瞬間の内部状態をスクショで取るための道具。
//
// 観測するもの:
//  - 画面を覆う fixed/absolute 要素（演出の暗転 backdrop 等）の opacity / pointer-events /
//    animation-name / animation-play-state / 背景色 / 矩形
//  - 盤面コンテナ（will-change: transform）の transform 行列と矩形（パンで画面外に出ていないか）
//  - canvas の実サイズ（GPU 上限超過の疑い）
//  - document.getAnimations() の running/paused/finished 数
//  - AudioContext の state（タッチ起点の resume が絡む疑い）
//  - タッチ/ポインタ/クリックのヒット先、animationstart/end/cancel、error/unhandledrejection、
//    console の "[…]" 付きログ（[Battle] 等）
//  - ハートビート（JS が動いているか）と rAF カウンタ（描画ループが回っているか）
// ============================================================

const PANEL_ID = 'fcms-diag-panel';
const SAMPLE_MS = 500;
const MAX_EVENTS = 40;

type AudioCtxLike = { state: string };

function isRequested(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('fcmsdebug');
    if (q === '1') {
      sessionStorage.setItem('fcms.debug', '1');
      return true;
    }
    if (q === '0') {
      sessionStorage.removeItem('fcms.debug');
      return false;
    }
    return sessionStorage.getItem('fcms.debug') === '1';
  } catch {
    return false;
  }
}

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : String(n);
}

function describe(el: Element | null): string {
  if (!el) return 'null';
  const h = el as HTMLElement;
  const cs = window.getComputedStyle(el);
  const tag = el.tagName.toLowerCase();
  const id = h.id ? `#${h.id}` : '';
  const cls = h.className && typeof h.className === 'string' ? `.${h.className.split(/\s+/)[0]}` : '';
  const bg = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? ` bg=${cs.backgroundColor}` : '';
  const z = cs.zIndex !== 'auto' ? ` z=${cs.zIndex}` : '';
  const pe = cs.pointerEvents !== 'auto' ? ` pe=${cs.pointerEvents}` : '';
  const text = (h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  return `${tag}${id}${cls}${z}${pe}${bg}${text ? ` "${text}"` : ''}`;
}

function rectStr(r: DOMRect): string {
  return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
}

export function installDiagPanelIfRequested(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!isRequested()) return;
  if (document.getElementById(PANEL_ID)) return;

  const t0 = performance.now();
  const events: string[] = [];
  const audioCtxs: AudioCtxLike[] = [];
  let heartbeat = 0;
  let rafCount = 0;
  let paused = false;
  let lastText = '';
  const seenOverlays = new Set<string>();

  const now = () => `${fmt((performance.now() - t0) / 1000, 1)}s`;
  const log = (line: string) => {
    events.push(`${now()} ${line}`);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  };

  // ── AudioContext を包んで生成インスタンスを追跡 ──
  try {
    const w = window as unknown as { AudioContext?: new (...args: unknown[]) => AudioCtxLike };
    const Orig = w.AudioContext;
    if (Orig) {
      const Wrapped = function (this: unknown, ...args: unknown[]) {
        const ctx = new Orig(...args);
        audioCtxs.push(ctx);
        log(`AudioContext created (#${audioCtxs.length}) state=${ctx.state}`);
        return ctx;
      } as unknown as new (...args: unknown[]) => AudioCtxLike;
      Wrapped.prototype = Orig.prototype;
      w.AudioContext = Wrapped;
    }
  } catch {
    // 失敗しても診断は続行
  }

  // ── console の "[...]" 付きログを拾う（[Battle] 等） ──
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const capture = (level: string, args: unknown[]) => {
    try {
      const s = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      if (level !== 'log' || s.startsWith('[')) log(`${level}: ${s.slice(0, 140)}`);
    } catch {
      // ignore
    }
  };
  console.log = (...args: unknown[]) => { capture('log', args); origLog(...args); };
  console.warn = (...args: unknown[]) => { capture('warn', args); origWarn(...args); };
  console.error = (...args: unknown[]) => { capture('ERROR', args); origError(...args); };

  window.addEventListener('error', (e) => log(`window.error: ${e.message} @${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => log(`unhandledrejection: ${String((e as PromiseRejectionEvent).reason).slice(0, 140)}`));
  document.addEventListener('visibilitychange', () => log(`visibility=${document.visibilityState}`));
  window.addEventListener('resize', () => log(`resize ${window.innerWidth}x${window.innerHeight}`));

  // ── 入力イベントのヒット先（capture で最初に見る） ──
  const onInput = (e: Event) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(`#${PANEL_ID}`)) return;
    let pos = '';
    const me = e as MouseEvent;
    const te = e as TouchEvent;
    if (typeof me.clientX === 'number' && typeof me.clientY === 'number') pos = ` @${Math.round(me.clientX)},${Math.round(me.clientY)}`;
    else if (te.touches && te.touches[0]) pos = ` @${Math.round(te.touches[0].clientX)},${Math.round(te.touches[0].clientY)}`;
    log(`${e.type}${pos} → ${describe(target)}`);
  };
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
    document.addEventListener(type, onInput, { capture: true, passive: true });
  }

  // ── アニメーション開始/終了/中断（暗転 backdrop の out が走るかを直接観測） ──
  const onAnim = (e: Event) => {
    const ae = e as AnimationEvent;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(`#${PANEL_ID}`)) return;
    log(`${e.type} ${ae.animationName} on ${describe(target)}`);
  };
  for (const type of ['animationstart', 'animationend', 'animationcancel']) {
    document.addEventListener(type, onAnim, { capture: true });
  }

  // ── rAF カウンタ ──
  const tick = () => { rafCount++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  // ── パネル DOM ──
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  Object.assign(panel.style, {
    position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647',
    maxHeight: '46vh', overflowY: 'auto', background: 'rgba(255,255,210,0.96)', color: '#000',
    font: '11px/1.35 ui-monospace, Menlo, monospace', pointerEvents: 'auto', touchAction: 'auto',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)', padding: '4px 6px 6px',
  } as Partial<CSSStyleDeclaration>);

  const bar = document.createElement('div');
  Object.assign(bar.style, { display: 'flex', gap: '6px', marginBottom: '4px' } as Partial<CSSStyleDeclaration>);
  const mkBtn = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      font: 'bold 13px sans-serif', padding: '8px 12px', minHeight: '40px', border: '1px solid #444',
      borderRadius: '6px', background: '#fff', color: '#000',
    } as Partial<CSSStyleDeclaration>);
    b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
    return b;
  };
  const pauseBtn = mkBtn('PAUSE', () => { paused = !paused; pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE'; });
  const copyBtn = mkBtn('COPY', () => {
    const text = lastText;
    const done = () => { copyBtn.textContent = 'COPIED'; setTimeout(() => { copyBtn.textContent = 'COPY'; }, 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  });
  const hideBtn = mkBtn('HIDE', () => { try { sessionStorage.removeItem('fcms.debug'); } catch { /* ignore */ } panel.remove(); });
  // append() は @cloudflare/workers-types の HTMLRewriter.Element と型が衝突するため appendChild を使う
  bar.appendChild(pauseBtn);
  bar.appendChild(copyBtn);
  bar.appendChild(hideBtn);

  const pre = document.createElement('pre');
  Object.assign(pre.style, { margin: '0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } as Partial<CSSStyleDeclaration>);
  panel.appendChild(bar);
  panel.appendChild(pre);

  const fallbackCopy = (text: string, done: () => void) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch { /* ignore */ }
    ta.remove();
  };

  const mount = () => {
    if (!document.body) { setTimeout(mount, 50); return; }
    document.body.appendChild(panel);
    log(`diag installed UA=${navigator.userAgent.slice(0, 90)}`);
  };
  mount();

  // ── サンプリング ──
  const sample = (): string => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const lines: string[] = [];
    const vv = window.visualViewport;
    lines.push(`FCMS DIAG v1  t=${now()} hb=${heartbeat} raf=${rafCount} vis=${document.visibilityState}`);
    lines.push(`viewport ${vw}x${vh} dpr=${fmt(window.devicePixelRatio, 2)}`
      + (vv ? ` vv.scale=${fmt(vv.scale, 2)} vv.off=${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)}` : '')
      + ` scroll=${Math.round(window.scrollX)},${Math.round(window.scrollY)} active=${document.activeElement?.tagName ?? '-'}`);

    // 画面の50%以上を覆う fixed/absolute 要素
    const overlays: string[] = [];
    const boards: string[] = [];
    const canvases: string[] = [];
    const currentOverlays = new Set<string>();
    const all = document.body ? document.body.getElementsByTagName('*') : ([] as unknown as HTMLCollectionOf<Element>);
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.closest(`#${PANEL_ID}`)) continue;
      const cs = window.getComputedStyle(el);
      if (el.tagName === 'CANVAS') {
        const c = el as HTMLCanvasElement;
        const r = c.getBoundingClientRect();
        canvases.push(`canvas ${c.width}x${c.height} css=${Math.round(r.width)}x${Math.round(r.height)} area=${((c.width * c.height) / 1e6).toFixed(1)}MP`);
        continue;
      }
      if (cs.willChange.includes('transform') || (cs.transform !== 'none' && el.getBoundingClientRect().width > 300)) {
        const r = el.getBoundingClientRect();
        boards.push(`${cs.willChange.includes('transform') ? 'BOARD' : 'xform'} ${cs.transform} rect=${rectStr(r)} vis=${cs.visibility} op=${cs.opacity}`);
      }
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.5 || r.height < vh * 0.5) continue;
      const sig = `${describe(el)}|${rectStr(r)}`;
      currentOverlays.add(sig);
      const anim = cs.animationName !== 'none' ? ` anim=${cs.animationName} ps=${cs.animationPlayState} dur=${cs.animationDuration} delay=${cs.animationDelay}` : '';
      overlays.push(`z=${cs.zIndex} op=${cs.opacity} pe=${cs.pointerEvents} vis=${cs.visibility} bg=${cs.backgroundColor}${anim} ${el.tagName.toLowerCase()} rect=${rectStr(r)}`);
    }
    for (const sig of currentOverlays) if (!seenOverlays.has(sig)) { seenOverlays.add(sig); log(`overlay+ ${sig}`); }
    for (const sig of seenOverlays) if (!currentOverlays.has(sig)) { seenOverlays.delete(sig); log(`overlay- ${sig}`); }

    lines.push(`overlays(≥50% screen): ${overlays.length}`);
    for (const o of overlays.slice(0, 8)) lines.push(`  ${o}`);
    lines.push(`board/xform: ${boards.length}`);
    for (const b of boards.slice(0, 4)) lines.push(`  ${b}`);
    lines.push(`canvas: ${canvases.length ? canvases.join(' | ') : 'none'}`);

    try {
      const anims = document.getAnimations();
      const st: Record<string, number> = {};
      for (const a of anims) st[a.playState] = (st[a.playState] ?? 0) + 1;
      lines.push(`animations: ${anims.length} ${JSON.stringify(st)}`);
    } catch {
      lines.push('animations: n/a');
    }
    lines.push(`audio: ${audioCtxs.length ? audioCtxs.map((c, i) => `#${i + 1}=${c.state}`).join(' ') : 'none'}`);
    lines.push(`events(last ${events.length}):`);
    for (const e of events.slice().reverse()) lines.push(`  ${e}`);
    return lines.join('\n');
  };

  setInterval(() => {
    heartbeat++;
    if (paused) return;
    try {
      lastText = sample();
      pre.textContent = lastText;
    } catch (e) {
      pre.textContent = `diag sample failed: ${String(e)}`;
    }
  }, SAMPLE_MS);
}
