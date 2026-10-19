import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Gavel } from '../icons';
import { AuctionItem } from "../../types";
import { StaticTimer } from "@/src/components/ui/StaticTimer";

const getImageUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `https://storage.googleapis.com/auction-images/${path}`;
};

export const HeroCarousel: React.FC<{ items: AuctionItem[]; onSelectItem: (item: AuctionItem) => void; t: any; language: string }> = ({ items, onSelectItem, t, language }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [signedImages, setSignedImages] = useState<Record<string, string>>({});
  const featuredItems = useMemo(() => {
    const now = new Date();
    return items.filter(a => a.status === 'active' && new Date(a.endTime) > now).slice(0, 10);
  }, [items]);
  
  useEffect(() => {
    const fetchImages = async () => {
      const newSignedImages: Record<string, string> = {};
      for (const item of featuredItems) {
        if (item.images && item.images.length > 0) {
          const imgPath = item.images[0];
          if (imgPath.startsWith('http') || imgPath.startsWith('data:')) {
            newSignedImages[item.id] = imgPath;
          } else {
            try {
              const data = { signedUrl: `https://storage.googleapis.com/auction-images/${imgPath}` };
              if (data?.signedUrl) {
                newSignedImages[item.id] = data.signedUrl;
              }
            } catch (err) {
              console.error("Error fetching signed image for hero:", err);
            }
          }
        }
      }
      setSignedImages(newSignedImages);
    };
    fetchImages();
  }, [featuredItems]);

  const next = useCallback(() => setActiveIndex((prev) => (prev + 1) % featuredItems.length), [featuredItems.length]);
  const prev = useCallback(() => setActiveIndex((prev) => (prev - 1 + featuredItems.length) % featuredItems.length), [featuredItems.length]);

  useEffect(() => { 
    const timer = setInterval(next, 8000); 
    return () => clearInterval(timer); 
  }, [next, activeIndex]);

  if (featuredItems.length === 0) return null;

  return (
    <div className="relative w-full h-[430px] sm:h-[560px] mb-8 overflow-hidden bg-[#0A1128] group">
      <div
        className="flex h-full transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {featuredItems.map((item, index) => (
          <div key={item.id} className="min-w-full h-full relative flex-shrink-0">
            {/* Deutscher Kommentar: Dreiteilige Bildleiste wie ein Katalogtriptychon, links dunkler Verlauf fuer die Lesbarkeit */}
            <div className="absolute inset-0 flex gap-1.5 p-0">
              {[0, 1, 2].map((imgIndex) => {
                const imgSource = item.images[imgIndex] || item.images[0];
                return (
                  <div key={imgIndex} className="flex-1 h-full overflow-hidden">
                    <img
                      src={getImageUrl(imgSource)}
                      className="w-full h-full object-cover opacity-55"
                      alt={item.title[language] || item.title['SLO']}
                      loading={index === 0 ? "eager" : "lazy"}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A1128] via-[#0A1128]/75 to-[#0A1128]/10 sm:via-[#0A1128]/55"></div>
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0A1128] to-transparent"></div>

            <div className="absolute inset-0 flex flex-col justify-end items-start text-left px-5 sm:px-10 lg:px-16 text-white max-w-[1600px] mx-auto z-10 pb-16 sm:pb-24">
              <div className="inline-flex items-center gap-2 mb-4 sm:mb-6 text-[#FEBA4F] text-[11px] sm:text-xs font-bold uppercase tracking-[0.22em]">
                <Gavel size={18} />
                <span>{t('trending')}</span>
                <span className="h-px w-10 sm:w-16 bg-[#FEBA4F]/60"></span>
              </div>
              {/* Titel-Skalierung fuer mobile Bildschirme */}
              <h2 className="text-3xl sm:text-5xl lg:text-6xl leading-[1.05] mb-5 sm:mb-8 max-w-3xl line-clamp-3">
                {item.title[language] || item.title['SLO']}
              </h2>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6 sm:mb-9">
                <div>
                  <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-slate-300 mb-1">{t('currentBid')}</p>
                  <p className="font-display text-4xl sm:text-6xl text-[#FEBA4F] leading-none tabular-nums">€{item.currentBid.toLocaleString('sl-SI')}</p>
                </div>
                <StaticTimer endTime={item.endTime} />
              </div>
              <button
                onClick={() => onSelectItem(item)}
                className="bg-[#FEBA4F] text-[#0A1128] px-7 py-3.5 sm:px-12 sm:py-4 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-widest hover:bg-white transition-all shadow-2xl inline-flex items-center gap-2.5"
              >
                {t('openAuction')}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={prev}
        aria-label="Prejšnja"
        className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-[#FFFDF7]/90 text-[#0A1128] flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 hover:bg-[#FEBA4F] transition-all duration-300"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        onClick={next}
        aria-label="Naslednja"
        className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-[#FFFDF7]/90 text-[#0A1128] flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 hover:bg-[#FEBA4F] transition-all duration-300"
      >
        <ChevronRight size={22} />
      </button>

      <div className="absolute bottom-6 sm:bottom-9 left-5 sm:left-10 lg:left-16 flex items-center gap-2 z-10">
        <span className="text-[11px] font-bold tabular-nums text-slate-300 mr-2">{String(activeIndex + 1).padStart(2, '0')} / {String(featuredItems.length).padStart(2, '0')}</span>
        {featuredItems.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            aria-label={`Dražba ${i + 1}`}
            className={`h-1 rounded-full transition-all ${i === activeIndex ? 'w-10 bg-[#FEBA4F]' : 'w-4 bg-white/25 hover:bg-white/50'}`}
          ></button>
        ))}
      </div>
    </div>
  );
};
