import React from 'react';

export const LEGAL_TERMS_APPLICABILITY =
  '本ゲームは Universo Fútbol の一部として提供され、Universo Fútbol の利用規約が適用されます。';

export const LEGAL_LINKS = [
  { label: '利用規約', href: 'https://universo-futbol.com/terms' },
  { label: 'プライバシーポリシー', href: 'https://universo-futbol.com/privacy' },
  { label: '特定商取引法に基づく表記', href: 'https://universo-futbol.com/tokushoho' },
  { label: 'お問い合わせ', href: 'https://universo-futbol.com/contact' },
] as const;

export default function LegalFooter() {
  return (
    <footer style={footerStyle} aria-label="Legal links">
      <span style={operatorStyle}>運営: 株式会社ゲイド(Universo Fútbol)</span>
      <nav style={linksStyle}>
        {LEGAL_LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener" style={linkStyle}>
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}

const footerStyle: React.CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 6,
  transform: 'translateX(-50%)',
  zIndex: 5000,
  width: 'min(94vw, 720px)',
  padding: '6px 10px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(4, 6, 16, 0.72)',
  color: 'rgba(255,255,255,0.68)',
  fontSize: 10,
  lineHeight: 1.45,
  textAlign: 'center',
  pointerEvents: 'none',
  backdropFilter: 'blur(8px)',
};

const operatorStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 700,
};

const linksStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '2px 10px',
  marginTop: 2,
};

const linkStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.86)',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  pointerEvents: 'auto',
};
