import React, { useState, useEffect } from 'react';
import { X, Star, Award, CheckCircle2, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { AuctionItem } from '../../types';
import { Portal } from '../ui/Portal';

export interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  auction: AuctionItem | null;
  sellerName?: string;
  language?: string;
  t?: (key: string) => string;
  onSubmitReview: (auctionId: string, sellerId: string, rating: number, comment: string) => Promise<boolean>;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  auction,
  sellerName,
  language = 'SLO',
  t,
  onSubmitReview
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && auction) {
      const initialRating = (auction as any).review_rating ? Number((auction as any).review_rating) : 5;
      const initialComment = (auction as any).review_comment || '';
      setRating(initialRating);
      setHoverRating(null);
      setComment(initialComment);
      setIsSubmitting(false);
    }
  }, [isOpen, auction]);

  if (!isOpen || !auction) return null;

  const currentActiveRating = hoverRating !== null ? hoverRating : rating;

  const ratingLabels: Record<number, string> = {
    1: 'Zelo slabo',
    2: 'Slabo',
    3: 'Povprečno',
    4: 'Zelo dobro',
    5: 'Odlično – Priporočam'
  };

  const auctionTitle: string = (typeof auction.title === 'string')
    ? auction.title
    : (typeof auction.title === 'object' && auction.title !== null)
    ? String((auction.title as any)[language] || (auction.title as any)['SLO'] || 'Dražba')
    : 'Dražba';

  const auctionImage = (Array.isArray(auction.images) && auction.images.length > 0)
    ? auction.images[0]
    : null;

  const displaySeller = sellerName || auction.sellerName || (auction as any).seller?.name?.SLO || 'Prodajalec';
  const sellerId = auction.sellerId || (auction as any).seller_id || (auction as any).seller?.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) return;
    setIsSubmitting(true);
    try {
      const success = await onSubmitReview(auction.id, sellerId, rating, comment.trim());
      if (success) {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-md z-[2000] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
        <div 
          className="bg-white w-full max-w-lg rounded-[3rem] p-6 sm:p-10 shadow-2xl relative border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-6 right-6 p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-[#0A1128] transition-colors disabled:opacity-50"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-3xl bg-[#FEBA4F]/15 border-2 border-[#FEBA4F]/30 text-[#0A1128] flex items-center justify-center mx-auto mb-4 shadow-md">
            <Award size={32} className="text-[#FEBA4F]" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0A1128] uppercase tracking-tighter">
            Oceni prodajalca
          </h2>
          <p className="text-xs sm:text-sm font-bold text-slate-400 mt-1">
            Vaša ocena in mnenje pomagata soustvarjati varno skupnost
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto pr-1 flex-1">
          {/* Auction item preview card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-200 shadow-sm relative">
              {auctionImage ? (
                <img 
                  src={auctionImage} 
                  alt={auctionTitle}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <ImageIcon size={24} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="inline-block text-[10px] font-black uppercase tracking-wider text-[#FEBA4F] bg-[#0A1128] px-2.5 py-0.5 rounded-md mb-1">
                Zmagana dražba
              </span>
              <h4 className="text-sm font-black text-[#0A1128] truncate" title={auctionTitle}>
                {auctionTitle}
              </h4>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-bold">
                <span>Prodajalec: <strong className="text-[#0A1128]">{displaySeller}</strong></span>
              </div>
            </div>
          </div>

          {/* Interactive Star Rating */}
          <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 text-center">
            <label className="block text-xs font-black text-[#0A1128] uppercase tracking-widest mb-3">
              Izberite oceno (1–5 zvezdic)
            </label>
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1.5 transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                >
                  <Star
                    size={36}
                    className={`transition-colors ${
                      star <= currentActiveRating
                        ? 'text-[#FEBA4F] fill-[#FEBA4F]'
                        : 'text-slate-200 hover:text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-sm font-black text-[#0A1128] uppercase tracking-wider mt-1 h-5">
              {ratingLabels[currentActiveRating] || ''}
            </p>
          </div>

          {/* Comment (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black text-[#0A1128] uppercase tracking-widest">
                Komentar / Mnenje
              </label>
              <span className="text-[11px] font-bold text-slate-400">
                (neobvezno)
              </span>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Opišite vašo izkušnjo s prodajalcem, hitrostjo pošiljanja ali prevzemom predmeta (po želji)..."
              rows={3}
              maxLength={1000}
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 font-bold text-sm text-[#0A1128] placeholder-slate-400 focus:outline-none focus:border-[#FEBA4F] transition-colors resize-none leading-relaxed"
            />
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              Oceno lahko oddate z ali brez komentarja.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-[#0A1128] rounded-2xl font-black uppercase tracking-wider text-xs transition-colors"
            >
              Prekliči
            </button>
            <button
              type="submit"
              disabled={isSubmitting || rating < 1}
              className="flex-1 py-4 bg-[#0A1128] hover:bg-[#FEBA4F] hover:text-[#0A1128] text-white rounded-2xl font-black uppercase tracking-wider text-xs transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Shranjevanje...</span>
                </>
              ) : (
                <>
                  <Star size={16} className="fill-current" />
                  <span>Oddaj oceno</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
};
