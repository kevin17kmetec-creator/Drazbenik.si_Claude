import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, Link2, X, Check, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { AuctionItem } from '../../types';
import { buildAuctionShareUrl, buildAuctionShareText, copyToClipboard, SHARE_TARGETS, ShareTarget } from '../../lib/share';

// Deutscher Kommentar: Einfache Marken-Glyphen (weiss auf farbigem Kreis)
const BrandGlyph: React.FC<{ id: ShareTarget['id'] }> = ({ id }) => {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (id) {
    case 'whatsapp':
      return <svg {...common} fill="none"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 7.8c-.6.6-.9 1.4-.5 2.6.7 2 2.6 4 4.6 4.6 1.2.4 2-.1 2.6-.7l-1.7-1.5-1 .7c-.9-.4-1.8-1.2-2.2-2.2l.7-1L9 7.8z" fill="#fff" /></svg>;
    case 'viber':
      return <svg {...common} fill="none"><path d="M12 3C7 3 4 5.5 4 10c0 2.4 1 4.2 2.5 5.3V20l3.2-2c.7.1 1.5.2 2.3.2 5 0 8-2.5 8-7.2S17 3 12 3z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.3 7.6c-.5.5-.7 1.1-.4 2 .6 1.6 2 3 3.6 3.6.9.3 1.5.1 2-.4l-1.3-1.2-.8.5c-.7-.3-1.4-.9-1.7-1.7l.5-.8-1.9-2z" fill="#fff" /></svg>;
    case 'messenger':
      return <svg {...common}><path d="M12 2C6.5 2 2 6.2 2 11.4c0 2.9 1.4 5.5 3.6 7.2V22l3.3-1.8c.9.2 1.9.4 3.1.4 5.5 0 10-4.2 10-9.4S17.5 2 12 2z" fill="#fff" /><path d="M5.8 14.2l4.3-4.6 2.5 2.6 4.1-2.6-4.4 4.7-2.5-2.6-4 2.5z" fill="#0A7CFF" /></svg>;
    case 'facebook':
      return <svg {...common}><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.8c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5V13h2.8v8h3.2z" fill="#fff" /></svg>;
    case 'instagram':
      return <svg {...common} fill="none" stroke="#fff" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.7" /><circle cx="16.9" cy="7.1" r="1" fill="#fff" stroke="none" /></svg>;
    case 'telegram':
      return <svg {...common}><path d="M21.5 3.4 2.8 10.6c-.8.3-.8 1.3 0 1.6l4.7 1.7 1.8 5.6c.2.6 1 .8 1.4.3l2.6-2.5 4.8 3.5c.6.4 1.3.1 1.5-.6L22.9 4.7c.2-.8-.6-1.6-1.4-1.3zM9.2 14.1l8.4-5.9-6.6 7.1-.4 3.1-1.4-4.3z" fill="#fff" fillRule="evenodd" /></svg>;
    case 'x':
      return <svg {...common}><path d="M18.9 2.2h3.4l-7.4 8.5L23.6 22h-6.8l-5.4-7-6.1 7H1.9l7.9-9.1L1.4 2.2h7l4.9 6.4 5.6-6.4zm-1.2 17.8h1.9L7.4 4.1H5.4L17.7 20z" fill="#fff" /></svg>;
    default:
      return <Mail size={16} color="#fff" />;
  }
};

// Deutscher Kommentar: Teilen-Knopf; auf Mobilgeraeten oeffnet er das System-Teilen-Menue, sonst ein Menue mit Chat-/Social-Zielen und Link kopieren
export const ShareButton: React.FC<{
  item: AuctionItem;
  language: string;
  t: any;
  variant?: 'icon' | 'tile';
  className?: string;
}> = ({ item, language, t, variant = 'icon', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isTouchDevice = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

  const label = t('share') || (language === 'DE' ? 'Teilen' : language === 'EN' ? 'Share' : 'Deli');
  const url = buildAuctionShareUrl(item.id, language);
  const { title, text } = buildAuctionShareText(item, language);

  const doCopy = async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success(t('linkCopied') || (language === 'DE' ? 'Link kopiert' : language === 'EN' ? 'Link copied' : 'Povezava kopirana'));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('linkCopyFailed') || (language === 'DE' ? 'Kopieren nicht möglich' : language === 'EN' ? 'Could not copy' : 'Kopiranje ni uspelo'));
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Natives Teilen nur auf Touch-Geraeten; am Desktop ist das eigene Menue uebersichtlicher
    const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (isTouch && typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
      try {
        await (navigator as any).share({ title, text, url });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    setOpen(true);
  };

  const menu = open ? createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-[#0A1128]/70 backdrop-blur-sm p-4"
      onClick={(e) => { e.stopPropagation(); setOpen(false); }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="text-sm font-black text-[#0A1128] line-clamp-2">{title}</p>
          </div>
          <button onClick={() => setOpen(false)} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 shrink-0" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {SHARE_TARGETS(url, text, isTouchDevice).map(tg => (
            <a
              key={tg.id}
              href={tg.href}
              target={tg.id === 'email' || tg.id === 'viber' || tg.id === 'messenger' ? '_self' : '_blank'}
              rel="noopener noreferrer"
              onClick={async (e) => {
                // Instagram: Link kopieren, damit er in Story/Nachricht eingefuegt werden kann
                if (tg.kind === 'copy') {
                  await copyToClipboard(url);
                  toast.success(language === 'DE' ? 'Link kopiert – in Instagram einfügen' : language === 'EN' ? 'Link copied – paste it in Instagram' : 'Povezava kopirana – prilepite jo v Instagram');
                }
                setOpen(false);
              }}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: tg.id === 'instagram' ? 'linear-gradient(45deg,#F9CE34,#EE2A7B 55%,#6228D7)' : tg.color }}
              >
                <BrandGlyph id={tg.id} />
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#0A1128]">{tg.label}</span>
            </a>
          ))}
        </div>
        <button
          onClick={doCopy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#0A1128] text-white text-xs font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-colors"
        >
          {copied ? <Check size={14} /> : <Link2 size={14} />}
          {copied ? (t('linkCopied') || (language === 'DE' ? 'Link kopiert' : language === 'EN' ? 'Link copied' : 'Povezava kopirana')) : (t('copyLink') || (language === 'DE' ? 'Link kopieren' : language === 'EN' ? 'Copy link' : 'Kopiraj povezavo'))}
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {variant === 'tile' ? (
        <button
          onClick={handleClick}
          aria-label={label}
          className={`flex flex-col items-center justify-center p-3 border rounded-2xl transition-all min-w-[80px] shrink-0 group bg-slate-50 border-slate-200 hover:border-[#FEBA4F] hover:bg-white ${className}`}
        >
          <Share2 size={20} className="text-slate-400 group-hover:text-[#FEBA4F] transition-colors" />
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-[#0A1128]">{label}</span>
        </button>
      ) : (
        <button
          onClick={handleClick}
          aria-label={label}
          title={label}
          className={`p-2 rounded-xl backdrop-blur-sm shadow-lg border bg-[#0A1128]/90 border-white/10 text-white hover:bg-white/10 transition-all ${className}`}
        >
          <Share2 size={14} />
        </button>
      )}
      {menu}
    </>
  );
};
