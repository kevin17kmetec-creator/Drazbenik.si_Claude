import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ChevronLeft, ChevronRight, Clock, Eye, Building2, Minus, Plus, Lock, Trophy, ShieldCheck, Truck, Sparkles, Tag } from 'lucide-react';
import { AuctionItem, Seller } from "../../types";
import { getIncrement, formatSeconds, checkAndFinalizeAuctionClient } from "../../lib/utils";
import { toast } from 'sonner';

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
      window.location.hash = '#login';
      return;
    }
    setIsBidding(true);
    await onBidSubmit(item, bidValue);
    setIsBidding(false);
  };

  // Border logic
  let borderClass = "border-transparent";
  if (hasBid) {
    borderClass = isWinner ? "border-green-500 border-2 ring-2 ring-green-500/20" : "border-red-500 border-2 ring-2 ring-red-500/20";
  }

  return (
    <div className={`bg-[#0A1128] rounded-[2.5rem] overflow-hidden shadow-2xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group flex flex-col h-[540px] border relative ${borderClass}`}>
      <div className="relative h-52 overflow-hidden cursor-pointer group/image" onClick={onClick}>
        <img 
          src={signedImages[currentImageIndex] || item.images[currentImageIndex]} 
          alt={item.title[language] || item.title['SLO']} 
          loading="lazy" 
          referrerPolicy="no-referrer" 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-90 group-hover:opacity-100" 
        />
        {(signedImages.length > 1 || item.images.length > 1) && (
          <>
            <button 
              onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev - 1 + (signedImages.length || item.images.length)) % (signedImages.length || item.images.length)); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 bg-white/30 hover:bg-white/60 rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity"
            >
                <ChevronLeft size={16} className="text-white" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev + 1) % (signedImages.length || item.images.length)); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-white/30 hover:bg-white/60 rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity"
            >
                <ChevronRight size={16} className="text-white" />
            </button>
          </>
        )}
        <div className="absolute top-4 left-4 bg-[#0A1128]/90 backdrop-blur-sm px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white shadow-lg flex items-center gap-1.5 border border-white/10">
          <MapPin size={10} className="text-[#FEBA4F]" /> {item.location[language] || item.location['SLO']}
        </div>
        
        {/* Condition Badge on Image */}
        {(() => {
          const condText = typeof item.condition === 'string' 
            ? item.condition 
            : (item.condition?.[language] || item.condition?.['SLO'] || 'Rabljeno');
          const isNew = condText.toLowerCase().includes('nov');
          return (
            <div className={`absolute bottom-3 left-4 backdrop-blur-sm px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1.5 border ${
              isNew 
                ? 'bg-emerald-500/90 text-white border-emerald-400/50' 
                : 'bg-[#0A1128]/90 text-slate-200 border-white/10'
            }`}>
              <Sparkles size={10} className={isNew ? 'text-amber-200' : 'text-[#FEBA4F]'} />
              <span>{condText}</span>
            </div>
          );
        })()}

        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onWatchToggle(); }}
            className={`p-2 rounded-xl backdrop-blur-sm shadow-lg border transition-all ${isWatched ? 'bg-[#FEBA4F] border-[#FEBA4F] text-[#0A1128]' : 'bg-[#0A1128]/90 border-white/10 text-white hover:bg-white/10'}`}
          >
            <Eye size={14} />
          </button>
          <div className="bg-[#FEBA4F] text-[#0A1128] backdrop-blur-sm px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg">
            {item.region}
          </div>
          {isWinner && (
            <div className="bg-green-500 text-white backdrop-blur-sm px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1.5 border border-green-400/50 animate-pulse">
              <Trophy size={10} /> {t('leading') || 'Vodilni'}
            </div>
          )}
        </div>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <div className="mb-2 flex justify-between items-center">
            {(seller || item.sellerName) && (
              (item as any).is_seller_deleted || item.sellerName === "Uporabnik je bil izbrisan" || (seller && ((seller as any).is_deleted || (seller as any).isDeleted)) ? (
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 opacity-75">
                  <Building2 size={12} /> Uporabnik je bil izbrisan
                </span>
              ) : (
                <button 
                  type="button"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    const targetSeller = seller || {
                      id: item.sellerId || (item as any).seller_id || item.sellerName,
                      name: { 
                        SLO: item.sellerName || 'Prodajalec', 
                        EN: item.sellerName || 'Seller', 
                        DE: item.sellerName || 'Verkäufer' 
                      },
                      company_name: item.sellerName,
                      sellerName: item.sellerName
                    };
                    onSellerClick?.(targetSeller); 
                  }} 
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#FEBA4F] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                    <Building2 size={12} /> {seller ? (seller.name[language] || seller.name['SLO'] || t('unknownSeller')) : (item.sellerName && item.sellerName !== "Neznan prodajalec" ? item.sellerName : t('unknownSeller'))}
                </button>
              )
            )}
        </div>
        <h3 className="text-lg font-black leading-tight text-white hover:text-[#FEBA4F] transition-colors line-clamp-2 cursor-pointer mb-2.5" onClick={onClick}>{item.title[language] || item.title['SLO']}</h3>

        {/* Delivery / Shipping Method Badge */}
        {(() => {
          const delOpt = (item as any).delivery_option || item.delivery_method || 'both';
          const feeType = (item as any).shipping_fee_type;
          const cost = (item as any).shipping_cost;
          let delLabel = 'Osebni prevzem in pošiljanje';
          if (delOpt === 'pickup_only' || delOpt === 'pickup') {
            delLabel = 'Samo osebni prevzem';
          } else if (delOpt === 'shipping_only' || delOpt === 'shipping' || delOpt === 'post') {
            delLabel = cost !== null && cost !== undefined && Number(cost) > 0 
              ? `Pošta (€${Number(cost).toFixed(2)})` 
              : feeType === 'calculated' ? 'Pošiljanje (pošta)' : 'Samo pošiljanje';
          } else if (cost !== null && cost !== undefined && Number(cost) > 0) {
            delLabel = `Osebno / Pošta (€${Number(cost).toFixed(2)})`;
          }

          return (
            <div className="flex items-center gap-1.5 mb-3 text-[10px] font-bold text-slate-300 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 w-fit">
              <Truck size={12} className="text-[#FEBA4F] shrink-0" />
              <span className="truncate max-w-[240px]">{delLabel}</span>
            </div>
          );
        })()}

        {/* Key Specifications Badges (Size, Brand, Model, RAM, etc.) */}
        {(() => {
          const specs = (item.specifications || {}) as Record<string, any>;
          const flatSpecs: { key: string; val: string }[] = [];
          for (const [k, v] of Object.entries(specs)) {
            if (typeof v === 'string' && v.trim() !== '') {
              flatSpecs.push({ key: k, val: v });
            } else if (v && typeof v === 'object') {
              for (const [subK, subV] of Object.entries(v)) {
                if (typeof subV === 'string' && subV.trim() !== '') {
                  flatSpecs.push({ key: subK, val: subV });
                }
              }
            }
          }
          if (flatSpecs.length === 0) return null;

          return (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {flatSpecs.slice(0, 3).map(({ key, val }) => (
                <span key={key} className="text-[9px] font-black uppercase tracking-wider bg-white/10 text-amber-200 px-2 py-0.5 rounded-md border border-white/10">
                  {val}
                </span>
              ))}
            </div>
          );
        })()}

        <div className="flex items-center gap-3 mb-4">
          <div className="bg-white/5 p-2 rounded-lg text-[#FEBA4F] border border-white/10"><Clock size={14} /></div>
          <div className="text-[10px] font-black uppercase tracking-widest text-white">
            <span className="text-slate-400 block">{t('timeLeft')}</span>
            <span className="text-[#FEBA4F] tabular-nums text-sm">{timeLeftStr}</span>
          </div>
        </div>
        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('currentBid')}</p>
              <p className="text-xl font-black text-[#FEBA4F]">€{item.currentBid.toLocaleString('sl-SI')}</p>
              {isWinner && (myMax || 0) > item.currentBid && (
                  <p className="text-[9px] font-black uppercase tracking-widest text-green-400 mt-1">Moja max: €{Number(myMax).toLocaleString('sl-SI')}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('bidCount')}</p>
              <p className="text-sm font-black text-[#FEBA4F]">{item.bidCount}</p>
            </div>
          </div>
          {isSeller ? (
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-widest cursor-default select-none">
              <ShieldCheck size={14} className="text-[#FEBA4F]" /> Vaša dražba
            </div>
          ) : (
            <div className="flex items-center gap-4 w-full relative">
               <div className="flex items-center bg-white/5 rounded-2xl border border-white/10 p-1 flex-[5]">
                  <button onClick={(e) => { e.stopPropagation(); handleAdjustBid('down'); }} className="w-8 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all flex-shrink-0"><Minus size={14}/></button>
                  <div className="flex-1 flex items-center justify-center px-1">
                      <span className="text-[#FEBA4F] font-black text-lg mr-1">€</span>
                      <input type="text" value={bidValue} readOnly className="w-full bg-transparent text-center text-white font-black text-lg outline-none tabular-nums" />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleAdjustBid('up'); }} className="w-8 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all flex-shrink-0"><Plus size={14}/></button>
               </div>
               <button 
                  onClick={handleBidClick} 
                  disabled={isBidding} 
                  className={`h-12 flex-[4] px-2 py-1.5 leading-tight text-center rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 ${isVerified && onBidSubmit ? 'bg-[#FEBA4F] text-[#0A1128] hover:bg-white' : 'bg-slate-800 text-slate-500'} ${isBidding ? 'opacity-75 cursor-not-allowed' : ''}`}
               >
                  {isBidding ? (
                      <div className="w-4 h-4 border-2 border-[#0A1128]/30 border-t-[#0A1128] rounded-full animate-spin" />
                  ) : !onBidSubmit || !isVerified ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <Lock size={14} className="flex-shrink-0" />
                        {(() => {
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
                        })()}
                      </div>
                  ) : (() => {
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
                  })()}
               </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
