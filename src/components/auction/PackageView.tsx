import React from 'react';
import { ArrowLeft, Layers, Clock, ShieldCheck, Building2, MapPin, Truck } from 'lucide-react';
import { AuctionItem, Seller } from '../../types';
import { AuctionCard } from "@/src/components/auction/AuctionCard";
import { formatSeconds } from "../../lib/utils";

export interface PackageViewProps {
  packageId: string;
  packageTitle: string;
  items: AuctionItem[];
  t: any;
  language: string;
  isVerified: boolean;
  watchlist: string[];
  currentUserId?: string;
  bidAuctionIds?: string[];
  myBidsMap?: Map<string, number>;
  onWatchToggle: (id: string) => void;
  onAuctionClick: (item: AuctionItem) => void;
  onBidSubmit?: (item: AuctionItem, amount: number) => Promise<'ok' | 'outbid' | 'error' | 'login_required' | 'cancelled'> | void;
  onSellerClick?: (seller: Seller) => void;
  onTimeUp?: (auctionId: string) => void;
  onBack: () => void;
}

export const PackageView: React.FC<PackageViewProps> = ({
  packageId,
  packageTitle,
  items,
  t,
  language,
  isVerified,
  watchlist,
  currentUserId,
  bidAuctionIds = [],
  myBidsMap,
  onWatchToggle,
  onAuctionClick,
  onBidSubmit,
  onSellerClick,
  onTimeUp,
  onBack
}) => {
  const firstItem = items[0];
  const seller = (firstItem as any)?.seller || {
    id: firstItem?.sellerId || (firstItem as any)?.seller_id || firstItem?.sellerName || 'seller',
    name: { 
      SLO: firstItem?.sellerName || 'Preverjen prodajalec', 
      EN: firstItem?.sellerName || 'Verified seller', 
      DE: firstItem?.sellerName || 'Geprüfter Verkäufer' 
    },
    company_name: firstItem?.sellerName || 'Preverjen prodajalec',
    sellerName: firstItem?.sellerName || 'Preverjen prodajalec'
  };
  const sellerDisplay = firstItem?.sellerName || 'Preverjen prodajalec';

  // Calculate package end time
  const maxEndTime = items.reduce((max, it) => {
    const end = new Date(it.endTime).getTime();
    return end > max ? end : max;
  }, 0);

  const [timeLeft, setTimeLeft] = React.useState('');

  React.useEffect(() => {
    const update = () => {
      if (!maxEndTime) {
        setTimeLeft(t('ended') || 'Zaključeno');
        return;
      }
      const now = Date.now();
      const diff = Math.max(0, Math.floor((maxEndTime - now) / 1000));
      if (diff === 0) {
        setTimeLeft(t('ended') || 'Zaključeno');
      } else {
        setTimeLeft(formatSeconds(diff));
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [maxEndTime, t]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in">
      {/* Back button */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-slate-400 hover:text-[#0A1128] font-black uppercase text-[10px] tracking-widest mb-8 transition-colors"
      >
        <ArrowLeft size={16} />
        <span>Nazaj na vse dražbe</span>
      </button>

      {/* Collection Header Banner */}
      <div className="bg-[#0A1128] text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl mb-12 border border-white/10 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="bg-[#FEBA4F] text-[#0A1128] text-xs font-black uppercase px-3.5 py-1.5 rounded-xl tracking-widest flex items-center gap-1.5 shadow-md">
                <Layers size={15} /> Zbirka dražb
              </span>
              <span className="bg-white/10 text-white border border-white/10 text-xs font-black uppercase px-3.5 py-1.5 rounded-xl tracking-widest flex items-center gap-1">
                {items.length} {items.length === 2 ? 'artikla' : items.length <= 4 ? 'artikli' : 'artiklov'} v zbirki
              </span>
              {firstItem && (
                <span className="bg-white/10 text-slate-200 border border-white/10 text-xs font-black uppercase px-3.5 py-1.5 rounded-xl tracking-widest flex items-center gap-1.5">
                  <MapPin size={13} className="text-[#FEBA4F]" />
                  <span>{firstItem.region || (typeof firstItem.location === 'object' ? firstItem.location?.SLO : firstItem.location)}</span>
                </span>
              )}
              {firstItem && (
                <span className="bg-white/10 text-slate-200 border border-white/10 text-xs font-black uppercase px-3.5 py-1.5 rounded-xl tracking-widest flex items-center gap-1.5">
                  <Truck size={13} className="text-[#FEBA4F]" />
                  <span>
                    {(firstItem as any).delivery_option === 'pickup_only' || firstItem.delivery_method === 'pickup'
                      ? 'Samo osebni prevzem'
                      : (firstItem as any).delivery_option === 'shipping_only' || firstItem.delivery_method === 'post' || firstItem.delivery_method === 'shipping'
                        ? 'Samo pošiljanje'
                        : 'Osebni prevzem in pošiljanje'}
                  </span>
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">{packageTitle}</h1>
            <div className="flex items-center gap-4 mt-4 text-sm text-slate-300">
              <button 
                onClick={() => seller && onSellerClick?.(seller)}
                className="flex items-center gap-2 font-black uppercase tracking-widest text-xs text-slate-300 hover:text-[#FEBA4F] transition-colors"
              >
                <Building2 size={16} className="text-[#FEBA4F]" /> Prodajalec: <strong className="text-white hover:text-[#FEBA4F] underline underline-offset-4">{sellerDisplay}</strong>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl shrink-0">
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Zadnja dražba v zbirki poteče čez</div>
              <div className="text-3xl font-black text-[#FEBA4F] flex items-center gap-3 mt-1 tabular-nums">
                <Clock size={24} />
                <span>{timeLeft}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-xs font-medium text-slate-400 flex items-center gap-2">
          <ShieldCheck size={18} className="text-green-400 shrink-0" />
          <span>Vse zmagane artikle te zbirke prejmete skupaj na enem računu z združeno provizijo po poteku vseh dražb.</span>
        </div>
      </div>

      {/* Grid of Items - exactly identical to the main grid */}
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-[#FEBA4F] w-2.5 h-10 rounded-full shadow-lg"></div>
        <h2 className="text-3xl font-black text-[#0A1128] uppercase tracking-tighter italic">
          Artikli v tej zbirki ({items.length})
        </h2>
      </div>

      <div 
        className="grid gap-8 justify-center" 
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 320px))' }}
      >
        {items.map(item => {
          const itemHasBid = bidAuctionIds.includes(item.id);
          return (
            <AuctionCard
              key={item.id}
              item={item}
              t={t}
              language={language}
              isVerified={isVerified}
              currentUserId={currentUserId}
              hasBid={itemHasBid}
              myMax={myBidsMap?.get(item.id)}
              isWatched={watchlist.includes(item.id)}
              onWatchToggle={() => onWatchToggle(item.id)}
              onClick={() => onAuctionClick(item)}
              onBidSubmit={onBidSubmit}
              onSellerClick={onSellerClick}
              onTimeUp={onTimeUp}
            />
          );
        })}
      </div>
    </div>
  );
};
