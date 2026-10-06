import React, { useState, useEffect } from 'react';
import { Layers, Clock, ChevronRight, Gavel, Sparkles, Building2, MapPin, Truck } from 'lucide-react';
import { AuctionItem, Seller } from '../../types';
import { formatSeconds } from "../../lib/utils";

export interface PackageCardProps {
  packageId: string;
  title: string;
  sellerName?: string;
  items: AuctionItem[];
  t: any;
  language: string;
  isVerified: boolean;
  currentUserId?: string;
  bidAuctionIds?: string[];
  onSelectPackage: (packageId: string) => void;
  onAuctionClick: (item: AuctionItem) => void;
  onSellerClick?: (seller: any) => void;
}

export const PackageCard: React.FC<PackageCardProps> = ({
  packageId,
  title,
  sellerName,
  items,
  t,
  language,
  isVerified,
  currentUserId,
  bidAuctionIds,
  onSelectPackage,
  onAuctionClick,
  onSellerClick
}) => {
  const [timeLeftStr, setTimeLeftStr] = useState('');

  // Find latest end time among active items
  const activeItems = items.filter(it => it.status !== 'cancelled');
  const maxEndTime = activeItems.reduce((max, it) => {
    const end = new Date(it.endTime).getTime();
    return end > max ? end : max;
  }, 0);

  useEffect(() => {
    const update = () => {
      if (!maxEndTime) {
        setTimeLeftStr(t('ended') || 'Zaključeno');
        return;
      }
      const now = Date.now();
      const diff = Math.max(0, Math.floor((maxEndTime - now) / 1000));
      if (diff === 0) {
        setTimeLeftStr(t('ended') || 'Zaključeno');
      } else {
        setTimeLeftStr(formatSeconds(diff));
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [maxEndTime, t]);

  const displayItems = items.slice(0, 3);
  const remainingCount = items.length - displayItems.length;

  const userBiddedItems = items.filter(it => 
    bidAuctionIds?.includes(it.id)
  );

  let borderClass = "border border-white/10 hover:border-[#FEBA4F]/40";
  if (userBiddedItems.length > 0) {
    const isAllWinning = userBiddedItems.every(it => 
      currentUserId && (it.winnerId === currentUserId || (it as any).winner_id === currentUserId)
    );
    borderClass = isAllWinning 
      ? "border-green-500 border-2 ring-2 ring-green-500/20" 
      : "border-red-500 border-2 ring-2 ring-red-500/20";
  }

  return (
    <div 
      className={`col-span-full bg-[#0A1128] text-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl transition-all duration-300 relative overflow-hidden group ${borderClass}`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/10 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FEBA4F] shadow-md">
            <Layers size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="bg-[#FEBA4F] text-[#0A1128] text-[9px] font-black uppercase px-3 py-1 rounded-xl tracking-widest shadow-md">
                Zbirka dražb
              </span>
              <span className="bg-white/10 text-white text-[9px] font-black uppercase px-3 py-1 rounded-xl border border-white/10 tracking-widest flex items-center gap-1">
                <Sparkles size={10} className="text-[#FEBA4F]" /> {items.length} {items.length === 2 ? 'artikla' : items.length <= 4 ? 'artikli' : 'artiklov'}
              </span>
              {items[0] && (
                <span className="bg-[#0A1128]/90 text-slate-200 border border-white/10 text-[9px] font-black uppercase px-3 py-1 rounded-xl tracking-widest flex items-center gap-1">
                  <MapPin size={10} className="text-[#FEBA4F]" />
                  <span>{items[0].region || (typeof items[0].location === 'object' ? items[0].location?.SLO : items[0].location)}</span>
                </span>
              )}
              {items[0] && (
                <span className="bg-[#0A1128]/90 text-slate-200 border border-white/10 text-[9px] font-black uppercase px-3 py-1 rounded-xl tracking-widest flex items-center gap-1">
                  <Truck size={10} className="text-[#FEBA4F]" />
                  <span>
                    {(items[0] as any).delivery_option === 'pickup_only' || items[0].delivery_method === 'pickup'
                      ? 'Osebni prevzem'
                      : (items[0] as any).delivery_option === 'shipping_only' || items[0].delivery_method === 'post' || items[0].delivery_method === 'shipping'
                        ? 'Pošiljanje'
                        : 'Osebno / Pošta'}
                  </span>
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white group-hover:text-[#FEBA4F] transition-colors">
              {title}
            </h2>
            {sellerName && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const firstItem = items[0];
                  const seller = (firstItem as any)?.seller || {
                    id: firstItem?.sellerId || (firstItem as any)?.seller_id || sellerName,
                    name: { SLO: sellerName, EN: sellerName, DE: sellerName },
                    company_name: sellerName,
                    sellerName: sellerName
                  };
                  onSellerClick?.(seller);
                }}
                className="text-xs font-bold text-slate-400 mt-0.5 hover:text-[#FEBA4F] transition-colors flex items-center gap-1.5 text-left cursor-pointer group/seller"
              >
                <span>Prodajalec:</span>
                <span className="text-[#FEBA4F] group-hover/seller:underline underline-offset-2 flex items-center gap-1">
                  <Building2 size={12} /> {sellerName}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Timer & View Button */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl text-xs font-black text-[#FEBA4F] tabular-nums">
            <Clock size={16} />
            <span>{timeLeftStr}</span>
          </div>
          <button
            onClick={() => onSelectPackage(packageId)}
            className="flex items-center gap-2 bg-[#FEBA4F] hover:bg-white text-[#0A1128] font-black text-[10px] uppercase tracking-widest px-6 py-3 rounded-2xl transition-all shadow-lg active:scale-95 whitespace-nowrap"
          >
            <span>Ogled zbirke</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Collection Items Grid (3 previews) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-6 relative z-10">
        {displayItems.map((item) => {
          const imgUrl = item.images && item.images.length > 0 
            ? (item.images[0].startsWith('http') || item.images[0].startsWith('blob:') 
                ? item.images[0] 
                : `https://storage.googleapis.com/auction-images/${item.images[0]}`)
            : '/placeholder.png';

          const itemTitle = (typeof item.title === 'object' ? item.title[language] || item.title['SLO'] : item.title) || 'Dražba';

          return (
            <div
              key={item.id}
              onClick={() => onAuctionClick(item)}
              className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#FEBA4F]/50 rounded-2xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between group/item"
            >
              <div>
                <div className="w-full h-36 rounded-xl overflow-hidden mb-3 bg-[#0A1128] relative">
                  <img
                    src={imgUrl}
                    alt={itemTitle}
                    className="w-full h-full object-cover group-hover/item:scale-105 transition-transform duration-300 opacity-90 group-hover/item:opacity-100"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 left-2 bg-[#0A1128]/90 backdrop-blur-sm text-white border border-white/10 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg">
                    {item.region}
                  </div>
                  {item.condition && (
                    <div className="absolute top-2 right-2 bg-[#FEBA4F] text-[#0A1128] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md shadow">
                      {typeof item.condition === 'string' ? item.condition : (item.condition[language] || item.condition['SLO'] || 'Rabljeno')}
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 bg-[#0A1128]/95 backdrop-blur-sm text-[#FEBA4F] text-xs font-black px-2.5 py-1 rounded-lg border border-white/10 shadow-lg">
                    €{item.currentBid?.toLocaleString('sl-SI') || 1}
                  </div>
                </div>
                <h4 className="font-black text-sm text-white line-clamp-2 group-hover/item:text-[#FEBA4F] transition-colors leading-snug">
                  {itemTitle}
                </h4>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-white/10 mt-3">
                <span className="flex items-center gap-1 font-black text-[10px] uppercase tracking-widest text-slate-400">
                  <Gavel size={13} className="text-[#FEBA4F]" /> {item.bidCount || 0} ponudb
                </span>
                <span className="text-[#FEBA4F] font-black text-[10px] uppercase tracking-widest group-hover/item:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  Draži <ChevronRight size={14} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {remainingCount > 0 && (
        <div className="mt-5 text-center">
          <button 
            onClick={() => onSelectPackage(packageId)}
            className="text-xs font-black uppercase tracking-wider text-slate-400 hover:text-[#FEBA4F] transition-colors inline-flex items-center gap-2"
          >
            <span>+ še {remainingCount} {remainingCount === 1 ? 'artikel' : remainingCount === 2 ? 'artikla' : 'artiklov'} v tej zbirki</span>
            <span className="text-[#FEBA4F] font-black underline underline-offset-4">(kliknite za ogled vseh)</span>
          </button>
        </div>
      )}
    </div>
  );
};
