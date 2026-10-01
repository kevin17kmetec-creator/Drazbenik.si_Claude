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
    <div className="relative w-full h-[600px] mb-8 overflow-hidden bg-[#0A1128] group">
      <div className="absolute top-16 left-0 right-0 flex justify-center z-20 pointer-events-none">
        <div className="bg-[#FEBA4F] text-[#0A1128] px-6 py-2 rounded-full font-black uppercase text-[10px] tracking-widest animate-bounce shadow-lg">
          {t('trending')}
        </div>
      </div>

      <div 
        className="flex h-full transition-transform duration-700 ease-in-out" 
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {featuredItems.map((item, index) => (
          <div key={item.id} className="min-w-full h-full relative flex-shrink-0">
            <div className="absolute inset-0 flex">
              {[0, 1, 2].map((imgIndex) => {
                const imgSource = item.images[imgIndex] || item.images[0];
                return (
                  <div key={imgIndex} className="flex-1 h-full border-r border-[#0A1128]/20 last:border-0">
                    <img 
                      src={getImageUrl(imgSource)} 
                      className="w-full h-full object-cover opacity-40" 
                      alt={item.title[language] || item.title['SLO']}
                      loading={index === 0 ? "eager" : "lazy"}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                );
              })}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A1128] via-[#0A1128]/60 to-transparent"></div>
            
            <div className="absolute inset-0 flex flex-col justify-end items-center text-center p-6 text-white max-w-4xl mx-auto z-10 pb-24">
              <h2 className="text-5xl lg:text-7xl font-black mb-8 tracking-tighter uppercase italic">
                {item.title[language] || item.title['SLO']}
              </h2>
              <div className="flex items-center gap-12 mb-12">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">{t('currentBid')}</p>
                  <p className="text-5xl font-black text-[#FEBA4F]">€{item.currentBid.toLocaleString('sl-SI')}</p>
                </div>
                <StaticTimer endTime={item.endTime} />
              </div>
              <button 
                onClick={() => onSelectItem(item)} 
                className="bg-white text-[#0A1128] px-16 py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] transition-all shadow-2xl"
              >
                {t('openAuction')}
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <button 
        onClick={prev} 
        className="absolute left-8 top-1/2 -translate-y-1/2 z-20 text-[#FEBA4F] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      >
        <ChevronLeft size={64} strokeWidth={2.5} />
      </button>
      <button 
        onClick={next} 
        className="absolute right-8 top-1/2 -translate-y-1/2 z-20 text-[#FEBA4F] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      >
        <ChevronRight size={64} strokeWidth={2.5} />
      </button>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-3 z-10">
          {featuredItems.map((_, i) => (
              <button 
                key={i} 
                onClick={() => setActiveIndex(i)} 
                className={`h-1 rounded-full transition-all ${i === activeIndex ? 'w-12 bg-[#FEBA4F]' : 'w-4 bg-white/20 hover:bg-white/40'}`}
              ></button>
          ))}
      </div>
    </div>
  );
};
