import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { AuctionItem, SubscriptionTier } from '../../types';
import { Portal } from '../ui/Portal';
import { LoadingButton } from '../ui/Common';
import { useFeePreview } from '../../lib/useFeePreview';

export const ConfirmBidModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  item: AuctionItem;
  initialBidAmount: number;
  currentPlan: SubscriptionTier;
  t: any;
  onConfirm: (amount: number, taxData?: any, acceptedBidTerms?: boolean) => Promise<void>;
  userData: any;
  onOpenTerms?: () => void;
}> = ({ isOpen, onClose, item, initialBidAmount, currentPlan, t, onConfirm, userData, onOpenTerms }) => {
  const [bidAmount, setBidAmount] = useState<string>(initialBidAmount.toString());
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasBidOnAuction, setHasBidOnAuction] = useState<boolean>(true);
  const [acceptedBidTerms, setAcceptedBidTerms] = useState<boolean>(false);

  useEffect(() => {
    setBidAmount(initialBidAmount.toString());
  }, [initialBidAmount, isOpen]);

  useEffect(() => {
    if (!isOpen || !item?.id || !auth.currentUser?.uid) return;
    let isMounted = true;
    const checkMyBid = async () => {
      try {
        const myBidSnap = await getDoc(doc(db, 'users', auth.currentUser!.uid, 'my_bids', item.id));
        if (!isMounted) return;
        const exists = myBidSnap.exists();
        setHasBidOnAuction(exists);
        if (exists) {
          setAcceptedBidTerms(true);
        } else {
          setAcceptedBidTerms(false);
        }
      } catch (e) {
        if (isMounted) {
          setHasBidOnAuction(false);
          setAcceptedBidTerms(false);
        }
      }
    };
    checkMyBid();
    return () => { isMounted = false; };
  }, [isOpen, item?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const updateTime = () => {
      const diff = Math.max(0, Math.floor((new Date(item.endTime).getTime() - Date.now()) / 1000));
      setTimeLeft(diff);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [item.endTime, isOpen]);

  const numBid = Number(bidAmount) || 0;
  const { data: previewData, loading: previewLoading, error: previewError } = useFeePreview({
    amount: numBid,
    enabled: isOpen && numBid > 0
  });

  if (!isOpen) return null;

  const d = Math.floor(timeLeft / (3600 * 24));
  const h = Math.floor((timeLeft % (3600 * 24)) / 3600);
  const m = Math.floor((timeLeft % 3600) / 60);
  const s = Math.floor(timeLeft % 60);

  const isSubmitDisabled = loading || previewLoading || !!previewError || (!hasBidOnAuction && !acceptedBidTerms);

  const handleConfirm = async () => {
    if (isSubmitDisabled || !previewData) return;
    setLoading(true);
    try {
      await onConfirm(numBid, previewData, acceptedBidTerms);
    } catch (e) {
      console.error("Bid submission error:", e);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const tierSlo = previewData?.tier === 'PRO' ? 'Napredni' : previewData?.tier === 'BASIC' ? 'Osnovni' : 'Brezplačni';

  return (
    <Portal>
      <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-2.5 sm:p-4 animate-in">
        {/* Deutscher Kommentar: Gebot-Bestaetigungsmodal mit max-h-[92dvh] und responsiver Skalierung */}
        <div className="bg-white rounded-3xl max-w-sm sm:max-w-md w-full shadow-2xl overflow-y-auto max-h-[92dvh] relative">
          <button 
            onClick={onClose}
            className="absolute top-0 right-0 bg-slate-100 text-slate-500 p-2.5 hover:bg-slate-200 transition-colors rounded-bl-2xl min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Zapri"
          >
            <X size={20} />
          </button>
          
          <div className="p-4 sm:p-6 pt-10 sm:pt-12">
            <div className="flex justify-center gap-2 mb-6">
              <div className="flex flex-col items-center justify-center bg-slate-200 rounded-lg w-12 h-12 border border-slate-300 shadow-inner">
                <span className="text-lg font-black text-slate-600 leading-none">{d.toString().padStart(2, '0')}</span>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-1">{t('days')}</span>
              </div>
              <div className="flex flex-col items-center justify-center bg-slate-200 rounded-lg w-12 h-12 border border-slate-300 shadow-inner">
                <span className="text-lg font-black text-slate-600 leading-none">{h.toString().padStart(2, '0')}</span>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-1">{t('hours')}</span>
              </div>
              <div className="flex flex-col items-center justify-center bg-slate-200 rounded-lg w-12 h-12 border border-slate-300 shadow-inner">
                <span className="text-lg font-black text-slate-600 leading-none">{m.toString().padStart(2, '0')}</span>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-1">{t('minutes')}</span>
              </div>
              <div className="flex flex-col items-center justify-center bg-slate-200 rounded-lg w-12 h-12 border border-slate-300 shadow-inner">
                <span className="text-lg font-black text-slate-600 leading-none">{s.toString().padStart(2, '0')}</span>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-1">{t('seconds')}</span>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6">
              {t('bidTermsAccept')}
            </p>

            <div className="space-y-2 mb-4 relative min-h-[80px]">
              {previewLoading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-[#FEBA4F] rounded-full animate-spin"></div>
                </div>
              )}
              {previewError ? (
                <p className="text-red-600 text-xs font-bold text-center py-4">Izračuna provizije ni bilo mogoče pridobiti. Poskusite znova.</p>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-[#0A1128] font-black text-lg">{t('yourBid') || 'Vaša ponudba'}</span>
                    <span className="text-[#0A1128] font-black text-lg">€ {numBid.toLocaleString('sl-SI', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500 text-sm">
                    <span>{previewData?.feeIsMinimum ? 'Provizija platforme (minimalna)' : `Provizija platforme (${previewData?.feePercent ?? 0} %)`}:</span>
                    <span>€ {((previewData?.feeCents ?? 0) / 100).toLocaleString('sl-SI', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  {previewData?.feeIsMinimum && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Uporabljena je minimalna provizija 1,00 €.
                    </p>
                  )}
                  <div className="flex justify-between items-center text-slate-500 text-sm">
                    <span className="flex items-center gap-1">
                      DDV {previewData?.vatRate ?? 22} %:
                      {previewData?.isReverseCharge && <span className="text-[10px] text-amber-600 font-bold">(Obrnjena davčna obveznost)</span>}
                    </span>
                    <span>{previewData?.isReverseCharge ? 'Obrnjena davčna obveznost (0 %)' : `€ ${((previewData?.vatCents ?? 0) / 100).toLocaleString('sl-SI', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}</span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-slate-300 pt-2 mb-2">
              <div className="flex justify-between items-center font-bold text-lg text-[#0A1128]">
                <span>Skupaj za plačilo ob zmagi:</span>
                <span>€ {((previewData?.totalCents ?? numBid * 100) / 100).toLocaleString('sl-SI', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Provizija se obračuna po vašem paketu: <strong className="text-[#0A1128]">{tierSlo}</strong>.
              </p>
            </div>

            <div className="border-t border-slate-300 pt-2 mb-4">
              <p className="text-xs text-slate-500 mb-3">{t('marginScheme')}</p>

              {!hasBidOnAuction && (
                <label className="flex items-start gap-2 text-xs text-slate-700 font-medium cursor-pointer select-none bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={acceptedBidTerms}
                    onChange={(e) => setAcceptedBidTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#0A1128] focus:ring-[#FEBA4F]"
                  />
                  <span>
                    {t('bidTermsCheckbox') || 'Strinjam se s Splošnimi pogoji in vem, da je moja ponudba pravno zavezujoča.'}{' '}
                    {onOpenTerms && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); onOpenTerms(); }}
                        className="text-amber-600 underline font-bold hover:text-amber-700"
                      >
                        {t('terms') || 'Splošni pogoji'}
                      </button>
                    )}
                  </span>
                </label>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1 relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0A1128] font-black text-base">€</span>
                <input 
                  type="number" 
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[#0A1128] text-base outline-none focus:border-[#FEBA4F] focus:ring-2 focus:ring-[#FEBA4F]/20 min-h-[44px]"
                />
              </div>
              <LoadingButton 
                onClick={handleConfirm}
                loading={loading}
                loadingText="Oddajam ponudbo..."
                disabled={isSubmitDisabled}
                className="flex-[2] text-white font-black uppercase tracking-widest text-xs py-3 px-4 rounded-2xl transition-all shadow-xl min-h-[44px] bg-[#0A1128] hover:bg-[#FEBA4F] hover:text-[#0A1128]"
              >
                {t('confirmBidBtn') || 'Potrdi ponudbo'}
              </LoadingButton>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
};
