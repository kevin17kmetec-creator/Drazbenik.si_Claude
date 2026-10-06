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
  Img,
  Hr,
  Link,
  Preview,
} from '@react-email/components';

export type EmailType = 'outbid' | 'ending_soon' | 'won' | 'payment_reminder' | 'payment_success' | 'review_reminder' | 'payment_received_seller' | 'item_shipped_buyer' | 'item_delivered_buyer' | 'item_delivered_seller';

export interface AuctionEmailProps {
  type: EmailType;
  recipientName?: string;
  auctionTitle: string;
  auctionImageUrl?: string;
  currentPrice: number;
  originalPrice?: number;
  endTime?: string;
  paymentDeadline?: string;
  auctionUrl: string;
  paymentUrl?: string;
  settingsUrl?: string;
  bidDifference?: number;
  formattedAmount?: string;
  carrierName?: string;
  trackingNumber?: string;
}

export const AuctionEmailTemplate: React.FC<AuctionEmailProps> = ({
  type = 'outbid',
  recipientName = 'Uporabnik',
  auctionTitle = 'Predmet dražbe',
  auctionImageUrl,
  currentPrice = 0,
  originalPrice,
  endTime,
  paymentDeadline,
  auctionUrl = 'https://drazbe.eu',
  paymentUrl,
  settingsUrl = 'https://drazbe.eu/?tab=settings',
  bidDifference,
  formattedAmount,
  carrierName,
  trackingNumber,
}) => {
  const formattedPrice = formattedAmount || `€${Number(currentPrice || 0).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Determine subject/badge/text per type
  let previewText = '';
  let badgeText = '';
  let badgeBg = '#FEBA4F';
  let badgeColor = '#0A1128';
  let headline = '';
  let subheadline = '';
  let ctaText = 'Ogled dražbe';
  let ctaUrl = auctionUrl;
  let priceLabel = 'Trenutna cena:';
  let highlightNote = '';

  switch (type) {
    case 'outbid':
      previewText = `Vaša ponudba za "${auctionTitle}" je bila presežena!`;
      badgeText = 'PRESEŽENA PONUDBA';
      badgeBg = '#EF4444';
      badgeColor = '#FFFFFF';
      headline = 'Vaša ponudba je bila presežena!';
      subheadline = `Drug uporabnik je pravkar oddal višjo ponudbo za artikel "${auctionTitle}". Še vedno imate priložnost za zmago!`;
      ctaText = 'Oddaj novo ponudbo';
      ctaUrl = auctionUrl;
      priceLabel = 'Nova najvišja ponudba:';
      highlightNote = 'Dražba še traja. Ne dovolite, da vam izdelek uide!';
      break;

    case 'ending_soon':
      previewText = `Dražba "${auctionTitle}" se kmalu izteče (manj kot 30 min)!`;
      badgeText = 'ZADNJA PRILOŽNOST';
      badgeBg = '#FEBA4F';
      badgeColor = '#0A1128';
      headline = 'Dražba se kmalu izteče!';
      subheadline = `Dražba za "${auctionTitle}", ki jo spremljate, se bo zaključila v manj kot 30 minutah.`;
      ctaText = 'Sodeluj v zaključku';
      ctaUrl = auctionUrl;
      priceLabel = 'Trenutna cena:';
      highlightNote = 'Pripravite svojo ponudbo pred iztekom časa!';
      break;

    case 'won':
      previewText = `Čestitamo! Zmagali ste na dražbi za "${auctionTitle}"`;
      badgeText = 'ZMAGA NA DRAŽBI';
      badgeBg = '#10B981';
      badgeColor = '#FFFFFF';
      headline = 'Čestitamo, zmagali ste!';
      subheadline = `Uspešno ste zmagali na dražbi za "${auctionTitle}". Za dokončanje nakupa in prevzem prosimo poravnajte račun v roku 48 ur.`;
      ctaText = 'Pojdi na plačilo';
      ctaUrl = paymentUrl || `${auctionUrl}?tab=winnings`;
      priceLabel = 'Končna zmagovalna cena:';
      highlightNote = 'Rok za plačilo je 48 ur po zaključku dražbe.';
      break;

    case 'payment_reminder':
      previewText = `Pomemben opomnik: plačilo za "${auctionTitle}" poteče čez 2 uri!`;
      badgeText = 'OPOMNIK ZA PLAČILO';
      badgeBg = '#F59E0B';
      badgeColor = '#FFFFFF';
      headline = 'Rok za plačilo se kmalu izteče!';
      subheadline = `Obveščamo vas, da se rok za plačilo zmagovalne dražbe "${auctionTitle}" izteče v manj kot 2 urah.`;
      ctaText = 'Plačaj zdaj';
      ctaUrl = paymentUrl || `${auctionUrl}?tab=winnings`;
      priceLabel = 'Znesek za plačilo:';
      highlightNote = 'Po izteku roka se artikel lahko ponudi drugemu ponudniku, račun pa prejme opomin.';
      break;

    case 'payment_success':
      previewText = `Plačilo za "${auctionTitle}" je bilo uspešno obdelano.`;
      badgeText = 'PLAČILO USPEŠNO';
      badgeBg = '#10B981'; // Green
      badgeColor = '#FFFFFF';
      headline = 'Vaše plačilo je bilo uspešno!';
      subheadline = `Plačilo za dražbo "${auctionTitle}" je bilo uspešno obdelano. V priponki tega sporočila vam pošiljamo račun za opravljeno storitev ter potrdilo o nakupu (kupoprodajno pogodbo).`;
      ctaText = 'Status naročila';
      ctaUrl = auctionUrl || 'https://drazbe.eu';
      priceLabel = 'Plačan znesek:';
      highlightNote = 'Dokumenti so priloženi k temu sporočilu v PDF obliki.';
      break;

    case 'payment_received_seller':
      previewText = `Prejeto plačilo za vašo dražbo "${auctionTitle}"!`;
      badgeText = 'PREJETO PLAČILO';
      badgeBg = '#10B981';
      badgeColor = '#FFFFFF';
      headline = 'Imate novo plačilo!';
      subheadline = `Kupec je uspešno plačal za artikel "${auctionTitle}". Predmet morate odposlati ali predati v roku 7 dni. Sredstva so varno shranjena v escrow hrambi do potrditve prejema.`;
      ctaText = 'Status naročila';
      ctaUrl = auctionUrl || 'https://drazbe.eu';
      priceLabel = 'Prejeti znesek:';
      highlightNote = `Rok za odpremo: ${paymentDeadline || '7 dni'}.`;
      break;

    case 'item_shipped_buyer':
      previewText = `Vaš predmet "${auctionTitle}" je bil poslan!`;
      badgeText = 'PREDMET POSLAN';
      badgeBg = '#3B82F6'; // Blue
      badgeColor = '#FFFFFF';
      headline = 'Vaš predmet je na poti!';
      subheadline = `Prodajalec je označil, da je predmet "${auctionTitle}" oddan na pošto. ${carrierName ? `Prevoznik: ${carrierName}.` : ''} ${trackingNumber ? `Sledilna številka: ${trackingNumber}.` : ''}`;
      ctaText = 'Status naročila';
      ctaUrl = auctionUrl || 'https://drazbe.eu';
      priceLabel = 'Artikel:';
      highlightNote = 'Ko predmet prejmete, prosimo potrdite prejem na platformi.';
      break;

    case 'item_delivered_buyer':
      previewText = `Ste prejeli predmet "${auctionTitle}"? Potrdite prejem!`;
      badgeText = 'POTRDITE PREJEM';
      badgeBg = '#FEBA4F';
      badgeColor = '#0A1128';
      headline = 'Je predmet prispel?';
      subheadline = `Predmet "${auctionTitle}" bi moral biti že pri vas. Prosimo, da na platformi potrdite prejem, da lahko sprostimo izplačilo prodajalcu. V primeru težav lahko odprete spor.`;
      ctaText = 'Potrdi prejem';
      ctaUrl = auctionUrl || 'https://drazbe.eu';
      priceLabel = 'Artikel:';
      highlightNote = 'Če prejema ne potrdite ročno, se bo po določenem času potrdil samodejno.';
      break;

    case 'item_delivered_seller':
      previewText = `Prejem predmeta "${auctionTitle}" je bil potrjen!`;
      badgeText = 'PREJEM POTRJEN';
      badgeBg = '#10B981';
      badgeColor = '#FFFFFF';
      headline = 'Kupec je potrdil prejem!';
      subheadline = `Kupec je potrdil prejem predmeta "${auctionTitle}". Izplačilo na vaš Stripe račun bo sproženo samodejno čez 2 dni, če ne bo vloženih pritožb.`;
      ctaText = 'Status naročila';
      ctaUrl = auctionUrl || 'https://drazbe.eu';
      priceLabel = 'Znesek izplačila:';
      highlightNote = 'Sredstva bodo kmalu na vašem računu.';
      break;

    case 'review_reminder':
      previewText = `Kako ste zadovoljni z nakupom predmeta "${auctionTitle}"? Oddajte oceno!`;
      badgeText = 'OCENITE PRODAJALCA';
      badgeBg = '#FEBA4F';
      badgeColor = '#0A1128';
      headline = 'Kako ste zadovoljni z nakupom?';
      subheadline = `Minilo je 24 ur od potrditve prejema predmeta "${auctionTitle}". Vaša ocena in mnenje o prodajalcu sta izjemno pomembna za transparentnost in varnost celotne skupnosti.`;
      ctaText = 'Oddaj oceno prodajalca';
      ctaUrl = paymentUrl || `${auctionUrl}?tab=winnings`;
      priceLabel = 'Kupljen artikel:';
      highlightNote = 'Oddaja ocene vzame manj kot minuto (1–5 zvezdic ter po želji kratek komentar).';
      break;
  }

  const fallbackImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=60';
  const displayImage = auctionImageUrl || fallbackImage;

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

            {/* Auction Item Preview Card */}
            <Section style={itemCardStyle}>
              {displayImage && (
                <Img
                  src={displayImage}
                  alt={auctionTitle}
                  width="100%"
                  style={itemImageStyle}
                />
              )}

              <Section style={{ padding: '20px' }}>
                <Text style={itemTitleStyle}>{auctionTitle}</Text>

                <Hr style={dividerStyle} />

                <Row style={{ marginTop: '12px' }}>
                  <Column>
                    <Text style={priceLabelStyle}>{priceLabel}</Text>
                    <Text style={priceValueStyle}>{formattedPrice}</Text>
                  </Column>
                  {endTime && (
                    <Column align="right">
                      <Text style={priceLabelStyle}>Čas do konca:</Text>
                      <Text style={endTimeValueStyle}>{endTime}</Text>
                    </Column>
                  )}
                  {paymentDeadline && (
                    <Column align="right">
                      <Text style={priceLabelStyle}>Rok za plačilo:</Text>
                      <Text style={deadlineValueStyle}>{paymentDeadline}</Text>
                    </Column>
                  )}
                </Row>
              </Section>
            </Section>

            {/* Notice / Highlight box */}
            {highlightNote && (
              <Section style={noticeBoxStyle}>
                <Text style={noticeTextStyle}>{highlightNote}</Text>
              </Section>
            )}

            {/* Call to Action Button */}
            <Section style={{ textAlign: 'center', marginTop: '28px', marginBottom: '24px' }}>
              <Button
                href={ctaUrl}
                target="_blank"
                style={ctaButtonStyle}
              >
                {ctaText} →
              </Button>
            </Section>

            <Text style={securityNoticeStyle}>
              Če gumb ne deluje, kopirajte naslednjo povezavo v brskalnik:
              <br />
              <Link href={ctaUrl} target="_blank" style={linkStyle}>
                {ctaUrl}
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
            <Text style={footerSubText}>
              Nastavitve prejemanja e-poštnih obvestil lahko kadar koli uredite v svojem{' '}
              <Link href={settingsUrl} target="_blank" style={footerLink}>
                uporabniškem profilu
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

export default AuctionEmailTemplate;

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

const itemCardStyle: React.CSSProperties = {
  backgroundColor: '#111C3D',
  borderRadius: '18px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  overflow: 'hidden',
  margin: '16px 0',
};

const itemImageStyle: React.CSSProperties = {
  width: '100%',
  maxHeight: '220px',
  objectFit: 'cover',
  display: 'block',
  borderTopLeftRadius: '18px',
  borderTopRightRadius: '18px',
};

const itemTitleStyle: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: '16px',
  fontWeight: '800',
  margin: '0 0 8px 0',
  lineHeight: '1.4',
};

const dividerStyle: React.CSSProperties = {
  borderColor: 'rgba(255, 255, 255, 0.08)',
  margin: '12px 0',
};

const priceLabelStyle: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  margin: '0 0 2px 0',
};

const priceValueStyle: React.CSSProperties = {
  color: '#FEBA4F',
  fontSize: '22px',
  fontWeight: '900',
  margin: '0',
};

const endTimeValueStyle: React.CSSProperties = {
  color: '#F87171',
  fontSize: '14px',
  fontWeight: '800',
  margin: '0',
};

const deadlineValueStyle: React.CSSProperties = {
  color: '#FBBF24',
  fontSize: '14px',
  fontWeight: '800',
  margin: '0',
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

const footerSubText: React.CSSProperties = {
  color: '#475569',
  fontSize: '11px',
  margin: '0 0 12px 0',
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
