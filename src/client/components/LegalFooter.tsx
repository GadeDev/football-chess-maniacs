import React from 'react';
import { t } from '../i18n';

export const LEGAL_TERMS_APPLICABILITY_KEY = 'legal.terms_applicability';

export const LEGAL_LINKS = [
  { labelKey: 'legal.terms', href: 'https://universo-futbol.com/terms' },
  { labelKey: 'legal.privacy', href: 'https://universo-futbol.com/privacy' },
  { labelKey: 'legal.commerce_disclosure', href: 'https://universo-futbol.com/tokushoho' },
  { labelKey: 'legal.contact', href: 'https://universo-futbol.com/contact' },
] as const;

export default function LegalFooter() {
  return (
    <footer style={footerStyle} aria-label={t('legal.links_aria')}>
      <span style={operatorStyle}>{t('legal.operator')}</span>
      <nav style={linksStyle}>
        {LEGAL_LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener" style={linkStyle}>
            {t(link.labelKey)}
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
