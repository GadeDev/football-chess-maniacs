export const LEGAL_OPERATOR_LABEL = '運営: 株式会社ゲイド(Universo Fútbol)';

export const LEGAL_LINKS = [
  { label: '利用規約', href: 'https://universo-futbol.com/terms' },
  { label: 'プライバシーポリシー', href: 'https://universo-futbol.com/privacy' },
  { label: '特定商取引法に基づく表記', href: 'https://universo-futbol.com/tokushoho' },
  { label: 'お問い合わせ', href: 'https://universo-futbol.com/contact' },
] as const;

export const LEGAL_LINK_EXTERNAL_ATTRS = {
  target: '_blank',
  rel: 'noopener',
} as const;

export const UNIVERSO_TERMS_NOTICE =
  '本ゲームは Universo Fútbol の一部として提供され、Universo Fútbol の利用規約が適用されます。';
