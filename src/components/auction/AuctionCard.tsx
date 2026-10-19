import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ChevronLeft, ChevronRight, Clock, Eye, Minus, Plus, Lock, Trophy, ShieldCheck, Truck } from '../icons';
import { AuctionItem, Seller } from "../../types";
import { getIncrement, formatSeconds, checkAndFinalizeAuctionClient } from "../../lib/utils";
import { getShippingPriceLabel } from "../../lib/shippingRules";
import { toast } from 'sonner';
import { ShareButton } from '../ui/ShareButton';

export const AuctionCard: React.FC<{
  item: AuctionItem;
  t: any;
  language: string;
  isVerified: boolean;
  currentUserId?: string;
  hasBid?: boolean;
  myMax?: number;
  isWatched: boolean;
  onWatchToggle: () => void;
  onClick: () => void;
  onBidSubmit?: (item: AuctionItem, amount: number) => Promise<'ok' | 'outbid' | 'error' | 'login_required' | 'cancelled'> | void;
  onSellerClick?: (seller: Seller) => void;
  onTimeUp?: (auctionId: string) => void;
}> = ({ item, t, language, isVerified, currentUserId, hasBid, myMax, isWatched, onWatchToggle, onClick, onBidSubmit, onSellerClick, onTimeUp }) => {
  const [timeLeftStr, setTimeLeftStr] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [signedImages, setSignedImages] = useState<string[]>([]);
  const seller = (item as any).seller;
  const isSeller = Boolean(currentUserId && (
    item.sellerId === currentUserId || 
    (item as any).seller_id === currentUserId ||
    (seller && (seller.id === currentUserId || (seller as any).id === currentUserId))
  ));
  const isWinner = Boolean(currentUserId && (item.winnerId === currentUserId || (item as any).winner_id === currentUserId));
  const userMax = isWinner 
    ? Math.max(item.currentBid, myMax || item.currentBid)
    : item.currentBid;
  const minNextBid = userMax + getIncrement(userMax);
  const [bidValue, setBidValue] = useState(minNextBid);
  const [isBidding, setIsBidding] = useState(false);
  const hasEndedFiredRef = useRef(false);

  useEffect(() => {
    if (!item?.images) return;
    const urls = item.images.map((imgPath: string) => {
      if (imgPath.startsWith('http') || imgPath.startsWith('blob:') || imgPath.startsWith('data:')) return imgPath;
      return `https://storage.googleapis.com/auction-images/${imgPath}`;
    });
    setSignedImages(urls);
  }, [item?.images]);

  useEffect(() => { 
    const baseline = isWinner 
      ? Math.max(item.currentBid, myMax || item.currentBid)
      : item.currentBid;
    setBidValue(baseline + getIncrement(baseline)); 
  }, [item.currentBid, isWinner, myMax]);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((item.endTime.getTime() - Date.now()) / 1000));
      setTimeLeftStr(formatSeconds(diff));
      
      if (diff === 0 && !hasEndedFiredRef.current) {
        hasEndedFiredRef.current = true;
        checkAndFinalizeAuctionClient(item.id);
        if (onTimeUp) {
            setTimeout(() => {
                onTimeUp(item.id);
            }, 1000);
        }
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [item.endTime, item.id, onTimeUp]);

  const handleAdjustBid = (dir: 'up' | 'down') => {
    const step = getIncrement(bidValue);
    setBidValue(prev => dir === 'up' ? prev + step : Math.max(minNextBid, prev - step));
  };

  const handleBidClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSeller) return;
    if (!onBidSubmit) {
      toast.error("Za oddajo ponudbe se morate prijaviti ali registrirati.");
      return;
    }
    setIsBidding(true);
    await onBidSubmit(item, bidValue);
    setIsBidding(false);
  };

  // Deutscher Kommentar: Rahmenlogik – eigene Gebote bleiben gruen (fuehrend) bzw. rot (ueberboten) markiert
  let borderClass = "border-[#E4DBC7]";
  if (hasBid) {
    borderClass = isWinner ? "border-green-500 border-2 ring-2 ring-green-500/20" : "border-red-500 border-2 ring-2 ring-red-500/20";
  }

  // Deutscher Kommentar: Beschriftung des Gebotsknopfes (zweiwortige Texte werden zweizeilig gesetzt)
  const bidLabel = (() => {
    const rawText = isWinner ? (t('increaseBid') || 'Zvišaj ponudbo') : (t('placeBid') || 'Oddaj ponudbo');
    const words = rawText.trim().split(/\s+/);
    if (words.length === 2) {
      return (
        <span className="flex flex-col items-center leading-tight">
          <span>{words[0]}</span>
          <span>{words[1]}</span>
        </span>
      );
    }
    return <span>{rawText}</span>;
  })();

  const imageCount = signedImages.length || item.images.length;
  const shippingLabel = getShippingPriceLabel(item);

  return (
    <div className={`bg-[#FFFDF7] rounded-[1.35rem] overflow-hidden shadow-xl hover:shadow-2xl md:hover:-translate-y-1.5 transition-all duration-300 group flex flex-col border relative ${borderClass}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden cursor-pointer group/image bg-[#E9E1CE]" onClick={onClick}>
        <img
          src={signedImages[currentImageIndex] || item.images[currentImageIndex]}
          alt={item.title[language] || item.title['SLO']}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0A1128]/35 to-transparent pointer-events-none"></div>
        {imageCount > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev - 1 + imageCount) % imageCount); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-[#FFFDF7]/90 text-[#0A1128] hover:bg-[#FFFDF7] rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity shadow-md"
              aria-label="Prejšnja slika"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev + 1) % imageCount); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-[#FFFDF7]/90 text-[#0A1128] hover:bg-[#FFFDF7] rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity shadow-md"
              aria-label="Naslednja slika"
            >
              <ChevronRight size={16} />
            </button>
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
              {Array.from({ length: Math.min(imageCount, 6) }).map((_, i) => (
                <span key={i} className={`h-1 rounded-full transition-all ${i === currentImageIndex ? 'w-4 bg-[#FEBA4F]' : 'w-1.5 bg-white/70'}`}></span>
              ))}
            </div>
          </>
        )}
        <div className="absolute top-2.5 left-2.5 md:top-3.5 md:left-3.5 bg-[#FFFDF7]/95 px-2.5 py-1 rounded-md max-w-[68%] truncate text-[10px] font-bold tracking-wide text-[#0A1128] shadow-sm flex items-center gap-1.5">
          <MapPin size={12} className="shrink-0" /> <span className="truncate">{item.location[language] || item.location['SLO']}</span>
        </div>

        <div className="absolute top-2.5 right-2.5 md:top-3.5 md:right-3.5 flex flex-col items-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onWatchToggle(); }}
            className={`p-2 rounded-full shadow-md border transition-all ${isWatched ? 'bg-[#FEBA4F] border-[#FEBA4F] text-[#0A1128]' : 'bg-[#FFFDF7]/95 border-transparent text-[#0A1128] hover:bg-[#FEBA4F]'}`}
          >
            <Eye size={15} />
          </button>
          <ShareButton item={item} language={language} t={t} />
          {isWinner && (
            <div className="bg-green-600 text-white px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest shadow-md flex items-center gap-1.5">
              <Trophy size={12} /> {t('leading') || 'Vodilni'}
            </div>
          )}
        </div>
      </div>

      {/* Deutscher Kommentar: Perforierte Abrisskante wie bei einer Auktionskarte */}
      <div className="relative h-0">
        <div className="absolute left-3 right-3 top-0 border-t-2 border-dashed border-[#E4DBC7]"></div>
        <span className="absolute -left-2.5 -top-2.5 w-5 h-5 rounded-full bg-[#F5EFE2] border border-[#E4DBC7]"></span>
        <span className="absolute -right-2.5 -top-2.5 w-5 h-5 rounded-full bg-[#F5EFE2] border border-[#E4DBC7]"></span>
      </div>

      <div className="p-3.5 sm:p-5 pt-4 sm:pt-5 flex flex-col flex-1">
        <h3 className="text-[15px] sm:text-lg leading-snug text-[#0A1128] hover:text-[#B26F00] transition-colors line-clamp-2 cursor-pointer mb-3 md:mb-4 min-h-[2.6em]" onClick={onClick}>{item.title[language] || item.title['SLO']}</h3>

        <div className="mt-auto">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2.5 mb-3 md:mb-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">{t('currentBid')}</p>
              <p className="font-display text-2xl md:text-[1.7rem] leading-none text-[#0A1128] tabular-nums">€{item.currentBid.toLocaleString('sl-SI')}</p>
              {shippingLabel && (
                <p className="text-[11px] font-semibold text-slate-600 mt-1.5 flex items-center gap-1.5"><Truck size={13} className="shrink-0" />{shippingLabel}</p>
              )}
              {isWinner && (myMax || 0) > item.currentBid && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-green-700 mt-1">Moja max: €{Number(myMax).toLocaleString('sl-SI')}</p>
              )}
            </div>
            <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-1.5">
              <div className="bg-[#0A1128] text-[#FEBA4F] pl-2 pr-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm" title={t('timeLeft')}>
                <Clock size={13} />
                <span className="font-bold tabular-nums text-xs md:text-[13px] tracking-wide">{timeLeftStr}</span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">{t('bidCount')}: {item.bidCount}</p>
            </div>
          </div>

          {isSeller ? (
            <div className="h-12 w-full bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-slate-600 font-bold text-[11px] uppercase tracking-widest cursor-default select-none">
              <ShieldCheck size={15} /> Vaša dražba
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 w-full relative">
              <div className="flex items-center bg-slate-100 rounded-xl border border-slate-200 p-1 md:flex-[5]">
                <button onClick={(e) => { e.stopPropagation(); handleAdjustBid('down'); }} className="w-8 h-10 flex items-center justify-center text-slate-500 hover:text-[#0A1128] hover:bg-white rounded-lg transition-all flex-shrink-0" aria-label="Zmanjšaj"><Minus size={15} /></button>
                <div className="flex-1 flex items-center justify-center px-1">
                  <span className="text-slate-500 font-bold text-base mr-1">€</span>
                  <input type="text" value={bidValue} readOnly className="w-full bg-transparent text-center text-[#0A1128] font-bold text-lg outline-none tabular-nums" />
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleAdjustBid('up'); }} className="w-8 h-10 flex items-center justify-center text-slate-500 hover:text-[#0A1128] hover:bg-white rounded-lg transition-all flex-shrink-0" aria-label="Povečaj"><Plus size={15} /></button>
              </div>
              <button
                onClick={handleBidClick}
                disabled={isBidding}
                className={`h-10 md:h-12 md:flex-[4] px-2 py-1.5 leading-tight text-center rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 ${isVerified && onBidSubmit ? 'bg-[#FEBA4F] text-[#0A1128] hover:bg-[#0A1128] hover:text-[#FEBA4F]' : 'bg-slate-200 text-slate-500'} ${isBidding ? 'opacity-75 cursor-not-allowed' : ''}`}
              >
                {isBidding ? (
                  <div className="w-4 h-4 border-2 border-[#0A1128]/30 border-t-[#0A1128] rounded-full animate-spin" />
                ) : !onBidSubmit || !isVerified ? (
                  <div className="flex items-center justify-center gap-1.5">
                    <Lock size={14} className="flex-shrink-0" />
                    {bidLabel}
                  </div>
                ) : (
                  bidLabel
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
