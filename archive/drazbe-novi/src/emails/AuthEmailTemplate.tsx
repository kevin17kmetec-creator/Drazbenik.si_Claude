import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Heading,
  Text,
  Button,
  Link,
  Preview,
} from '@react-email/components';

export type AuthEmailType = 'verify_email' | 'reset_password' | 'email_changed' | 'mfa_enrollment';

export interface AuthEmailProps {
  type: AuthEmailType;
  recipientName?: string;
  actionUrl?: string;
}

export const AuthEmailTemplate: React.FC<AuthEmailProps> = ({
  type = 'verify_email',
  recipientName = 'Uporabnik',
  actionUrl = 'https://drazbe.eu',
}) => {
  let previewText = '';
  let badgeText = '';
  let badgeBg = '#FEBA4F';
  let badgeColor = '#0A1128';
  let headline = '';
  let subheadline = '';
  let ctaText = '';
  let highlightNote = '';

  switch (type) {
    case 'verify_email':
      previewText = 'Potrdite svoj e-poštni naslov za dražbenik.si';
      badgeText = 'POTRDITEV E-POŠTE';
      badgeBg = '#3B82F6';
      badgeColor = '#FFFFFF';
      headline = 'Dobrodošli na dražbenik.si!';
      subheadline = 'Hvala za registracijo. Da bi lahko v celoti uporabljali platformo in sodelovali na dražbah, prosimo potrdite svoj e-poštni naslov.';
      ctaText = 'Potrdi e-poštni naslov';
      highlightNote = 'Povezava je veljavna omejen čas.';
      break;

    case 'reset_password':
      previewText = 'Ponastavitev gesla za vaš dražbenik.si račun';
      badgeText = 'PONASTAVITEV GESLA';
      badgeBg = '#EF4444';
      badgeColor = '#FFFFFF';
      headline = 'Zahteva za ponastavitev gesla';
      subheadline = 'Prejeli smo zahtevo za ponastavitev gesla vašega uporabniškega računa. Če ste to zahtevali vi, kliknite spodnji gumb za nastavitev novega gesla.';
      ctaText = 'Ponastavi geslo';
      highlightNote = 'Če te zahteve niste oddali vi, lahko to sporočilo varno ignorirate.';
      break;

    case 'email_changed':
      previewText = 'Vaš e-poštni naslov je bil spremenjen';
      badgeText = 'SPREMEMBA PODATKOV';
      badgeBg = '#10B981';
      badgeColor = '#FFFFFF';
      headline = 'Sprememba e-poštnega naslova';
      subheadline = 'Obveščamo vas, da je bil e-poštni naslov vašega računa uspešno spremenjen. Če ste to spremembo opravili vi, ni potrebna nobena nadaljnja akcija.';
      ctaText = 'Prijavi se z novim naslovom';
      highlightNote = 'Če te spremembe niste opravili vi, nemudoma kontaktirajte našo podporo.';
      break;

    case 'mfa_enrollment':
      previewText = 'Obvestilo o varnostnih nastavitvah računa (MFA)';
      badgeText = 'VARNOSTNO OBVESTILO';
      badgeBg = '#8B5CF6';
      badgeColor = '#FFFFFF';
      headline = 'Posodobitev varnostnih nastavitev';
      subheadline = 'Obveščamo vas o spremembi nastavitev dvostopenjske avtentikacije (MFA) na vašem uporabniškem računu. Vaš račun je zdaj dodatno zaščiten.';
      ctaText = 'Preglej nastavitve računa';
      highlightNote = 'Dvostopenjska avtentikacija močno izboljša varnost vašega računa.';
      break;
  }

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header & Logo */}
          <Section style={headerSection}>
            <Row>
              <Column align="center">
                <Text style={logoText}>
                  dražbenik<span style={logoAccent}>.si</span>
                </Text>
                <Text style={taglineText}>Slovenska dražbena platforma</Text>
              </Column>
            </Row>
          </Section>

          {/* Main Card */}
          <Section style={cardSection}>
            {/* Status Badge */}
            <Row>
              <Column align="center" style={{ paddingTop: '16px' }}>
                <span
                  style={{
                    ...badgeStyle,
                    backgroundColor: badgeBg,
                    color: badgeColor,
                  }}
                >
                  {badgeText}
                </span>
              </Column>
            </Row>

            {/* Headline */}
            <Heading style={headingStyle}>{headline}</Heading>
            <Text style={greetingText}>Pozdravljeni, {recipientName},</Text>
            <Text style={paragraphStyle}>{subheadline}</Text>

            {/* Notice / Highlight box */}
            {highlightNote && (
              <Section style={noticeBoxStyle}>
                <Text style={noticeTextStyle}>{highlightNote}</Text>
              </Section>
            )}

            {/* Call to Action Button */}
            <Section style={{ textAlign: 'center', marginTop: '28px', marginBottom: '24px' }}>
              <Button
                href={actionUrl}
                target="_blank"
                style={ctaButtonStyle}
              >
                {ctaText} →
              </Button>
            </Section>

            <Text style={securityNoticeStyle}>
              Če gumb ne deluje, kopirajte naslednjo povezavo v brskalnik:
              <br />
              <Link href={actionUrl} target="_blank" style={linkStyle}>
                {actionUrl}
              </Link>
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footerSection}>
            <Text style={footerText}>
              To je samodejno sistemsko obvestilo spletne platforme{' '}
              <Link href="https://drazbe.eu" target="_blank" style={footerLink}>
                dražbenik.si
              </Link>
              .
            </Text>
            <Text style={copyrightText}>
              © {new Date().getFullYear()} dražbenik.si. Vse pravice pridržane.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default AuthEmailTemplate;

// STYLES
const main: React.CSSProperties = {
  backgroundColor: '#050914',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
  margin: '0 auto',
  padding: '40px 10px',
};

const container: React.CSSProperties = {
  maxWidth: '580px',
  margin: '0 auto',
};

const headerSection: React.CSSProperties = {
  textAlign: 'center',
  paddingBottom: '24px',
};

const logoText: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: '900',
  color: '#FFFFFF',
  letterSpacing: '-0.5px',
  margin: '0',
  textTransform: 'lowercase',
};

const logoAccent: React.CSSProperties = {
  color: '#FEBA4F',
};

const taglineText: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: '700',
  color: '#94A3B8',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  margin: '4px 0 0 0',
};

const cardSection: React.CSSProperties = {
  backgroundColor: '#0A1128',
  borderRadius: '24px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  padding: '24px 28px',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 14px',
  borderRadius: '9999px',
  fontSize: '11px',
  fontWeight: '900',
  letterSpacing: '1px',
  textTransform: 'uppercase',
};

const headingStyle: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: '22px',
  fontWeight: '800',
  textAlign: 'center',
  margin: '16px 0 8px 0',
  letterSpacing: '-0.5px',
};

const greetingText: React.CSSProperties = {
  color: '#FEBA4F',
  fontSize: '14px',
  fontWeight: '700',
  margin: '16px 0 6px 0',
};

const paragraphStyle: React.CSSProperties = {
  color: '#CBD5E1',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 20px 0',
};

const noticeBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(254, 186, 79, 0.08)',
  borderRadius: '12px',
  border: '1px solid rgba(254, 186, 79, 0.25)',
  padding: '12px 16px',
  margin: '16px 0',
};

const noticeTextStyle: React.CSSProperties = {
  color: '#FEBA4F',
  fontSize: '12px',
  fontWeight: '600',
  margin: '0',
  textAlign: 'center',
};

const ctaButtonStyle: React.CSSProperties = {
  backgroundColor: '#FEBA4F',
  color: '#0A1128',
  padding: '16px 36px',
  borderRadius: '14px',
  fontSize: '14px',
  fontWeight: '900',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  textDecoration: 'none',
  display: 'inline-block',
  boxShadow: '0 8px 24px rgba(254, 186, 79, 0.35)',
};

const securityNoticeStyle: React.CSSProperties = {
  color: '#64748B',
  fontSize: '11px',
  textAlign: 'center',
  margin: '16px 0 0 0',
  lineHeight: '1.5',
};

const linkStyle: React.CSSProperties = {
  color: '#FEBA4F',
  textDecoration: 'underline',
  wordBreak: 'break-all',
};

const footerSection: React.CSSProperties = {
  textAlign: 'center',
  paddingTop: '24px',
};

const footerText: React.CSSProperties = {
  color: '#64748B',
  fontSize: '12px',
  margin: '0 0 6px 0',
};

const footerLink: React.CSSProperties = {
  color: '#94A3B8',
  textDecoration: 'underline',
};

const copyrightText: React.CSSProperties = {
  color: '#334155',
  fontSize: '11px',
  margin: '0',
};
