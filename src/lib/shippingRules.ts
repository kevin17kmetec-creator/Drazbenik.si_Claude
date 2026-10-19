// Deutscher Kommentar: Gemeinsame Versandregeln fuer Client und Server (kostenlos, ohne Tracking-API)

// Ab diesem Artikelpreis (EUR, exklusive Provision) ist eine Sendung mit Sendungsverfolgung Pflicht
export const TRACKING_REQUIRED_ABOVE_EUR = 20;

// Fruehester Zeitpunkt (in Tagen nach "versendet"), ab dem der Kaeufer "nicht angekommen" melden darf
export const NOT_RECEIVED_MIN_DAYS_DOMESTIC = 4;
export const NOT_RECEIVED_MIN_DAYS_CROSS_BORDER = 8;

// Frist (Stunden), in der der Verkaeufer bei "nicht angekommen" einen Nachweis liefern muss
export const SELLER_PROOF_HOURS = 48;

export type ShippingType = 'tracked' | 'untracked';

export interface CarrierOption {
  id: string;
  label: string;
}

export const CARRIERS: CarrierOption[] = [
  { id: 'posta_si', label: 'Pošta Slovenije' },
  { id: 'dpd', label: 'DPD' },
  { id: 'gls', label: 'GLS' },
  { id: 'express_one', label: 'Express One' },
  { id: 'overseas', label: 'Overseas Express' },
  { id: 'other', label: 'Drugo' }
];

export function getCarrierLabel(id?: string | null): string {
  return CARRIERS.find((c) => c.id === id)?.label || 'Drugo';
}

// Deutscher Kommentar: Nummer normalisieren (Leerzeichen und Bindestriche entfernen, Grossbuchstaben)
export function normalizeTrackingNumber(raw: string): string {
  return String(raw || '').replace(/[\s\-]/g, '').toUpperCase();
}

// UPU-S10-Format, z. B. RR123456789SI (2 Buchstaben, 9 Ziffern, 2 Buchstaben)
const S10 = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

// Deutscher Kommentar: Liefert einen Fehlertext (hart) oder eine Warnung (weich) fuer die eingegebene Nummer
export function checkTrackingNumber(carrierId: string, raw: string): { error?: string; warning?: string; normalized: string } {
  const normalized = normalizeTrackingNumber(raw);
  if (normalized.length < 8 || normalized.length > 34) {
    return { error: 'Sledilna številka mora imeti od 8 do 34 znakov.', normalized };
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return { error: 'Sledilna številka lahko vsebuje samo črke in številke.', normalized };
  }
  if (carrierId === 'posta_si' && !S10.test(normalized)) {
    return { warning: 'Oblika številke ni običajna za Pošto Slovenije (npr. RR123456789SI). Preverite vnos.', normalized };
  }
  return { normalized };
}

// Deutscher Kommentar: Kostenloser, anbieterneutraler Link zur oeffentlichen Sendungsverfolgung
export function getTrackingUrl(trackingNumber?: string | null): string | null {
  const n = normalizeTrackingNumber(trackingNumber || '');
  if (!n) return null;
  return `https://t.17track.net/en#nums=${encodeURIComponent(n)}`;
}

// Deutscher Kommentar: Ab dieser Anzahl "nicht angekommen"-Meldungen eines Kaeufers in 180 Tagen wird der Fall als auffaellig markiert
export const SUSPICIOUS_REPORTS_180D = 3;

// Deutscher Kommentar: Kurzer Versandhinweis fuer Karten und Detailansicht (null = nichts anzeigen, z. B. nur Abholung)
export function getShippingPriceLabel(item: any): string | null {
  const opt = item?.delivery_option;
  if (opt === 'pickup_only' || item?.delivery_method === 'pickup') return null;
  const cost = item?.shipping_cost;
  if (cost === undefined || cost === null || cost === '') {
    return item?.shipping_fee_type === 'calculated' ? 'Poštnina po tarifi pošte' : null;
  }
  const n = Number(cost);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 'Brezplačna poštnina';
  return `+ Poštnina €${n.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
