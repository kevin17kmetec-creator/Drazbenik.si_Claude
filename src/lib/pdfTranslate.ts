import { translateText, normalizeLang } from './translateUi';

// Deutscher Kommentar: Zusaetzliche Rechnungstexte (PDF) in EN/DE; {0} = Platzhalter fuer dynamische Teile
const PDF_DICT: Record<string, [string, string]> = {
  'Platforma za posredovanje': ['Intermediary platform', 'Vermittlungsplattform'],
  'Številka dokumenta:': ['Document number:', 'Dokumentnummer:'],
  'Kraj izdaje:': ['Place of issue:', 'Ausstellungsort:'],
  'Datum izdaje / sklenitve:': ['Date of issue / conclusion:', 'Ausstellungs- / Abschlussdatum:'],
  'Datum opravljene storitve/dobave:': ['Date of service / delivery:', 'Leistungs- / Lieferdatum:'],
  'Datum izdaje in opravljene storitve:': ['Date of issue and service:', 'Ausstellungs- und Leistungsdatum:'],
  'Identifikacija:': ['Identification:', 'Identifikation:'],
  'Kupnina / Znesek:': ['Purchase price / Amount:', 'Kaufpreis / Betrag:'],
  'Jamstvo za neskladnost blaga (ZVPot-1):': ['Warranty for non-conformity of goods (ZVPot-1):', 'Gewährleistung bei Vertragswidrigkeit der Ware (ZVPot-1):'],
  'Za blago veljajo zakonska jamstva za neskladnost blaga v skladu z ZVPot-1.': ['The goods are covered by the statutory warranties for non-conformity of goods under ZVPot-1.', 'Für die Ware gelten die gesetzlichen Gewährleistungsrechte nach ZVPot-1.'],
  'Prenos lastništva:': ['Transfer of ownership:', 'Eigentumsübergang:'],
  'Lastninska pravica in nevarnost naključnega uničenja preideta na kupca ob celotnem plačilu kupnine in prevzemu predmeta.': ['Ownership and the risk of accidental destruction pass to the buyer upon full payment of the purchase price and receipt of the item.', 'Eigentum und Gefahr des zufälligen Untergangs gehen mit vollständiger Zahlung des Kaufpreises und Übernahme des Gegenstands auf den Käufer über.'],
  'Pravna opomba in DDV:': ['Legal note and VAT:', 'Rechtlicher Hinweis und MwSt.:'],
  'DDV ni obračunan (prodajalec je fizična oseba).': ['VAT is not charged (the seller is a private individual).', 'Es wird keine MwSt. berechnet (Verkäufer ist eine Privatperson).'],
  'Obrnjena davčna obveznost / Reverse charge po Direktivi Sveta 2006/112/ES in 76. a členu ZDDV-1.': ['Reverse charge under Council Directive 2006/112/EC and Article 76a of ZDDV-1.', 'Umkehrung der Steuerschuldnerschaft (Reverse Charge) nach Richtlinie 2006/112/EG des Rates und Art. 76a ZDDV-1.'],
  'V ceno je vključen 22% DDV v skladu z Zakonom o davku na dodano vrednost (ZDDV-1).': ['The price includes 22% VAT in accordance with the Value Added Tax Act (ZDDV-1).', 'Im Preis sind 22 % MwSt. gemäß dem Mehrwertsteuergesetz (ZDDV-1) enthalten.'],
  'DDV ni obračunan na podlagi 1. odstavka 94. člena ZDDV-1 (mali davčni zavezanec).': ['VAT is not charged under Article 94(1) of ZDDV-1 (small taxable person).', 'Es wird keine MwSt. berechnet gemäß Art. 94 Abs. 1 ZDDV-1 (Kleinunternehmer).'],
  'Platforma dražbenik.si nastopa izključno kot tehnološki posrednik in ni stranka v prodajni pogodbi. Ta dokument služi kot kupoprodajna pogodba in potrdilo o sklenjenem poslu ter plačilu med prodajalcem in kupcem, generirano samodejno s strani sistema po uspešnem zaključku dražbe.': ['The dražbenik.si platform acts solely as a technology intermediary and is not a party to the sales contract. This document serves as the sales contract and as confirmation of the concluded transaction and payment between seller and buyer, generated automatically by the system after the successful completion of the auction.', 'Die Plattform dražbenik.si fungiert ausschließlich als technischer Vermittler und ist nicht Partei des Kaufvertrags. Dieses Dokument dient als Kaufvertrag sowie als Bestätigung des abgeschlossenen Geschäfts und der Zahlung zwischen Verkäufer und Käufer und wird nach erfolgreichem Abschluss der Auktion automatisch vom System erstellt.'],
  'IZDAJATELJ (PLATFORMA)': ['ISSUER (PLATFORM)', 'AUSSTELLER (PLATTFORM)'],
  'IZDAJATELJ (PRODAJALEC)': ['ISSUER (SELLER)', 'AUSSTELLER (VERKÄUFER)'],
  'PREJEMNIK (KUPEC)': ['RECIPIENT (BUYER)', 'EMPFÄNGER (KÄUFER)'],
  'PREJEMNIK STORITVE (KUPEC)': ['SERVICE RECIPIENT (BUYER)', 'LEISTUNGSEMPFÄNGER (KÄUFER)'],
  'NAROČNIK / PREJEMNIK RAČUNA': ['CUSTOMER / INVOICE RECIPIENT', 'AUFTRAGGEBER / RECHNUNGSEMPFÄNGER'],
  'Davčna številka: {0}': ['Tax number: {0}', 'Steuernummer: {0}'],
  'Matična številka: {0}': ['Registration number: {0}', 'Handelsregisternummer: {0}'],
  'E-pošta: {0}': ['Email: {0}', 'E-Mail: {0}'],
  'Ni navedena': ['Not provided', 'Nicht angegeben'],
  'OPIS': ['DESCRIPTION', 'BESCHREIBUNG'],
  'OPIS STORITVE': ['SERVICE DESCRIPTION', 'LEISTUNGSBESCHREIBUNG'],
  'KOLIČINA': ['QUANTITY', 'MENGE'],
  'CENA (€)': ['PRICE (€)', 'PREIS (€)'],
  'SKUPAJ (€)': ['TOTAL (€)', 'GESAMT (€)'],
  'OSNOVA (€)': ['BASE (€)', 'BASIS (€)'],
  'Osnova za DDV (22%):': ['VAT base (22%):', 'MwSt.-Bemessungsgrundlage (22 %):'],
  'Osnova za DDV:': ['VAT base:', 'MwSt.-Bemessungsgrundlage:'],
  'Znesek DDV (22%):': ['VAT amount (22%):', 'MwSt.-Betrag (22 %):'],
  'DDV:': ['VAT:', 'MwSt.:'],
  'DDV (22%):': ['VAT (22%):', 'MwSt. (22 %):'],
  'DDV (Obrnjena davčna obv.):': ['VAT (Reverse charge):', 'MwSt. (Reverse Charge):'],
  'DDV / VAT ({0}%):': ['VAT ({0}%):', 'MwSt. ({0} %):'],
  'SKUPAJ PROVIZIJA:': ['TOTAL COMMISSION:', 'PROVISION GESAMT:'],
  'Številka računa:': ['Invoice number:', 'Rechnungsnummer:'],
  'Obračunsko obdobje naročnine:': ['Subscription billing period:', 'Abrechnungszeitraum des Abonnements:'],
  'Način plačila:': ['Payment method:', 'Zahlungsart:'],
  'Status plačila:': ['Payment status:', 'Zahlungsstatus:'],
  'Spletno plačilo / Kartica': ['Online payment / Card', 'Online-Zahlung / Karte'],
  'Provizija platforme za uporabo sistema': ['Platform commission for using the system', 'Plattformprovision für die Nutzung des Systems'],
  '1 mesec': ['1 month', '1 Monat'],
  'Dizain d.o.o. je registriran izdajatelj računa za posredniške storitve platforme dražbenik.si. V ceno storitve je vključen 22% DDV.': ['Dizain d.o.o. is the registered issuer of invoices for the intermediary services of the dražbenik.si platform. The service price includes 22% VAT.', 'Die Dizain d.o.o. ist der registrierte Rechnungsaussteller für die Vermittlungsleistungen der Plattform dražbenik.si. Im Preis der Leistung sind 22 % MwSt. enthalten.'],
  'Dokument je generiran elektronsko in je veljaven brez žiga ali podpisa v skladu z ZZEPA ter 84. členom Zakona o davku na dodano vrednost (ZDDV-1).': ['This document was generated electronically and is valid without a stamp or signature in accordance with ZZEPA and Article 84 of the Value Added Tax Act (ZDDV-1).', 'Dieses Dokument wurde elektronisch erstellt und ist gemäß ZZEPA und Art. 84 des Mehrwertsteuergesetzes (ZDDV-1) ohne Stempel oder Unterschrift gültig.'],
  'Dokument je bil izdan elektronsko s strani platforme dražbenik.si / drazbe.si in je pravno veljaven brez podpisa in žiga. Za morebitna vprašanja glede naročnine se obrnite na info@drazbenik.si.': ['This document was issued electronically by the dražbenik.si / drazbe.si platform and is legally valid without a signature or stamp. For any questions about the subscription, contact info@drazbenik.si.', 'Dieses Dokument wurde elektronisch von der Plattform dražbenik.si / drazbe.si ausgestellt und ist ohne Unterschrift und Stempel rechtsgültig. Bei Fragen zum Abonnement wenden Sie sich an info@drazbenik.si.'],
  '{0} je davčni zavezanec za DDV v Sloveniji (ID za DDV: {1}). Obrnjena davčna obveznost / Reverse charge po Direktivi Sveta 2006/112/ES in 76. a členu ZDDV-1.': ['{0} is a VAT taxable person in Slovenia (VAT ID: {1}). Reverse charge under Council Directive 2006/112/EC and Article 76a of ZDDV-1.', '{0} ist in Slowenien mehrwertsteuerpflichtig (USt-IdNr.: {1}). Umkehrung der Steuerschuldnerschaft (Reverse Charge) nach Richtlinie 2006/112/EG des Rates und Art. 76a ZDDV-1.'],
  '{0} je davčni zavezanec za DDV v Sloveniji (ID za DDV: {1}). V ceno storitve je vključen 22% DDV v skladu z Zakonom o davku na dodano vrednost (ZDDV-1).': ['{0} is a VAT taxable person in Slovenia (VAT ID: {1}). The service price includes 22% VAT in accordance with the Value Added Tax Act (ZDDV-1).', '{0} ist in Slowenien mehrwertsteuerpflichtig (USt-IdNr.: {1}). Im Preis der Leistung sind 22 % MwSt. gemäß dem Mehrwertsteuergesetz (ZDDV-1) enthalten.'],
  '{0}, Slovenija': ['{0}, Slovenia', '{0}, Slowenien'],
};

type Pat = { re: RegExp; t: [string, string]; n: number };
const exact = new Map<string, [string, string]>();
const pats: Pat[] = [];
for (const [sl, t] of Object.entries(PDF_DICT)) {
  if (/\{\d+\}/.test(sl)) {
    const parts = sl.split(/\{\d+\}/);
    pats.push({ re: new RegExp('^' + parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$', 's'), t, n: parts.length - 1 });
  } else {
    exact.set(sl.trim(), t);
  }
}
pats.sort((a, b) => b.re.source.length - a.re.source.length);

export function translatePdfText(text: string, lang: string): string {
  const L = normalizeLang(lang);
  if (L === 'SLO' || typeof text !== 'string' || !text) return text;
  const i = L === 'EN' ? 0 : 1;
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.match(/\s*$/)?.[0] ?? '';
  const core = text.trim();
  const e = exact.get(core);
  if (e) return lead + e[i] + trail;
  for (const p of pats) {
    const m = core.match(p.re);
    if (m) {
      let out = p.t[i];
      for (let k = 1; k <= p.n; k++) out = out.split('{' + (k - 1) + '}').join(exact.get(m[k].trim())?.[i] ?? m[k]);
      return lead + out + trail;
    }
  }
  return translateText(text, lang);
}

// Deutscher Kommentar: Ueberschreibt doc.text so, dass jeder Text vor der Ausgabe uebersetzt wird
export function applyPdfLanguage(doc: any, lang?: string | null): void {
  const L = normalizeLang(lang);
  if (L === 'SLO') return;
  const orig = doc.text.bind(doc);
  doc.text = (text: any, ...rest: any[]) => orig(typeof text === 'string' ? translatePdfText(text, L) : text, ...rest);
}
