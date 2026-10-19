import React, { useEffect, useState } from 'react';
import { 
  Clock, Lock, CheckCircle2, AlertCircle, Image as ImageIcon,
  ChevronLeft, ChevronRight, Eye, MapPin, Info, Gavel, Truck, Trophy,
  CreditCard, Landmark, Plus, Minus, X, Calendar as CalendarIcon, Phone, Mail, User,
  MessageSquare, Sparkles, Building2, Package, Tag, ShieldCheck, ExternalLink
} from '../icons';
import { doc, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, registerSnapshotListener } from "../../lib/firebase";
import { getIncrement, checkAndFinalizeAuctionClient } from "../../lib/utils";
import { calculateTotals } from "../../lib/feeCalculator";
import { ShareButton } from '../ui/ShareButton';
import { PaymentTimeline } from "../orders/PaymentTimeline";
import { useFeePreview } from "../../lib/useFeePreview";
import { formatAttributeLabel } from "../../lib/categoryAttributes";
import { toast } from 'sonner';
import { WinnerActions } from './WinnerActions';
import { Portal } from '../ui/Portal';
import { LoadingButton } from '../ui/Common';
import { cancelBankTransferPayment } from '../../lib/bankTransfer';
import { openCenteredPopup } from '../../lib/popup';
import { watchBankTransferPopup } from '../../lib/bankTransferWatcher';

const TimeBox = ({ value, label }: { value: number, label: string }) => (
  <div className="flex flex-col items-center justify-center bg-white/10 rounded-xl w-14 h-14 md:w-16 md:h-16 border border-white/10">
    <span className="text-xl md:text-2xl font-black text-white leading-none">{value.toString().padStart(2, '0')}</span>
    <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-[#FEBA4F] mt-1">{label}</span>
  </div>
);

export default function AuctionView({ 
  item, 
  onBack, 
  onBidSubmit, 
  onCheckout, 
  onSellerClick, 
  t, 
  language, 
  isVerified, 
  currentPlan, 
  isWatched, 
  onWatchToggle, 
  currentUserId, 
  myMax, 
  myBidsMap,
  user,
  setReceiptConfirmModal,
  openReviewModal,
  canLeaveReview,
  onOpenMessages,
  onOpenInvoice,
  setDeliveryMethodModal
}: { 
  item: any, 
  onBack: () => void, 
  onBidSubmit: (item: any, amount: number) => Promise<"error" | "ok" | "outbid" | "login_required" | "cancelled">,
  onCheckout: (item: any) => void,
  onSellerClick?: (sellerId: string) => void,
  t: any,
  language: string,
  isVerified: boolean,
  currentPlan: string,
  isWatched?: boolean,
  onWatchToggle?: () => void,
  currentUserId?: string,
  myMax?: number,
  myBidsMap?: Map<string, number>,
  user?: any,
  setReceiptConfirmModal?: (data: any) => void,
  openReviewModal?: (item: any) => void,
  canLeaveReview?: (item: any) => boolean,
  onOpenMessages?: (auctionId: string) => void,
  onOpenInvoice?: (auction: any) => void,
  setDeliveryMethodModal?: (data: any) => void
}) {
  const [auctionData, setAuctionData] = useState<any>(item);

  useEffect(() => {
    setAuctionData(item);
  }, [item]);

  useEffect(() => {
    if (!item?.id) return;
    const unsub = registerSnapshotListener(onSnapshot(doc(db, 'auctions', item.id), (snap) => {
      if (snap.exists()) {
        setAuctionData((prev: any) => ({ ...prev, id: snap.id, ...snap.data() }));
      }
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn("Dostop do dražbe ni dovoljen.");
      } else {
        console.error("Firestore napaka:", error);
      }
    }));
    return () => unsub();
  }, [item?.id]);

  const currentAuction = auctionData || item;

  const [bidsHistory, setBidsHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!item?.id) return;
    const q = query(
      collection(db, 'auctions', item.id, 'bids'),
      orderBy('created_at', 'desc'),
      limit(30)
    );
    const unsub = registerSnapshotListener(
      onSnapshot(q, (snap) => {
        setBidsHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => {
        if (err.code === 'permission-denied') {
          console.warn("Dostop do zgodovine ponudb ni dovoljen.");
        } else {
          console.error("Bids history snapshot error:", err);
        }
      })
    );
    return () => unsub();
  }, [item?.id]);

  const isPaid = Boolean(
    currentAuction?.payment_status === 'paid' || 
    (currentAuction as any)?.post_auction_status === 'paid' || 
    currentAuction?.status === 'paid' || 
    (currentAuction as any)?.paid_at
  );

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [signedImages, setSignedImages] = useState<string[]>([]);
  const [currentBid, setCurrentBid] = useState<number>(currentAuction?.currentBid || currentAuction?.current_price || 0);
  const [endTime, setEndTime] = useState<Date>(currentAuction?.endTime ? new Date(currentAuction.endTime) : new Date());
  const [bidCount, setBidCount] = useState<number>(currentAuction?.bidCount || currentAuction?.bid_count || 0);
  
  useEffect(() => {
    setCurrentBid(currentAuction?.currentBid || currentAuction?.current_price || 0);
    setEndTime(currentAuction?.endTime ? new Date(currentAuction.endTime) : new Date());
    setBidCount(currentAuction?.bidCount || currentAuction?.bid_count || 0);
  }, [currentAuction]);

  useEffect(() => {
    if (!currentAuction?.images) return;
    const urls = currentAuction.images.map((imgPath: string) => {
      if (imgPath.startsWith('http') || imgPath.startsWith('blob:') || imgPath.startsWith('data:')) return imgPath;
      const publicUrl = `https://storage.googleapis.com/auction-images/${imgPath}`;
      return publicUrl || imgPath;
    });
    setSignedImages(urls);
    if (urls.length > 0) setSelectedImage(urls[0]);
  }, [currentAuction?.images]);

  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const end = (currentAuction?.endTime ? new Date(currentAuction.endTime) : new Date()).getTime();
    const now = new Date().getTime();
    return Math.max(0, Math.floor((end - now) / 1000));
  });
  const [bidAmount, setBidAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bidSuccess, setBidSuccess] = useState(false);

  useEffect(() => {
    if (!currentAuction || currentAuction.status !== 'active') return;
    const updateTimer = () => {
      const end = endTime.getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(diff);
      if (diff === 0 && currentAuction?.id) {
        checkAndFinalizeAuctionClient(currentAuction.id);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [endTime, currentAuction?.status, currentAuction?.id]);

  const isWinner = Boolean(currentUserId && (
    currentAuction.winnerId === currentUserId || 
    currentAuction.winner_id === currentUserId ||
    currentAuction.second_winner_id === currentUserId ||
    currentAuction.secondWinnerId === currentUserId ||
    (currentAuction.second_highest_bidder_id === currentUserId && (currentAuction.post_auction_status === 'offered_2nd' || currentAuction.post_auction_status === 'awaiting_payment_2nd'))
  ));
  const isSeller = Boolean(currentUserId && (
    currentAuction.sellerId === currentUserId || 
    currentAuction.seller_id === currentUserId ||
    (currentAuction.seller && ((currentAuction.seller as any).id === currentUserId || currentAuction.seller.id === currentUserId))
  ));
  const isEnded = currentAuction.status === 'completed' || currentAuction.status === 'cancelled' || isPaid || timeLeft === 0;

  const effectiveMyMax = myMax !== undefined ? myMax : (myBidsMap?.get(currentAuction?.id));
  const currentLeadingAmount = isWinner 
    ? Math.max(currentBid, Number(effectiveMyMax || currentBid))
    : currentBid;
  const minNextBid = currentLeadingAmount + getIncrement(currentLeadingAmount);

  useEffect(() => {
    const baseline = isWinner 
      ? Math.max(currentBid, Number(effectiveMyMax || currentBid))
      : currentBid;
    const requiredMin = baseline + getIncrement(baseline);
    if (!bidAmount || Number(bidAmount) < requiredMin) {
      setBidAmount(String(requiredMin));
    }
  }, [currentBid, isWinner, effectiveMyMax]);

  const handleAdjustBid = (dir: 'up' | 'down') => {
    const currentNum = Number(bidAmount) || minNextBid;
    const step = getIncrement(currentNum);
    if (dir === 'up') {
      setBidAmount(String(Math.max(currentNum + step, minNextBid)));
    } else {
      setBidAmount(String(Math.max(currentNum - step, minNextBid)));
    }
  };

  const handlePlaceBid = async () => {
    if (!bidAmount || isNaN(Number(bidAmount)) || isSeller) return;
    if (!onBidSubmit) {
      toast.error("Za oddajo ponudbe se morate prijaviti ali registrirati.");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await onBidSubmit(currentAuction, Number(bidAmount));
      if (result === 'ok') {
          setBidSuccess(true);
          setTimeout(() => setBidSuccess(false), 3000);
      } else if (result === 'outbid') {
          setError(t('bidOutbid'));
      } else if (result === 'error') {
          // Handled by toast
      }
    } catch (err: any) {
      setError(err.message || t('bidFailed'));
    }
    setLoading(false);
  };

  const handleCheckout = async () => {
    if (isPaid) return;
    onCheckout(currentAuction);
  };

  const [cancellingBt, setCancellingBt] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [openingInstructions, setOpeningInstructions] = useState(false);

  // Deutscher Kommentar: Ruft die URL der Zahlungsanweisungen fuer die Bankueberweisung ab und oeffnet diese in neuem Tab
  const handleOpenBankTransferInstructions = async () => {
    if (!user || !currentAuction?.id) return;
    setOpeningInstructions(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/checkout/bank-transfer-instructions?auction_id=${encodeURIComponent(currentAuction.id)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data?.url) {
        const instrPopup = openCenteredPopup(data.url, '_blank', 560, 820);
        watchBankTransferPopup(instrPopup, currentAuction.id);
      } else {
        toast.error(data?.error || "Navodila za nakazilo trenutno niso na voljo.");
      }
    } catch (err: any) {
      toast.error(err.message || "Napaka pri odpiranju navodil.");
    } finally {
      setOpeningInstructions(false);
    }
  };

  // Deutscher Kommentar: Bricht die anstehende Bankueberweisung ueber die gemeinsame Hilfsfunktion ab
  const handleCancelBankTransfer = async () => {
    if (!user || !currentAuction?.id) return;
    setCancellingBt(true);
    try {
      const res = await cancelBankTransferPayment({
        auctionId: currentAuction.id,
        user
      });
      if (res.success) {
        setShowCancelConfirm(false);
        toast.success("Nakazilo je preklicano. Dražbo lahko zdaj plačate s kartico.");
      } else {
        toast.error(res.error || "Napaka pri preklicu nakazila.");
      }
    } catch (err: any) {
      toast.error(err.message || "Napaka pri preklicu.");
    } finally {
      setCancellingBt(false);
    }
  };

  if (!item) return <div className="p-10 text-center font-bold text-slate-500 animate-pulse">{t('loading')}...</div>;

  const d = Math.floor(timeLeft / (3600 * 24));
  const h = Math.floor((timeLeft % (3600 * 24)) / 3600);
  const m = Math.floor((timeLeft % 3600) / 60);
  const s = Math.floor(timeLeft % 60);

  const auctionDate = endTime;
  const isValidDate = !isNaN(auctionDate.getTime());
  const title = item.title?.[language] || item.title?.['SLO'] || t('auctionFallback');
  const description = item.description?.[language] || item.description?.['SLO'] || t('noDescription');
  const location = item.location?.[language] || item.location?.['SLO'] || t('slovenia');

  const currentPrice = currentAuction.current_price || currentAuction.currentPrice || currentAuction.starting_price || 0;
  const itemPriceCents = Math.round(Number(currentPrice) * 100);
  const { data: previewData } = useFeePreview({
    amount: Number(currentPrice),
    enabled: !!currentUserId && Number(currentPrice) > 0
  });

  const guestTotals = calculateTotals({
    itemPriceCents,
    tier: 'FREE',
    countryCode: 'SI',
    isBusiness: false,
    hasValidVatId: false
  });

  const activeFeeCents = currentUserId ? (previewData?.feeCents ?? guestTotals.feeCents) : guestTotals.feeCents;
  const activeFeePercent = currentUserId ? (previewData?.feePercent ?? guestTotals.feePercent) : guestTotals.feePercent;
  const activeVatCents = currentUserId ? (previewData?.vatCents ?? guestTotals.vatCents) : guestTotals.vatCents;
  const grossFeeCents = activeFeeCents + activeVatCents;
  const grossFeeEur = grossFeeCents / 100;
  const vatRateUsed = currentUserId ? (previewData?.vatRate ?? 22) : 22;
  const activeFeeIsMinimum = currentUserId ? (previewData?.feeIsMinimum ?? guestTotals.feeIsMinimum) : guestTotals.feeIsMinimum;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 bg-slate-50/50 min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-[#0A1128] transition-colors bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
          <ChevronLeft size={16} /> {t('backToList')}
        </button>
      </div>

      <div className="bg-white rounded-[1.35rem] overflow-hidden shadow-xl border border-slate-100 p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[auto_1fr] gap-6">
          <div className="lg:col-span-8 lg:col-start-1 lg:row-start-1 order-1">
            <div className="bg-white p-6 rounded-[1.35rem] border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start gap-4 mb-6">
                <div className="flex flex-col gap-2">
                  <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-[#0A1128] leading-tight">{title}</h1>
                  {isPaid ? (
                    <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest text-green-700 w-fit shadow-sm">
                      <CheckCircle2 size={16} className="text-green-600" /> {t('paid') || 'Plačano'}
                    </div>
                  ) : isWinner && (
                    <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest text-green-600 w-fit animate-pulse">
                      <Trophy size={12} /> {t('leading') || 'Vodilni'}
                    </div>
                  )}
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); onWatchToggle?.(); }}
                  className={`flex flex-col items-center justify-center p-3 border rounded-2xl transition-all min-w-[80px] shrink-0 group ${isWatched ? 'bg-[#FEBA4F] border-[#FEBA4F]' : 'bg-slate-50 border-slate-200 hover:border-[#FEBA4F] hover:bg-white'}`}
                >
                  <Eye size={20} className={`${isWatched ? 'text-[#0A1128]' : 'text-slate-400 group-hover:text-[#FEBA4F]'} transition-colors`} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${isWatched ? 'text-[#0A1128]' : 'text-slate-500 group-hover:text-[#0A1128]'}`}>{t('watch')}</span>
                </button>
                <ShareButton item={item} language={language} t={t} variant="tile" />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex-1 bg-white border border-slate-200 rounded-[1.35rem] p-4 flex items-center justify-center relative min-h-[300px] max-h-[55vh] shadow-sm overflow-hidden group">
                  {signedImages.length > 0 ? (
                    <>
                      <img 
                        src={selectedImage || signedImages[0]} 
                        alt="Main" 
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain max-h-[55vh] cursor-pointer" 
                        onClick={() => setLightboxImage(selectedImage || signedImages[0])}
                      />
                      {signedImages.length > 1 && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); const idx = signedImages.indexOf(selectedImage || signedImages[0]); setSelectedImage(signedImages[(idx - 1 + signedImages.length) % signedImages.length]); }}
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/50 hover:bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <ChevronLeft size={24} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); const idx = signedImages.indexOf(selectedImage || signedImages[0]); setSelectedImage(signedImages[(idx + 1) % signedImages.length]); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/50 hover:bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <ChevronRight size={24} />
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="text-center text-slate-300">
                      <ImageIcon size={60} className="mx-auto mb-4 opacity-50" />
                      <p className="text-xs font-black uppercase tracking-widest">{t('loadingImages')}</p>
                    </div>
                  )}
                </div>
                {signedImages.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {signedImages.map((img: string, idx: number) => (
                      <button 
                        key={idx} 
                        onClick={() => setSelectedImage(img)}
                        className={`w-16 h-16 sm:w-20 sm:h-20 aspect-square bg-white border-2 rounded-xl overflow-hidden shrink-0 transition-all ${selectedImage === img || (!selectedImage && idx === 0) ? 'border-[#FEBA4F] shadow-lg scale-105' : 'border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100'}`}
                      >
                        <img src={img} alt={`Thumb ${idx}`} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:row-span-2 order-2 space-y-6">
            <div className="bg-[#0A1128] text-white border border-white/5 rounded-[1.35rem] p-5 flex flex-col w-full shadow-2xl relative overflow-hidden">
              {/* Deutscher Kommentar: Bei beendeter Auktion nimmt der Overlay-Container am normalen Layoutfluss teil (relative w-full), damit die Karte mit dem Inhalt dynamisch waechst */}
              {isEnded && (
                <div className="relative w-full bg-[#0A1128]/95 backdrop-blur-md z-10 flex flex-col items-center justify-center p-4 sm:p-8 text-center">
                  {isPaid ? (
                    <div className="w-full max-w-md bg-green-500/10 border-2 border-green-500/30 rounded-3xl p-6 mb-2 flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mb-4 text-green-400 shadow-lg shadow-green-500/10">
                        <CheckCircle2 size={36} />
                      </div>
                      <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2">
                        {t('auctionPaid') || 'Dražba plačana'}
                      </h3>
                      <div className="bg-white/10 rounded-2xl px-6 py-3 mb-4 border border-white/10 w-full">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Končni znesek</p>
                        <p className="text-2xl font-black text-[#FEBA4F]">€ {(currentAuction.currentBid || currentAuction.current_price || currentBid)?.toLocaleString('sl-SI')}</p>
                      </div>
                      <p className="text-xs text-slate-200 font-bold leading-relaxed mb-3">
                        {isWinner
                          ? (t('winnerPaidNotice') || 'Čestitamo! Vaše plačilo je bilo potrjeno. Prodajalec pripravlja pošiljko.')
                          : isSeller
                            ? (t('sellerPaidNotice') || 'Kupec je uspešno plačal dražbo. Sredstva so varno shranjena v vaših zadržanih sredstvih.')
                            : (t('auctionCompletedPaid') || 'Dražba je bila uspešno zaključena in plačana.')}
                      </p>
                      {currentAuction.paid_at && (
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg">
                          Plačano dne: {new Date(currentAuction.paid_at).toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}

                      {/* WinnerActions nur fuer den Gewinner rendern (DEL D) */}
                      {isWinner && setReceiptConfirmModal && openReviewModal && canLeaveReview && (
                        <div className="w-full mt-4 pt-4 border-t border-white/10 text-slate-900">
                          <WinnerActions 
                            wonItem={currentAuction}
                            user={user}
                            isPaid={true}
                            setReceiptConfirmModal={setReceiptConfirmModal}
                            openReviewModal={openReviewModal}
                            canLeaveReview={canLeaveReview}
                            onOpenMessages={onOpenMessages}
                            onOpenInvoice={onOpenInvoice}
                            onOpenDeliveryChooser={setDeliveryMethodModal ? (auctionId: string) => setDeliveryMethodModal({ isOpen: true, auctionId, deliveryMethod: null }) : undefined}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <CheckCircle2 size={48} className="text-green-500 mb-4" />
                      <h3 className="text-2xl font-black uppercase tracking-tighter text-white mb-2">
                        {t('auctionEnded') || 'Dražba zaključena'}
                      </h3>
                      <div className="bg-white/10 rounded-2xl px-6 py-4 mb-6 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Končna cena</p>
                        <p className="text-3xl font-black text-[#FEBA4F]">€ {(currentAuction.currentBid || currentAuction.current_price || currentBid)?.toLocaleString('sl-SI') || 0}</p>
                      </div>
                      
                      {isWinner ? (
                        currentAuction.bank_transfer_pending === true ? (
                          <div className="bg-amber-500/10 border border-[#FEBA4F]/20 rounded-2xl p-6 mb-3 text-left">
                            <h4 className="text-lg font-black text-[#FEBA4F] uppercase tracking-tight mb-2 flex items-center gap-2">
                              <ShieldCheck size={20} />
                              Plačilo z nakazilom
                            </h4>
                            <p className="text-slate-300 text-sm font-bold mb-4">
                              Izbrali ste plačilo z bančnim nakazilom (SEPA). Znesek nakažite po navodilih, ki jih lahko kadar koli odprete s spodnjim gumbom. Plačilo se potrdi samodejno, ko denar prispe.
                            </p>
                            {currentAuction.bank_transfer_deadline_at && (
                              <div className="text-xs text-slate-400 font-bold mb-4">
                                Rok za prejem nakazila: <span className="text-[#FEBA4F]">{new Date(currentAuction.bank_transfer_deadline_at).toLocaleString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            )}
                            <button
                              onClick={handleOpenBankTransferInstructions}
                              disabled={openingInstructions}
                              className="w-full text-xs bg-[#FEBA4F] hover:bg-white text-[#0A1128] font-black uppercase tracking-wider py-3.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mb-2 disabled:opacity-50 cursor-pointer"
                            >
                              {openingInstructions ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-[#0A1128] border-t-transparent rounded-full animate-spin" />
                                  <span>Nalaganje navodil...</span>
                                </>
                              ) : (
                                <>
                                  <ExternalLink size={15} />
                                  <span>Odpri navodila za nakazilo</span>
                                </>
                              )}
                            </button>
                            <LoadingButton
                              onClick={() => setShowCancelConfirm(true)}
                              disabled={cancellingBt}
                              loading={cancellingBt}
                              loadingText="Prekinjam..."
                              className="w-full text-xs bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-wider py-3 px-4 rounded-xl border border-slate-700 transition-all disabled:opacity-50 cursor-pointer"
                            >
                              Raje plačam s kartico
                            </LoadingButton>
                            <p className="text-[11px] text-slate-400 font-bold leading-snug mt-2.5 text-center">
                              Če nakazila še niste poslali, ga lahko kadarkoli zamenjate s plačilom s kartico.
                            </p>
                          </div>
                        ) : (
                          <>
                            <p className="text-slate-300 font-bold mb-6">
                              {t('winnerNotice') || 'Čestitamo, zmagali ste! Prosimo, dokončajte plačilo.'}
                            </p>
                            <LoadingButton 
                              onClick={handleCheckout}
                              disabled={loading || isPaid}
                              loading={loading}
                              loadingText="Odpiram plačilo..."
                              className="w-full bg-[#FEBA4F] text-[#0A1128] px-8 py-4 rounded-xl font-black uppercase tracking-widest hover:bg-white transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 mb-3"
                            >
                              <Lock size={18} /> {t('payNow') || 'Plačaj zdaj'}
                            </LoadingButton>
                          </>
                        )
                      ) : isSeller ? (
                        currentAuction.bank_transfer_pending === true ? (
                          <div className="bg-amber-500/10 border border-[#FEBA4F]/20 rounded-2xl p-6 mb-3 text-left">
                            <h4 className="text-lg font-black text-[#FEBA4F] uppercase tracking-tight mb-2 flex items-center gap-2">
                              <ShieldCheck size={20} />
                              Plačilo v obdelavi
                            </h4>
                            <p className="text-slate-300 text-sm font-bold">
                              Kupec je izbral plačilo z bančnim nakazilom. Čakamo na potrditev prejema sredstev s strani našega plačilnega partnerja (to lahko traja do 3 delovne dni). Ko bo plačilo potrjeno, vas bomo nemudoma obvestili.
                            </p>
                          </div>
                        ) : (
                          <>
                            <p className="text-slate-300 font-bold mb-4">
                              {t('sellerWinnerNotice') || 'Zmagovalec je bil obveščen in preusmerjen na plačilo.'}
                            </p>
                          </>
                        )
                      ) : (
                        <p className="text-slate-300 font-bold">
                          {t('notWinnerNotice') || 'Dražba se je končala. Niste zmagovalec.'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Deutscher Kommentar: Biet- und Zeitelemente bei beendeter Auktion vollstaendig ausblenden, um leeren Raum zu vermeiden */}
              <div className={isEnded ? "hidden" : "contents"}>
                <div className="flex justify-center items-center gap-2 mb-2">
                  <TimeBox value={d} label={t('days')} /> <span className="text-2xl font-black text-slate-500 mb-4">:</span>
                  <TimeBox value={h} label={t('hours')} /> <span className="text-2xl font-black text-slate-500 mb-4">:</span>
                  <TimeBox value={m} label={t('minutes')} /> <span className="text-2xl font-black text-slate-500 mb-4">:</span>
                  <TimeBox value={s} label={t('seconds')} />
                </div>
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                  {isValidDate ? `${auctionDate.toLocaleDateString('sl-SI')}, ${auctionDate.toLocaleTimeString('sl-SI', {hour: '2-digit', minute:'2-digit'})} ${t('uhr')}` : t('unknown')}
                </p>

                <div className="grid grid-cols-2 gap-y-4 gap-x-4 w-full mb-4">
                  <div className="text-center border-r border-white/10">
                    <p className="text-2xl font-black text-[#FEBA4F]">{currentAuction.bidCount || currentAuction.bid_count || bidCount || 0}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{t('bidCount')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-white">€ {currentAuction.currentBid || currentAuction.current_price || currentBid || 0}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{t('startingPrice')}</p>
                  </div>
                  
                  <div className="text-center border-r border-white/10 pt-4 border-t">
                    <p className="text-2xl font-black text-green-400">
                      {isWinner ? `€ ${effectiveMyMax || currentAuction.currentBid || currentAuction.current_price || currentBid || '-'}` : '-'}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1 flex items-center justify-center gap-1"><Lock size={10}/> {t('myMaxBid')}</p>
                  </div>
                  <div className="text-center pt-4 border-t border-white/10">
                    <p className="text-4xl font-black text-[#FEBA4F]">€ {currentAuction.currentBid || currentAuction.current_price || currentBid || 0}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{t('currentBid')}</p>
                  </div>
                </div>
                {!isEnded && !isSeller && (
                <p className="text-[10px] font-bold text-slate-400 text-center mb-4 leading-relaxed bg-white/5 p-3 rounded-xl">
                    {isWinner 
                      ? (t('proxyBidLeadingTip') || 'Ste vodilni ponudnik! Vnesite višji znesek, če želite povišati vašo maksimalno ponudbo.')
                      : (t('proxyBidTip') || 'Vnesite najvišji znesek, ki ste ga pripravljeni plačati. Vaša maksimalna ponudba ostane skrivnost. Sistem bo samodejno višal ponudbo v vašem imenu.')}
                </p>
                )}

                {error && <div className="mb-4 p-3 bg-red-500/10 text-red-400 rounded-xl font-bold text-[10px] uppercase tracking-widest text-center border border-red-500/20">{error}</div>}
                {bidSuccess && <div className="mb-4 p-3 bg-green-500/10 text-green-400 rounded-xl font-bold text-[10px] uppercase tracking-widest text-center border border-green-500/20">{t('bidSuccessMsg')}</div>}

                {!isEnded && (
                  isSeller ? (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center my-2 mt-auto">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[#FEBA4F] flex items-center justify-center mx-auto mb-2">
                        <Lock size={18} />
                      </div>
                      <p className="text-xs font-black uppercase tracking-widest text-[#FEBA4F] mb-1">
                        Vaša dražba
                      </p>
                      <p className="text-xs font-bold text-slate-400">
                        Kot avtor dražbe ne morete oddajati ponudb na lasten predmet.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 w-full mt-auto">
                      <div className="relative flex-1">
                        <button 
                          onClick={() => handleAdjustBid('down')}
                          className="absolute left-2 top-2 bottom-2 aspect-square bg-white/10 border border-white/10 rounded-lg flex items-center justify-center hover:border-[#FEBA4F] hover:text-[#FEBA4F] text-slate-400 transition-colors"
                        >
                          <Minus size={20} />
                        </button>
                        <input 
                          type="text" 
                          value={`€ ${bidAmount}`}
                          readOnly
                          className="w-full h-14 bg-white/5 border-2 border-white/10 rounded-xl px-14 font-black text-xl text-white outline-none focus:border-[#FEBA4F] text-center transition-colors"
                        >
                        </input>
                        <button 
                          onClick={() => handleAdjustBid('up')}
                          className="absolute right-2 top-2 bottom-2 aspect-square bg-white/10 border border-white/10 rounded-lg flex items-center justify-center hover:border-[#FEBA4F] hover:text-[#FEBA4F] text-slate-400 transition-colors"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                      <button 
                        onClick={handlePlaceBid}
                        disabled={loading}
                        className={`h-14 px-8 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 w-full flex items-center justify-center gap-2 ${
                          isVerified && onBidSubmit ? 'bg-[#FEBA4F] text-[#0A1128] hover:bg-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                        }`}
                      >
                        {loading ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : !isVerified || !onBidSubmit ? (
                          <>
                            <Lock size={16} />
                            <span>{isWinner ? (t('increaseBid') || 'Zvišaj ponudbo') : t('placeBid')}</span>
                          </>
                        ) : (
                          <span>{isWinner ? (t('increaseBid') || 'Zvišaj ponudbo') : t('placeBid')}</span>
                        )}
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Key Buyer Decision Information: Delivery, Location, Condition */}
            <div className="bg-white border-2 border-slate-200/90 rounded-[1.35rem] overflow-hidden shadow-lg">
              <div className="p-3 border-b border-slate-100 bg-[#0A1128] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#FEBA4F] text-[#0A1128] flex items-center justify-center font-black">
                    <Truck size={14} />
                  </div>
                  <h3 className="font-black uppercase tracking-wider text-xs">
                    Prevzem in ključni podatki
                  </h3>
                </div>
                <span className="text-[10px] font-black uppercase text-[#FEBA4F] tracking-widest bg-white/10 px-2 py-0.5 rounded-md">
                  Pomembno
                </span>
              </div>
              
              <div className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  {/* Delivery Option */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                      <Truck size={12} className="text-[#FEBA4F]" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Način predaje:</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                      <p className="text-xs font-extrabold text-[#0A1128]">
                        {(currentAuction.delivery_option === 'both' || (currentAuction as any).delivery_method === 'both')
                          ? 'Oboje (pošta / osebno)'
                          : (currentAuction.delivery_option === 'pickup_only' || (currentAuction as any).delivery_method === 'pickup')
                            ? 'Samo osebni prevzem'
                            : 'Samo pošiljanje po pošti'}
                      </p>
                      {/* Shipping cost info */}
                      {currentAuction.delivery_option !== 'pickup_only' && (currentAuction as any).delivery_method !== 'pickup' && (
                        <p className="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-1">
                          <Tag size={10} className="text-[#FEBA4F]" />
                          <span>
                            {(currentAuction as any).shipping_fee_type === 'fixed' && (currentAuction as any).shipping_cost !== undefined && (currentAuction as any).shipping_cost !== null
                              ? Number((currentAuction as any).shipping_cost) === 0
                                ? 'Brezplačna poštnina'
                                : `Fiksno €${Number((currentAuction as any).shipping_cost).toFixed(2)}`
                              : 'Po tarifi pošte'}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Condition */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                      <Sparkles size={12} className="text-[#FEBA4F]" />
                      <p className="text-[10px] font-black uppercase tracking-widest">{t('condition') || 'Stanje'}:</p>
                    </div>
                    {(() => {
                      const condText = typeof currentAuction.condition === 'string'
                        ? currentAuction.condition
                        : (currentAuction.condition?.[language] || currentAuction.condition?.['SLO'] || 'Rabljeno');
                      const isNew = condText.toLowerCase().includes('nov');
                      return (
                        <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-1 ${
                          isNew ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200/80 text-[#0A1128]'
                        }`}>
                          <span className="text-xs font-extrabold truncate">{condText}</span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded shrink-0 ${
                            isNew ? 'bg-emerald-200/60 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {isNew ? 'Brezhibno' : 'Pregledano'}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Location */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                      <MapPin size={12} className="text-[#FEBA4F]" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Lokacija:</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                      <p className="text-xs font-extrabold text-[#0A1128] truncate">
                        {location || (typeof currentAuction.location === 'object' ? currentAuction.location?.SLO : currentAuction.location) || 'Slovenija'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold truncate">
                        {currentAuction.region || 'Slovenija'}
                      </p>
                    </div>
                  </div>

                  {/* Seller Info */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                      <Building2 size={12} className="text-[#FEBA4F]" />
                      <p className="text-[10px] font-black uppercase tracking-widest">{t('seller')}:</p>
                    </div>
                    <div className="flex flex-col gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                      {(currentAuction as any).is_seller_deleted || currentAuction.sellerName === "Uporabnik je bil izbrisan" || ((currentAuction as any).seller && ((currentAuction as any).seller.is_deleted || (currentAuction as any).seller.isDeleted)) ? (
                        <span className="text-xs font-bold text-slate-400 truncate">
                          Izbrisan uporabnik
                        </span>
                      ) : (
                        <button 
                          onClick={() => {
                            const sellerInput = (currentAuction as any).seller || currentAuction.sellerId || (currentAuction as any).seller_id;
                            if (sellerInput && onSellerClick) onSellerClick(sellerInput);
                          }}
                          className="text-sm font-black text-[#0A1128] hover:text-[#FEBA4F] transition-colors break-words text-left underline underline-offset-2"
                        >
                          {currentAuction.sellerName && currentAuction.sellerName !== "Neznan prodajalec" && currentAuction.sellerName !== "Neznan Prodajalec" 
                            ? currentAuction.sellerName 
                            : (t('unknownSeller') || 'Prodajalec')}
                        </button>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] font-black uppercase text-slate-600 bg-slate-200/70 px-1.5 py-0.5 rounded shrink-0">
                        {(currentAuction as any).seller?.user_type === 'business' ? 'Podjetje' : 'Zasebna oseba'}
                      </span>
                      <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-100/70 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                        <ShieldCheck size={10} /> Preverjen
                      </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {(currentAuction as any).seller?.user_type === 'business'
                        ? 'Za nakup od podjetja veljajo pravice potrošnika.'
                        : 'Za nakup od zasebne osebe pravice potrošnika ne veljajo.'}
                    </p>
                  </div>

                  {/* Fees and Terms */}
                  <div className="col-span-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                      <span>{activeFeeIsMinimum ? 'Provizija platforme (minimalna)' : `Provizija platforme (${activeFeePercent} %)`}:</span>
                      <span className="font-extrabold text-[#0A1128]">€{(activeFeeCents / 100).toFixed(2)}</span>
                    </div>
                    {activeFeeIsMinimum && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Uporabljena je minimalna provizija 1,00 €.
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Vključuje {vatRateUsed} % DDV in zaščito kupca (escrow hramba sredstev).
                      {!currentUserId && <span className="block text-[#FEBA4F] font-bold mt-0.5">Za vas se izračuna ob prijavi.</span>}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Specifications Card (if any are filled) */}
            {(() => {
              const specs = (currentAuction.specifications || {}) as Record<string, any>;
              const entries: { key: string; val: string }[] = [];
              for (const [k, v] of Object.entries(specs)) {
                if (typeof v === 'string' && v.trim() !== '') {
                  entries.push({ key: k, val: v });
                } else if (v && typeof v === 'object') {
                  for (const [subK, subV] of Object.entries(v)) {
                    if (typeof subV === 'string' && subV.trim() !== '') {
                      entries.push({ key: subK, val: subV });
                    }
                  }
                }
              }
              if (entries.length === 0) return null;

              return (
                <div className="bg-white border-2 border-slate-200/90 rounded-[1.35rem] overflow-hidden shadow-lg animate-in fade-in">
                  <div className="p-3 border-b border-slate-100 bg-[#0A1128] text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#FEBA4F] text-[#0A1128] flex items-center justify-center font-black">
                        <Tag size={14} />
                      </div>
                      <h3 className="font-black uppercase tracking-wider text-xs">
                        Specifikacije artikla
                      </h3>
                    </div>
                    <span className="text-[10px] font-black uppercase text-slate-300 bg-white/10 px-2 py-0.5 rounded-md">
                      {currentAuction.category || 'Podrobnosti'}
                    </span>
                  </div>

                  <div className="p-4 divide-y divide-slate-100">
                    {entries.map(({ key, val }) => (
                      <div key={key} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-4 text-xs">
                        <span className="font-bold text-slate-500 uppercase tracking-wider">
                          {formatAttributeLabel(key)}:
                        </span>
                        <span className="font-extrabold text-[#0A1128] text-right bg-slate-50 border border-slate-200/60 px-2.5 py-0.5 rounded-lg">
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="lg:col-span-8 lg:col-start-1 lg:row-start-2 self-start order-3 space-y-6">
            {isPaid && (isSeller || isWinner) && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                <PaymentTimeline auctionId={currentAuction.id} />
              </div>
            )}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-[#0A1128] font-black uppercase tracking-widest text-xs">{t('description')}</h3>
              </div>
              <div className="p-6">
                <p className="text-slate-600 font-bold leading-relaxed whitespace-pre-line text-sm">
                  {description}
                </p>
              </div>
            </div>

            {isEnded && (isSeller || isWinner) && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-[#0A1128] font-black uppercase tracking-widest text-xs">{t('biddingHistory')}</h3>
              </div>
              <div className="p-0">
                {bidsHistory && bidsHistory.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {bidsHistory.map((bid: any, idx: number) => (
                      <div key={bid.id || idx} className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                            <User size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-[#0A1128]">
                              {bid.bidder_alias || t('bidder')}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400">
                              {bid.created_at ? new Date(bid.created_at).toLocaleString('sl-SI') : '-'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-[#FEBA4F]">€ {Number(bid.price || 0).toLocaleString('sl-SI')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 font-bold text-sm">
                    {t('noBidsYet')}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {showCancelConfirm && (
        <Portal>
          {/* Deutscher Kommentar: Responsives Bestaetigungsmodal fuer Stornierung der Bankueberweisung in AuctionView */}
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4">
            <div 
              className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" 
              onClick={() => { if (!cancellingBt) setShowCancelConfirm(false); }} 
            />
            <div className="relative bg-white border border-slate-200 rounded-3xl p-5 sm:p-8 max-w-md w-full shadow-2xl text-center z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[92dvh] overflow-y-auto">
              <div className="bg-amber-100 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-5 text-amber-600">
                <AlertCircle size={28} />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#0A1128] uppercase tracking-tighter mb-2 sm:mb-3">
                Preklic bančnega nakazila
              </h3>
              <p className="text-slate-600 font-bold mb-5 sm:mb-6 text-xs sm:text-sm leading-relaxed">
                Nakazilo bo preklicano. Če ste denar že nakazali, plačila ne preklicujte. Nadaljujem?
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleCancelBankTransfer}
                  disabled={cancellingBt}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 px-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-wider text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg min-h-[44px]"
                >
                  {cancellingBt ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Prekinjam...</span>
                    </>
                  ) : (
                    <span>Prekliči nakazilo</span>
                  )}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancellingBt}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-wider text-xs transition-all disabled:opacity-50 cursor-pointer min-h-[40px] flex items-center justify-center"
                >
                  Nazaj
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

    </div>
  );
}
