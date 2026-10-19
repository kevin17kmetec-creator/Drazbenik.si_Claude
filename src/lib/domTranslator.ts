import { translateText, normalizeLang, UiLang } from './translateUi';

// Deutscher Kommentar: Wendet den Katalog auf alle sichtbaren Texte und Attribute an und stellt bei Wechsel zu Slowenisch das Original wieder her
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'NOSCRIPT', 'SVG']);
const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];

let currentLang: UiLang = 'SLO';
let observer: MutationObserver | null = null;
const textRecords = new WeakMap<Text, { orig: string; applied: string }>();
const attrRecords = new WeakMap<Element, Record<string, { orig: string; applied: string }>>();

function isSkipped(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (SKIP_TAGS.has(cur.tagName.toUpperCase())) return true;
    if (cur.getAttribute && (cur.getAttribute('translate') === 'no' || cur.hasAttribute('data-no-translate') || cur.getAttribute('contenteditable') === 'true')) return true;
    cur = cur.parentElement;
  }
  return false;
}

// Deutscher Kommentar: Fuer Attribute (placeholder, title ...) duerfen INPUT/TEXTAREA selbst uebersetzt werden, nur Skripte und markierte Bereiche nicht
function isAttrSkipped(el: Element): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE') return true;
  return isSkipped(el.tagName.toUpperCase() === 'INPUT' || tag === 'TEXTAREA' ? el.parentElement : el);
}

function applyText(node: Text) {
  const parent = node.parentElement;
  if (!parent || isSkipped(parent)) return;
  const value = node.nodeValue ?? '';
  let rec = textRecords.get(node);
  if (rec && value !== rec.applied) {
    // React hat den Text neu gesetzt: neues Original
    rec = undefined;
  }
  const orig = rec ? rec.orig : value;
  if (currentLang === 'SLO') {
    if (rec && node.nodeValue !== rec.orig) node.nodeValue = rec.orig;
    if (rec) textRecords.delete(node);
    return;
  }
  const translated = translateText(orig, currentLang);
  if (translated !== value) {
    node.nodeValue = translated;
    textRecords.set(node, { orig, applied: translated });
  } else if (!rec) {
    textRecords.set(node, { orig, applied: value });
  }
}

function applyAttrs(el: Element, only?: string) {
  if (isAttrSkipped(el)) return;
  const names = only ? [only] : ATTRS;
  for (const name of names) {
    if (!el.hasAttribute(name)) continue;
    const value = el.getAttribute(name) ?? '';
    const recs = attrRecords.get(el) || {};
    let rec = recs[name];
    if (rec && value !== rec.applied) rec = undefined as any;
    const orig = rec ? rec.orig : value;
    if (currentLang === 'SLO') {
      if (rec && value !== rec.orig) el.setAttribute(name, rec.orig);
      if (recs[name]) { delete recs[name]; attrRecords.set(el, recs); }
      continue;
    }
    const translated = translateText(orig, currentLang);
    if (translated !== value) {
      el.setAttribute(name, translated);
      recs[name] = { orig, applied: translated };
      attrRecords.set(el, recs);
    }
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    applyText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  const base = root.nodeType === Node.DOCUMENT_NODE ? (root as Document).body : (root as Element);
  if (!base) return;
  if (base.nodeType === Node.ELEMENT_NODE) applyAttrs(base as Element);
  const tw = document.createTreeWalker(base, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) applyText(n as Text);
    else applyAttrs(n as Element);
    n = tw.nextNode();
  }
}

function onMutations(muts: MutationRecord[]) {
  for (const m of muts) {
    if (m.type === 'characterData') {
      if (m.target.nodeType === Node.TEXT_NODE) applyText(m.target as Text);
    } else if (m.type === 'attributes') {
      applyAttrs(m.target as Element, m.attributeName || undefined);
    } else {
      m.addedNodes.forEach((n) => walk(n));
    }
  }
}

let dialogsPatched = false;
// Deutscher Kommentar: Native Browser-Dialoge (alert/confirm) ebenfalls uebersetzen
function patchNativeDialogs() {
  if (dialogsPatched || typeof window === 'undefined') return;
  dialogsPatched = true;
  const origAlert = window.alert.bind(window);
  const origConfirm = window.confirm.bind(window);
  window.alert = (msg?: any) => origAlert(typeof msg === 'string' ? translateText(msg, currentLang) : msg);
  window.confirm = (msg?: string) => origConfirm(typeof msg === 'string' ? translateText(msg, currentLang) : msg);
}

export function setDomLanguage(lang: string) {
  if (typeof document === 'undefined') return;
  patchNativeDialogs();
  currentLang = normalizeLang(lang);
  document.documentElement.lang = currentLang === 'SLO' ? 'sl' : currentLang === 'DE' ? 'de' : 'en';
  if (!observer) {
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  walk(document);
}
