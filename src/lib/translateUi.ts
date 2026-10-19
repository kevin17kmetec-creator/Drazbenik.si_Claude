import { UI_CATALOG } from './uiCatalog';

// Deutscher Kommentar: Uebersetzt fest codierte slowenische Texte anhand des zentralen Katalogs (Browser und PDF)
export type UiLang = 'SLO' | 'EN' | 'DE';

export function normalizeLang(lang?: string | null): UiLang {
  const l = String(lang || '').toUpperCase();
  if (l === 'EN') return 'EN';
  if (l === 'DE') return 'DE';
  return 'SLO';
}

type PatternEntry = { re: RegExp; target: [string, string]; groups: number };

let patternCache: PatternEntry[] | null = null;
let exactCache: Map<string, [string, string]> | null = null;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

function buildCaches() {
  exactCache = new Map();
  patternCache = [];
  for (const [sl, target] of Object.entries(UI_CATALOG)) {
    if (/\{\d+\}/.test(sl)) {
      const parts = sl.split(/\{\d+\}/);
      const groups = parts.length - 1;
      const source = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)');
      patternCache.push({ re: new RegExp('^' + source + '$', 's'), target, groups });
    } else {
      exactCache.set(squash(sl), target);
    }
  }
  // Laengere Muster zuerst, damit spezifischere Treffer gewinnen
  patternCache.sort((a, b) => b.re.source.length - a.re.source.length);
}

export function translateText(text: string, lang: string): string {
  const L = normalizeLang(lang);
  if (L === 'SLO' || !text) return text;
  if (!exactCache || !patternCache) buildCaches();
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.match(/\s*$/)?.[0] ?? '';
  const core = squash(text);
  if (!core) return text;
  const idx = L === 'EN' ? 0 : 1;
  const hit = exactCache!.get(core);
  if (hit) return lead + hit[idx] + trail;
  for (const p of patternCache!) {
    const m = core.match(p.re);
    if (m) {
      let out = p.target[idx];
      for (let i = 1; i <= p.groups; i++) {
        out = out.split('{' + (i - 1) + '}').join(m[i]);
      }
      return lead + out + trail;
    }
  }
  // Deutscher Kommentar: Fallback "Beschriftung: Wert" - nur die Beschriftung uebersetzen, Wert (ggf. rekursiv) behalten
  const lm = core.match(/^([^:\n]{2,70}:)\s+(.+)$/s);
  if (lm) {
    const labelHit = exactCache!.get(lm[1]);
    if (labelHit) return lead + labelHit[idx] + ' ' + translateText(lm[2], L) + trail;
  }
  return text;
}
