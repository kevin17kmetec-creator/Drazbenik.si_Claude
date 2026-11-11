import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ChevronLeft, ChevronRight, Clock, Eye, Minus, Plus, Lock, Trophy, ShieldCheck, Truck } from 'lucide-react';
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
  const [secsLeft, setSecsLeft] = useState(Number.MAX_SAFE_INTEGER);
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
      setSecsLeft(diff);
      
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

  // Deutscher Kommentar: Rahmen zeigt den eigenen Gebotsstatus (fuehrend / ueberboten)
  let borderClass = "border-[#E3E6EC]";
  if (hasBid) {
    borderClass = isWinner ? "border-green-600 ring-2 ring-green-600/15" : "border-red-500 ring-2 ring-red-500/15";
  }
  const imgCount = signedImages.length || item.images.length;
  // Deutscher Kommentar: Dringlichkeit der Restzeit (unter 1 Stunde rot, unter 24 Stunden gold)
  const timeTone = secsLeft <= 3600
    ? 'bg-red-50 text-red-700 border-red-200'
    : secsLeft <= 86400
      ? 'bg-[#FFF4DC] text-[#7A4E05] border-[#F5D38A]'
      : 'bg-slate-50 text-slate-600 border-slate-200';
  const bidLabel = isWinner ? (t('increaseBid') || 'Zvišaj ponudbo') : (t('placeBid') || 'Oddaj ponudbo');
  const canBid = isVerified && !!onBidSubmit;

  return (
    <div className={`@container bg-white rounded-2xl overflow-hidden flex flex-col border relative transition-shadow duration-200 hover:shadow-xl group ${borderClass}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden cursor-pointer group/image bg-slate-100" onClick={onClick}>
        <img 
          src={signedImages[currentImageIndex] || item.images[currentImageIndex]} 
          alt={item.title[language] || item.title['SLO']} 
          loading="lazy" 
          referrerPolicy="no-referrer" 
          className="w-full h-full object-cover" 
        />
        {imgCount > 1 && (
          <>
            <button 
              aria-label="Prejšnja slika"
              onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev - 1 + imgCount) % imgCount); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/90 hover:bg-white rounded-full shadow opacity-0 group-hover/image:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
                <ChevronLeft size={16} className="text-[#0A1128]" />
            </button>
            <button 
              aria-label="Naslednja slika"
              onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev + 1) % imgCount); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white/90 hover:bg-white rounded-full shadow opacity-0 group-hover/image:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
                <ChevronRight size={16} className="text-[#0A1128]" />
            </button>
            <span className="absolute bottom-2 left-2 bg-[#0A1128]/75 text-white text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums">{currentImageIndex + 1}/{imgCount}</span>
          </>
        )}

        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
          <button 
            aria-label="Opazuj"
            onClick={(e) => { e.stopPropagation(); onWatchToggle(); }}
            className={`w-9 h-9 flex items-center justify-center rounded-full shadow transition-colors ${isWatched ? 'bg-[#FEBA4F] text-[#0A1128]' : 'bg-white/95 text-[#0A1128] hover:bg-white'}`}
          >
            <Eye size={16} />
          </button>
          <ShareButton item={item} language={language} t={t} />
        </div>
        {isWinner && (
          <div className="absolute top-2 left-2 bg-green-600 text-white px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5">
            <Trophy size={12} /> {t('leading') || 'Vodilni'}
          </div>
        )}
      </div>
      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <h3 className="text-sm sm:text-base font-bold leading-snug text-[#0A1128] hover:underline decoration-[#FEBA4F] decoration-2 underline-offset-4 line-clamp-2 min-h-[2.75em] cursor-pointer" onClick={onClick}>{item.title[language] || item.title['SLO']}</h3>
        <p className="mt-1 text-xs text-slate-500 flex items-center gap-1 min-w-0">
          <MapPin size={12} className="shrink-0" /> <span className="truncate">{item.location[language] || item.location['SLO']}</span>
        </p>

        <div className="mt-auto pt-3 sm:pt-4">
          <div className="flex justify-between items-end gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500 whitespace-nowrap">{t('currentBid')}</p>
              <p className="text-lg sm:text-xl font-black text-[#0A1128] tabular-nums leading-tight">{item.currentBid.toLocaleString('sl-SI')} €</p>
            </div>
            <div className={`shrink-0 inline-flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs font-bold tabular-nums ${timeTone}`} title={t('timeLeft')}>
              <Clock size={12} /> {timeLeftStr}
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span>{t('bidCount')}: <span className="font-bold text-[#0A1128] tabular-nums">{item.bidCount}</span></span>
            {getShippingPriceLabel(item) && (
              <span className="flex items-center gap-1"><Truck size={12} className="shrink-0" />{getShippingPriceLabel(item)}</span>
            )}
          </div>
          {isWinner && (myMax || 0) > item.currentBid && (
            <p className="text-xs font-bold text-green-700 mt-1">Moja max: {Number(myMax).toLocaleString('sl-SI')} €</p>
          )}

          <div className="mt-3 pt-3 border-t border-[#E3E6EC]">
          {isSeller ? (
            <div className="h-10 w-full bg-slate-50 border border-[#E3E6EC] rounded-xl flex items-center justify-center gap-2 text-slate-600 font-bold text-xs cursor-default select-none">
              <ShieldCheck size={14} className="text-[#B97A0F]" /> Vaša dražba
            </div>
          ) : (
            <div className="flex flex-col @[270px]:flex-row items-stretch gap-2 w-full">
               <div className="flex items-center rounded-xl border border-[#D5DAE3] h-10 @[270px]:flex-1 min-w-0">
                  <button aria-label="Znižaj" onClick={(e) => { e.stopPropagation(); handleAdjustBid('down'); }} className="w-9 h-full flex items-center justify-center text-slate-500 hover:text-[#0A1128] hover:bg-slate-50 rounded-l-xl flex-shrink-0"><Minus size={14}/></button>
                  <div className="flex-1 flex items-center justify-center min-w-0">
                      <input type="text" value={bidValue} readOnly aria-label="Znesek ponudbe" className="w-full min-w-0 bg-transparent text-right text-[#0A1128] font-bold text-sm outline-none tabular-nums" />
                      <span className="text-slate-500 font-bold text-sm ml-1 mr-1">€</span>
                  </div>
                  <button aria-label="Zvišaj" onClick={(e) => { e.stopPropagation(); handleAdjustBid('up'); }} className="w-9 h-full flex items-center justify-center text-slate-500 hover:text-[#0A1128] hover:bg-slate-50 rounded-r-xl flex-shrink-0"><Plus size={14}/></button>
               </div>
               <button 
                  onClick={handleBidClick} 
                  disabled={isBidding} 
                  className={`h-10 px-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed ${canBid ? 'bg-[#FEBA4F] text-[#0A1128] hover:bg-[#F5A623]' : 'bg-[#0A1128] text-white hover:bg-[#131C3A]'}`}
               >
                  {isBidding ? (
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : (
                      <>
                        {!canBid && <Lock size={13} className="flex-shrink-0" />}
                        <span>{bidLabel}</span>
                      </>
                  )}
               </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
