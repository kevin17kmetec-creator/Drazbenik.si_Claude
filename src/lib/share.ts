// Deutscher Kommentar: Hilfsfunktionen zum Teilen einer Auktion (Link zeigt auf die serverseitig mit Meta-Tags/OG-Bild gerenderte Seite)
import { AuctionItem } from '../types';

const DETAIL_PATH: Record<string, string> = { SLO: '/drazba', EN: '/en/auction', DE: '/de/auktion' };

export const buildAuctionShareUrl = (auctionId: string, language: string): string => {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const path = DETAIL_PATH[language] || DETAIL_PATH.SLO;
  return `${base}${path}?id=${encodeURIComponent(auctionId)}`;
};

export const buildAuctionShareText = (item: AuctionItem, language: string): { title: string; text: string } => {
  const title = item.title?.[language] || item.title?.SLO || 'Dražba';
  const price = Number(item.currentBid);
  const priceStr = Number.isFinite(price) && price > 0
    ? ` – ${price.toLocaleString(language === 'DE' ? 'de-DE' : language === 'EN' ? 'en-GB' : 'sl-SI', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`
    : '';
  return { title, text: `${title}${priceStr} | Dražbenik.si` };
};

export const copyToClipboard = async (value: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* Fallback unten */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

export interface ShareTarget {
  id: 'whatsapp' | 'viber' | 'messenger' | 'facebook' | 'instagram' | 'telegram' | 'x' | 'email';
  label: string;
  href: string;
  color: string;
  // Deutscher Kommentar: "copy" = Instagram bietet keinen Web-Share-Link, daher Link kopieren und Instagram oeffnen
  kind: 'link' | 'copy';
}

export const SHARE_TARGETS = (url: string, text: string, isTouch = false): ShareTarget[] => {
  const u = encodeURIComponent(url);
  const tx = encodeURIComponent(text);
  const both = encodeURIComponent(`${text} ${url}`);
  const list: ShareTarget[] = [
    { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${both}`, color: '#25D366', kind: 'link' },
    { id: 'viber', label: 'Viber', href: `viber://forward?text=${both}`, color: '#7360F2', kind: 'link' },
    { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, color: '#1877F2', kind: 'link' },
    { id: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/', color: '#E1306C', kind: 'copy' },
    { id: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${tx}`, color: '#229ED9', kind: 'link' },
    { id: 'x', label: 'X', href: `https://twitter.com/intent/tweet?url=${u}&text=${tx}`, color: '#000000', kind: 'link' },
    { id: 'email', label: 'E-mail', href: `mailto:?subject=${tx}&body=${both}`, color: '#64748B', kind: 'link' },
  ];
  if (isTouch) {
    // Messenger-App-Link funktioniert nur auf Mobilgeraeten mit installierter App
    list.splice(2, 0, { id: 'messenger', label: 'Messenger', href: `fb-messenger://share/?link=${u}`, color: '#0A7CFF', kind: 'link' });
  }
  return list;
};
