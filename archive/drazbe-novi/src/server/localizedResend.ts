import { Resend as BaseResend } from 'resend';
import { adminDb } from '../lib/firebase-admin';
import { translateText, normalizeLang } from '../lib/translateUi';

// Deutscher Kommentar: Resend-Client, der Betreff und HTML-Texte jeder E-Mail in der Hauptsprache des Empfaengers versendet

const langCache = new Map<string, { lang: string; at: number }>();
const CACHE_MS = 5 * 60 * 1000;

async function getRecipientLanguage(email: string): Promise<string> {
  const key = email.trim().toLowerCase();
  const hit = langCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.lang;
  let lang = 'SLO';
  try {
    const snap = await adminDb.collection('users').where('email', '==', email.trim()).limit(1).get();
    const doc: any = snap && snap.docs && snap.docs[0];
    const data = doc ? doc.data() : null;
    if (data?.preferred_language) lang = normalizeLang(data.preferred_language);
  } catch (e) {
    // Deutscher Kommentar: Bei Fehlern bleibt es bei Slowenisch
  }
  langCache.set(key, { lang, at: Date.now() });
  return lang;
}

const ENTITIES: Array<[RegExp, string]> = [
  [/&quot;/g, '"'],
  [/&#x27;|&#39;/g, "'"],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
];
const decode = (s: string) => ENTITIES.reduce((acc, [re, to]) => acc.replace(re, to), s);
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Deutscher Kommentar: Uebersetzt nur Textknoten zwischen Tags, Attribute und Styles bleiben unberuehrt
export function translateEmailHtml(html: string, lang: string): string {
  if (!html || normalizeLang(lang) === 'SLO') return html;
  const withoutStyle = html.split(/(<style[\s\S]*?<\/style>)/i);
  return withoutStyle
    .map((part) => {
      if (/^<style/i.test(part)) return part;
      return part.replace(/>([^<>]+)</g, (full, text: string) => {
        if (!text.trim()) return full;
        const decoded = decode(text);
        const translated = translateText(decoded, lang);
        return translated === decoded ? full : '>' + encode(translated) + '<';
      });
    })
    .join('');
}

async function localizePayload(payload: any): Promise<any> {
  try {
    const to = Array.isArray(payload?.to) ? payload.to[0] : payload?.to;
    if (!to || typeof to !== 'string') return payload;
    const email = (to.match(/<([^>]+)>/)?.[1] || to).trim();
    if (!email.includes('@')) return payload;
    const lang = await getRecipientLanguage(email);
    if (normalizeLang(lang) === 'SLO') return payload;
    const out = { ...payload };
    if (typeof out.subject === 'string') out.subject = translateText(out.subject, lang);
    if (typeof out.html === 'string') out.html = translateEmailHtml(out.html, lang);
    return out;
  } catch (e) {
    return payload;
  }
}

export class Resend extends BaseResend {
  constructor(key?: string) {
    super(key);
    const emails: any = (this as any).emails;
    if (emails && typeof emails.send === 'function') {
      const orig = emails.send.bind(emails);
      emails.send = async (payload: any, options?: any) => orig(await localizePayload(payload), options);
    }
  }
}
