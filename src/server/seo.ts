// Deutscher Kommentar: Serverseitiges SEO. Die App ist eine SPA; damit Suchmaschinen und Link-Vorschauen (Facebook, Viber, WhatsApp, LinkedIn)
// pro Auktion/Kategorie den richtigen Titel, die Beschreibung, das Bild und strukturierte Daten sehen, wird das HTML hier vor der Auslieferung angereichert.
// Indexiert wird nur, wenn SITE_URL gesetzt ist und der Aufruf ueber genau diese Domain kommt (Testdomains bleiben auf noindex).
import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { adminDb } from '../lib/firebase-admin';
import { Category } from '../types';
import { CATEGORY_URL_MAP } from '../lib/urlMaps';
import { translateText } from '../lib/translateUi';

type Lang = 'SLO' | 'EN' | 'DE';

const PATHS = {
  home: { SLO: '/', EN: '/en', DE: '/de' },
  grid: { SLO: '/drazbe', EN: '/en/auctions', DE: '/de/auktionen' },
  detail: { SLO: '/drazba', EN: '/en/auction', DE: '/de/auktion' }
} as const;
const CATEGORY_PARAM: Record<Lang, string> = { SLO: 'kategorija', EN: 'category', DE: 'kategorie' };
const HREFLANG: Record<Lang, string> = { SLO: 'sl', EN: 'en', DE: 'de' };
const OG_LOCALE: Record<Lang, string> = { SLO: 'sl_SI', EN: 'en_US', DE: 'de_DE' };

const esc = (s: any): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonLd = (obj: any): string => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const clip = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};

function pick(v: any, lang: Lang): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return String(v[lang] || v.SLO || v.EN || v.DE || Object.values(v)[0] || '');
  return '';
}

// Deutscher Kommentar: Ermittelt Basis-URL und ob indexiert werden darf
export function siteInfo(req: Request): { base: string; indexable: boolean } {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  const siteUrl = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (siteUrl) {
    let siteHost = '';
    try { siteHost = new URL(siteUrl).host.toLowerCase(); } catch { /* ungueltig */ }
    const strip = (h: string) => h.replace(/^www\./, '');
    if (siteHost && strip(siteHost) === strip(host)) return { base: siteUrl, indexable: true };
  }
  return { base: `https://${host || 'localhost'}`, indexable: false };
}

function langFromPath(p: string): Lang {
  if (p === '/en' || p.startsWith('/en/')) return 'EN';
  if (p === '/de' || p.startsWith('/de/')) return 'DE';
  return 'SLO';
}

let templateCache: { html: string; at: number } | null = null;
async function loadTemplate(req: Request): Promise<string | null> {
  if (templateCache && Date.now() - templateCache.at < 10 * 60 * 1000) return templateCache.html;
  const candidates = [
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(process.cwd(), 'index.html'),
    '/var/task/dist/index.html'
  ];
  for (const c of candidates) {
    try {
      const html = fs.readFileSync(c, 'utf8');
      // Deutscher Kommentar: Nur das gebaute index.html verwenden (enthaelt die Skript-Tags der Produktion), nicht das Entwicklungs-Template
      if (html.includes('<div id="root"') && /<script[^>]+src=/.test(html)) {
        templateCache = { html, at: Date.now() };
        return html;
      }
    } catch { /* naechster Kandidat */ }
  }
  try {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (host) {
      const r = await fetch(`https://${host}/index.html`);
      if (r.ok) {
        const html = await r.text();
        if (html.includes('<div id="root"')) {
          templateCache = { html, at: Date.now() };
          return html;
        }
      }
    }
  } catch { /* kein Fallback moeglich */ }
  return null;
}

interface HeadData {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  ogType?: string;
  lang: Lang;
  noindex?: boolean;
  alternates?: Partial<Record<Lang, string>>;
  jsonLd?: any[];
  noscript?: string;
}

function injectHead(template: string, d: HeadData): string {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<meta\s+name="description"[^>]*>/i, '');
  // Deutscher Kommentar: Statische Standard-Tags aus index.html entfernen, damit keine doppelten (Logo-)Vorschaubilder entstehen
  html = html.replace(/<meta\s+property="og:(title|description|type|image|site_name|locale|url)"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="twitter:[a-z:_]+"[^>]*>/gi, '');
  html = html.replace(/<meta\s+name="robots"[^>]*>/gi, '');
  html = html.replace(/<html lang="[^"]*"/i, `<html lang="${HREFLANG[d.lang]}"`);
  const tags: string[] = [];
  tags.push(`<title>${esc(d.title)}</title>`);
  tags.push(`<meta name="description" content="${esc(d.description)}">`);
  tags.push(`<meta name="robots" content="${d.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}">`);
  if (d.canonical) tags.push(`<link rel="canonical" href="${esc(d.canonical)}">`);
  if (d.alternates && !d.noindex) {
    for (const l of ['SLO', 'EN', 'DE'] as Lang[]) {
      if (d.alternates[l]) tags.push(`<link rel="alternate" hreflang="${HREFLANG[l]}" href="${esc(d.alternates[l])}">`);
    }
    if (d.alternates.SLO) tags.push(`<link rel="alternate" hreflang="x-default" href="${esc(d.alternates.SLO)}">`);
  }
  tags.push(`<meta property="og:title" content="${esc(d.title)}">`);
  tags.push(`<meta property="og:description" content="${esc(d.description)}">`);
  tags.push(`<meta property="og:type" content="${d.ogType || 'website'}">`);
  tags.push(`<meta property="og:locale" content="${OG_LOCALE[d.lang]}">`);
  tags.push(`<meta property="og:site_name" content="Dražbenik.si">`);
  if (d.canonical) tags.push(`<meta property="og:url" content="${esc(d.canonical)}">`);
  const ogImage = d.image || 'https://drazbenik.si/brand/logo.png';
  tags.push(`<meta property="og:image" content="${esc(ogImage)}">`);
  tags.push(`<meta property="og:image:alt" content="${esc(d.title)}">`);
  tags.push(`<meta name="twitter:card" content="${d.image ? 'summary_large_image' : 'summary'}">`);
  tags.push(`<meta name="twitter:title" content="${esc(d.title)}">`);
  tags.push(`<meta name="twitter:description" content="${esc(d.description)}">`);
  tags.push(`<meta name="twitter:image" content="${esc(ogImage)}">`);
  for (const ld of d.jsonLd || []) tags.push(`<script type="application/ld+json">${jsonLd(ld)}</script>`);
  html = html.replace('</head>', tags.join('\n    ') + '\n</head>');
  if (d.noscript) html = html.replace(/<body([^>]*)>/i, (m) => `${m}\n<noscript>${d.noscript}</noscript>`);
  return html;
}

function sendHtml(res: Response, html: string, cacheSeconds: number) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 6}`);
  res.status(200).send(html);
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(n);
}

const SAFE_ID = /^[A-Za-z0-9_-]{6,64}$/;

export function categoryFromParam(value: string, lang: Lang): Category | null {
  const v = (value || '').toLowerCase();
  for (const [cat, map] of Object.entries(CATEGORY_URL_MAP)) {
    if ((map as any)[lang] === v || (map as any).SLO === v) return cat as Category;
  }
  return null;
}

export function registerSeoRoutes(app: Express) {
  // robots.txt
  app.get('/robots.txt', (req, res) => {
    const { base, indexable } = siteInfo(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    if (!indexable) {
      return res.send('User-agent: *\nDisallow: /\n');
    }
    const priv = [
      '/api/', '/admin', '/en/admin', '/de/admin',
      '/prijava', '/en/login', '/de/anmelden', '/verifikacija', '/en/verification', '/de/verifizierung',
      '/nastavitve', '/en/settings', '/de/einstellungen', '/sporocila', '/en/messages', '/de/nachrichten',
      '/narocnine', '/en/subscriptions', '/de/abonnements', '/ustvari-drazbo', '/en/create-auction', '/de/auktion-erstellen',
      '/moje-zmage', '/en/my-winnings', '/de/meine-gewinne', '/moje-ponudbe', '/en/my-bids', '/de/meine-gebote',
      '/prodano', '/en/my-sold', '/de/verkauft', '/neprodano', '/en/my-unsold', '/de/unverkauft',
      '/seznam-zelja', '/en/watchlist', '/de/beobachtungsliste', '/zadnja-priloznost', '/stripe-callback.html'
    ];
    res.send(['User-agent: *', 'Allow: /', ...priv.map(p => `Disallow: ${p}`), '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n'));
  });

  // sitemap.xml
  app.get('/sitemap.xml', async (req, res) => {
    const { base, indexable } = siteInfo(req);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
    if (!indexable) {
      return res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
    const langs: Lang[] = ['SLO', 'EN', 'DE'];
    const urls: Array<{ loc: Record<Lang, string>; lastmod?: string; priority: string; changefreq: string }> = [];
    const mk = (fn: (l: Lang) => string) => ({ SLO: base + fn('SLO'), EN: base + fn('EN'), DE: base + fn('DE') }) as Record<Lang, string>;
    urls.push({ loc: mk(l => (PATHS.home[l] === '/' ? '/' : PATHS.home[l])), priority: '1.0', changefreq: 'daily' });
    urls.push({ loc: mk(l => PATHS.grid[l]), priority: '0.9', changefreq: 'hourly' });
    for (const cat of Object.keys(CATEGORY_URL_MAP) as Category[]) {
      urls.push({ loc: mk(l => `${PATHS.grid[l]}?${CATEGORY_PARAM[l]}=${CATEGORY_URL_MAP[cat][l]}`), priority: '0.8', changefreq: 'daily' });
    }
    try {
      const snap = await adminDb.collection('auctions').where('status', '==', 'active').limit(2000).get();
      for (const doc of snap.docs) {
        const a: any = doc.data() || {};
        if (a.is_package === true && !a.package_id) continue;
        const lm = typeof a.created_at === 'string' ? a.created_at.slice(0, 10) : undefined;
        urls.push({ loc: mk(l => `${PATHS.detail[l]}?id=${encodeURIComponent(doc.id)}`), lastmod: lm, priority: '0.7', changefreq: 'hourly' });
      }
    } catch (e: any) {
      console.error('[seo] sitemap auctions failed:', e?.message);
    }
    const xml: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
    for (const u of urls) {
      for (const l of langs) {
        xml.push('<url>');
        xml.push(`<loc>${esc(u.loc[l])}</loc>`);
        for (const l2 of langs) xml.push(`<xhtml:link rel="alternate" hreflang="${HREFLANG[l2]}" href="${esc(u.loc[l2])}"/>`);
        xml.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${esc(u.loc.SLO)}"/>`);
        if (u.lastmod) xml.push(`<lastmod>${u.lastmod}</lastmod>`);
        xml.push(`<changefreq>${u.changefreq}</changefreq>`, `<priority>${u.priority}</priority>`, '</url>');
      }
    }
    xml.push('</urlset>');
    res.send(xml.join('\n'));
  });

  // Auktionsseite: /drazba?id=..., /en/auction?id=..., /de/auktion?id=...
  app.get(['/drazba', '/en/auction', '/de/auktion'], async (req, res) => {
    const template = await loadTemplate(req);
    if (!template) return res.status(500).send('Template unavailable');
    const lang = langFromPath(req.path);
    const { base, indexable } = siteInfo(req);
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    let head: HeadData = { title: 'Dražbenik.si', description: '', lang, noindex: true };
    try {
      if (SAFE_ID.test(id)) {
        const snap = await adminDb.collection('auctions').doc(id).get();
        const a: any = snap && (typeof (snap as any).exists === 'function' ? (snap as any).exists() : (snap as any).exists) ? snap.data() : null;
        if (a && a.status === 'active') {
          const title = clip(pick(a.title, lang) || 'Dražba', 70);
          const desc = clip(pick(a.description, lang), 150);
          const price = Number(a.current_price ?? 0);
          const endIso = typeof a.end_time === 'string' ? a.end_time : '';
          const endDate = endIso ? new Date(endIso) : null;
          const endTxt = endDate && !isNaN(endDate.getTime()) ? endDate.toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '';
          const priceLine = lang === 'SLO' ? `Trenutna cena ${formatEuro(price)}${endTxt ? `, konec dražbe ${endTxt}` : ''}.`
            : lang === 'DE' ? `Aktueller Preis ${formatEuro(price)}${endTxt ? `, Auktionsende ${endTxt}` : ''}.`
            : `Current price ${formatEuro(price)}${endTxt ? `, auction ends ${endTxt}` : ''}.`;
          const description = clip(`${priceLine} ${desc}`, 158);
          const images: string[] = (Array.isArray(a.images) ? a.images : []).filter((u: any) => typeof u === 'string' && u.startsWith('https://')).slice(0, 5);
          const canonical = `${base}${PATHS.detail[lang]}?id=${encodeURIComponent(id)}`;
          const alternates: Partial<Record<Lang, string>> = {
            SLO: `${base}${PATHS.detail.SLO}?id=${encodeURIComponent(id)}`,
            EN: `${base}${PATHS.detail.EN}?id=${encodeURIComponent(id)}`,
            DE: `${base}${PATHS.detail.DE}?id=${encodeURIComponent(id)}`
          };
          head = {
            title: `${title} | Dražbenik.si`,
            description,
            canonical,
            image: images[0],
            ogType: 'product',
            lang,
            noindex: !indexable,
            alternates,
            jsonLd: [{
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: title,
              description: clip(pick(a.description, lang), 500) || title,
              sku: id,
              ...(images.length ? { image: images } : {}),
              ...(typeof a.category === 'string' ? { category: lang === 'SLO' ? a.category : translateText(a.category, lang) } : {}),
              offers: {
                '@type': 'Offer',
                url: canonical,
                priceCurrency: 'EUR',
                price: price.toFixed(2),
                availability: 'https://schema.org/InStock',
                ...(endDate && !isNaN(endDate.getTime()) ? { priceValidUntil: endDate.toISOString().slice(0, 10) } : {})
              }
            }],
            noscript: `<h1>${esc(title)}</h1><p>${esc(description)}</p><p><a href="${esc(base + PATHS.grid[lang])}">Dražbenik.si</a></p>`
          };
        }
      }
    } catch (e: any) {
      console.error('[seo] auction page failed:', e?.message);
    }
    if (!head.description) {
      // Deutscher Kommentar: Auktion nicht aktiv/nicht gefunden - Seite normal ausliefern, aber nicht indexieren
      head = { title: 'Dražbenik.si', description: 'Dražbenik.si - spletne dražbe v Sloveniji.', lang, noindex: true };
    }
    sendHtml(res, injectHead(template, head), head.noindex ? 60 : 300);
  });

  // Kategorie-Seite: /drazbe?kategorija=..., /en/auctions?category=..., /de/auktionen?kategorie=...
  app.get(['/drazbe', '/en/auctions', '/de/auktionen'], async (req, res) => {
    const template = await loadTemplate(req);
    if (!template) return res.status(500).send('Template unavailable');
    const lang = langFromPath(req.path);
    const { base, indexable } = siteInfo(req);
    const raw = req.query[CATEGORY_PARAM[lang]];
    const catParam = typeof raw === 'string' && !raw.includes(',') ? raw : '';
    const cat = catParam ? categoryFromParam(catParam, lang) : null;
    let head: HeadData;
    if (cat) {
      const label = lang === 'SLO' ? cat : translateText(cat, lang);
      let items: Array<{ id: string; title: string }> = [];
      try {
        const snap = await adminDb.collection('auctions').where('status', '==', 'active').where('category', '==', cat).limit(24).get();
        items = snap.docs.map((d: any) => ({ id: d.id, title: clip(pick((d.data() || {}).title, lang), 90) })).filter(i => i.title);
      } catch (e: any) {
        console.error('[seo] category page failed:', e?.message);
      }
      const t = lang === 'SLO' ? `${label} – spletne dražbe | Dražbenik.si` : lang === 'DE' ? `${label} – Online-Auktionen | Dražbenik.si` : `${label} – online auctions | Dražbenik.si`;
      const d = lang === 'SLO' ? `Aktivne dražbe v kategoriji ${label}. Licitirajte varno: plačilo je zadržano, dokler prejmete predmet. Dražbenik.si.`
        : lang === 'DE' ? `Aktive Auktionen in der Kategorie ${label}. Sicher bieten: Die Zahlung wird bis zum Erhalt des Artikels zurückgehalten. Dražbenik.si.`
        : `Active auctions in the ${label} category. Bid safely: your payment is held until you receive the item. Dražbenik.si.`;
      const canonical = `${base}${PATHS.grid[lang]}?${CATEGORY_PARAM[lang]}=${CATEGORY_URL_MAP[cat][lang]}`;
      const alternates: Partial<Record<Lang, string>> = {
        SLO: `${base}${PATHS.grid.SLO}?${CATEGORY_PARAM.SLO}=${CATEGORY_URL_MAP[cat].SLO}`,
        EN: `${base}${PATHS.grid.EN}?${CATEGORY_PARAM.EN}=${CATEGORY_URL_MAP[cat].EN}`,
        DE: `${base}${PATHS.grid.DE}?${CATEGORY_PARAM.DE}=${CATEGORY_URL_MAP[cat].DE}`
      };
      const list = items.map(i => `<li><a href="${esc(`${base}${PATHS.detail[lang]}?id=${encodeURIComponent(i.id)}`)}">${esc(i.title)}</a></li>`).join('');
      head = {
        title: t, description: d, canonical, lang, noindex: !indexable, alternates,
        noscript: `<h1>${esc(label)}</h1><p>${esc(d)}</p>${list ? `<ul>${list}</ul>` : ''}`
      };
    } else {
      const t = lang === 'SLO' ? 'Spletne dražbe v Sloveniji | Dražbenik.si' : lang === 'DE' ? 'Online-Auktionen in Slowenien | Dražbenik.si' : 'Online auctions in Slovenia | Dražbenik.si';
      const d = lang === 'SLO' ? 'Vse aktivne dražbe na enem mestu: vozila, stroji, oprema, umetnine in več. Varno plačilo z zadržanjem sredstev do prejema.'
        : lang === 'DE' ? 'Alle aktiven Auktionen an einem Ort: Fahrzeuge, Maschinen, Ausrüstung, Kunst und mehr. Sichere Zahlung mit Treuhand bis zum Erhalt.'
        : 'All active auctions in one place: vehicles, machinery, equipment, art and more. Safe payment held in escrow until delivery.';
      head = {
        title: t, description: d, canonical: `${base}${PATHS.grid[lang]}`, lang, noindex: !indexable,
        alternates: { SLO: `${base}${PATHS.grid.SLO}`, EN: `${base}${PATHS.grid.EN}`, DE: `${base}${PATHS.grid.DE}` }
      };
    }
    sendHtml(res, injectHead(template, head), 300);
  });
}
