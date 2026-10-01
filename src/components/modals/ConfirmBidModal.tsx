import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';
import { AuctionItem, SubscriptionTier } from '../../types';
import { calculateCommissionTaxes, TaxResult } from "../../lib/taxLogic";
import { calculateMarginalPlatformFee } from "../../lib/utils";

export const ConfirmBidModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  item: AuctionItem;
  initialBidAmount: number;
  currentPlan: SubscriptionTier;
  t: any;
  onConfirm: (amount: number, taxData?: TaxResult) => Promise<void>;
  userData: any;
}> = ({ isOpen, onClose, item, initialBidAmount, currentPlan, t, onConfirm, userData }) => {
  const [bidAmount, setBidAmount] = useState<string>(initialBidAmount.toString());
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [taxResult, setTaxResult] = useState<TaxResult | null>(null);
  const [isCalculatingTax, setIsCalculatingTax] = useState(false);

  useEffect(() => {
    setBidAmount(initialBidAmount.toString());
  }, [initialBidAmount, isOpen]);

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

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const computeTaxes = async () => {
      setIsCalculatingTax(true);
      const commissionNet = calculateMarginalPlatformFee(Number(bidAmount), currentPlan);
      
      const countryCode = userData?.country_code || 'SI';
      const isBusiness = !!(userData?.is_business || userData?.companyName);
      const vatId = userData?.taxId || userData?.vat_id;

      const result = await calculateCommissionTaxes(commissionNet, countryCode, isBusiness, vatId);
      if (isMounted) {
        setTaxResult(result);
        setIsCalculatingTax(false);
      }
    };
    const debounceTaxes = setTimeout(() => { computeTaxes() }, 500); 
    return () => { isMounted = false; clearTimeout(debounceTaxes); };
  }, [bidAmount, currentPlan, isOpen, userData]);

  if (!isOpen) return null;

  const d = Math.floor(timeLeft / (3600 * 24));
  const h = Math.floor((timeLeft % (3600 * 24)) / 3600);
  const m = Math.floor((timeLeft % 3600) / 60);
  const s = Math.floor(timeLeft % 60);

  const handleConfirm = async () => {
    if (loading || isCalculatingTax || !taxResult) return;
    setLoading(true);
    try {
      await onConfirm(Number(bidAmount), taxResult);
    } catch (e) {
      console.error("Bid submission error:", e);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden relative">
        <button 
          onClick={onClose}
          className="absolute top-0 right-0 bg-slate-100 text-slate-500 p-3 hover:bg-slate-200 transition-colors rounded-bl-2xl"
        >
          <X size={24} />
        </button>
        
        <div className="p-6 pt-12">
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
            {isCalculatingTax && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-slate-300 border-t-[#FEBA4F] rounded-full animate-spin"></div>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[#0A1128] font-black text-lg">{t('yourBid') || 'Vaša ponudba'}</span>
              <span className="text-[#0A1128] font-black text-lg">€ {Number(bidAmount).toLocaleString('sl-SI', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-sm">
              <span>{t('auctionFeeLabel')}</span>
              <span>€ {taxResult?.commissionNet.toLocaleString('sl-SI', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500 text-sm">
              <span className="flex items-center gap-1">
                {t('vatLabel')} {taxResult?.vatRate ?? 22}%
                {taxResult?.viesValidationStatus === 'VALID' && <CheckCircle size={12} className="text-green-500" />}
                {taxResult?.viesValidationStatus === 'INVALID' && <AlertTriangle size={12} className="text-red-500" />}
              </span>
              <span>€ {taxResult?.vatAmount.toLocaleString('sl-SI', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
          </div>

          <div className="border-t border-slate-300 pt-2 mb-2">
            <div className="flex justify-between items-center font-bold text-lg text-[#0A1128]">
              <span>{t('totalSum')}</span>
              <span>€ {(Number(bidAmount) + (taxResult?.totalGross || 0)).toLocaleString('sl-SI', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            {taxResult?.isReverseCharge && (
              <p className="text-[10px] uppercase font-black tracking-widest text-[#FEBA4F] mt-1">REVERSE CHARGE / OBRNJENA DAVČNA OBVEZNOST</p>
            )}
          </div>

          <div className="border-t border-slate-300 pt-2 mb-6">
            <p className="text-xs text-slate-500">{t('marginScheme')}</p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0A1128] font-black">€</span>
              <input 
                type="number" 
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-[#0A1128] outline-none focus:border-[#FEBA4F] focus:ring-2 focus:ring-[#FEBA4F]/20"
              />
            </div>
            <button 
              onClick={handleConfirm}
              disabled={loading || isCalculatingTax}
              className={`flex-[2] text-white font-black uppercase tracking-widest text-xs py-3 px-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 ${loading || isCalculatingTax ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#0A1128] hover:bg-[#FEBA4F] hover:text-[#0A1128]'}`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                t('confirmBidBtn') || 'Potrdi ponudbo'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
