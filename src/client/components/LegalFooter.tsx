import { LEGAL_LINK_EXTERNAL_ATTRS, LEGAL_LINKS, LEGAL_OPERATOR_LABEL } from '../legalLinks';

export default function LegalFooter() {
  return (
    <footer style={{
      flexShrink: 0,
      padding: '6px 10px calc(6px + env(safe-area-inset-bottom))',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(10,10,30,0.96)',
      color: '#7a86a8',
      fontSize: 10,
      lineHeight: 1.45,
    }}>
      <div style={{
        maxWidth: 760,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '3px 10px',
        textAlign: 'center',
      }}>
        <span style={{ color: '#9aa6c8', fontWeight: 700 }}>{LEGAL_OPERATOR_LABEL}</span>
        {LEGAL_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            {...LEGAL_LINK_EXTERNAL_ATTRS}
            style={{ color: '#8fb8ff', textDecoration: 'none' }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </footer>
  );
}
