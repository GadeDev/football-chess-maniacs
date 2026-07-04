import { describe, expect, it } from 'vitest';
import { LEGAL_LINK_EXTERNAL_ATTRS, LEGAL_LINKS, LEGAL_OPERATOR_LABEL } from '../../legalLinks';

describe('legal links', () => {
  it('uses the shared Universo Futbol legal pages', () => {
    expect(LEGAL_OPERATOR_LABEL).toContain('株式会社ゲイド');
    expect(LEGAL_LINKS).toEqual([
      { label: '利用規約', href: 'https://universo-futbol.com/terms' },
      { label: 'プライバシーポリシー', href: 'https://universo-futbol.com/privacy' },
      { label: '特定商取引法に基づく表記', href: 'https://universo-futbol.com/tokushoho' },
      { label: 'お問い合わせ', href: 'https://universo-futbol.com/contact' },
    ]);
  });

  it('opens legal links in a separate tab without opener access', () => {
    expect(LEGAL_LINK_EXTERNAL_ATTRS).toEqual({
      target: '_blank',
      rel: 'noopener',
    });
  });
});
