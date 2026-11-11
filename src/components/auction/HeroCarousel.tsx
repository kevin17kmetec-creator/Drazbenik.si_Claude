import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
    <section className="relative w-full mb-8 overflow-hidden bg-[#0A1128]" aria-roledescription="carousel">
      <div 
        className="flex transition-transform duration-500 ease-out" 
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {featuredItems.map((item, index) => (
          <div key={item.id} className="min-w-full flex-shrink-0" aria-hidden={index !== activeIndex}>
            {/* Deutscher Kommentar: Geteiltes Layout - Angaben links, grosses Foto rechts (mobil: Foto oben) */}
            <div className="max-w-[1600px] mx-auto md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:min-h-[420px]">
              <div className="relative h-52 sm:h-64 md:h-auto md:order-2 cursor-pointer bg-[#131C3A]" onClick={() => onSelectItem(item)}>
                <img 
                  src={getImageUrl(item.images[0])} 
                  className="absolute inset-0 w-full h-full object-cover" 
                  alt={item.title[language] || item.title['SLO']}
                  loading={index === 0 ? "eager" : "lazy"}
                  referrerPolicy="no-referrer"
                />
                {/* Deutscher Kommentar: Weicher Uebergang vom Foto in die dunkle Textflaeche */}
                <div className="hidden md:block absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#0A1128] to-transparent" />
              </div>
              <div className="md:order-1 flex flex-col justify-center px-4 sm:px-6 py-6 md:py-12 md:pr-10 text-white">
                <p className="text-sm font-bold text-[#FEBA4F] mb-2 sm:mb-3">{t('trending')}</p>
                <h2 className="text-2xl sm:text-3xl lg:text-[2.75rem] lg:leading-[1.08] font-black tracking-tight line-clamp-3">
                  {item.title[language] || item.title['SLO']}
                </h2>
                <dl className="mt-5 sm:mt-7 flex items-end gap-8 sm:gap-12">
                  <div>
                    <dt className="text-xs sm:text-sm text-slate-300 mb-1">{t('currentBid')}</dt>
                    <dd className="text-2xl sm:text-4xl font-black tabular-nums">{item.currentBid.toLocaleString('sl-SI')} €</dd>
                  </div>
                  <div>
                    <dt className="text-xs sm:text-sm text-slate-300 mb-1">{t('timeLeft')}</dt>
                    <dd><StaticTimer endTime={item.endTime} /></dd>
                  </div>
                </dl>
                <div className="mt-6 sm:mt-8">
                  <button 
                    onClick={() => onSelectItem(item)} 
                    tabIndex={index === activeIndex ? 0 : -1}
                    className="bg-[#FEBA4F] text-[#0A1128] px-6 py-3 rounded-xl text-sm sm:text-base font-bold hover:bg-white transition-colors"
                  >
                    {t('openAuction')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {featuredItems.length > 1 && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pb-5 md:pb-0 md:absolute md:bottom-6 md:left-0 md:right-0 flex items-center md:justify-end gap-3 md:pointer-events-none">
          <div className="flex items-center gap-2 md:pointer-events-auto md:bg-[#0A1128]/80 md:rounded-full md:pl-1.5 md:pr-4 md:py-1.5">
            <button onClick={prev} aria-label="Prejšnja" className="w-9 h-9 flex items-center justify-center rounded-full border border-white/25 text-white hover:bg-white/10 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <button onClick={next} aria-label="Naslednja" className="w-9 h-9 flex items-center justify-center rounded-full border border-white/25 text-white hover:bg-white/10 transition-colors">
              <ChevronRight size={18} />
            </button>
            <span className="ml-2 text-sm text-slate-300 tabular-nums">{activeIndex + 1} / {featuredItems.length}</span>
          </div>
        </div>
      )}
    </section>
  );
};
