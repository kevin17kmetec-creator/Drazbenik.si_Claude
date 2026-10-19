import React, { useState } from 'react';
import { X, Truck, Package, Info, AlertCircle } from '../icons';
import { Portal } from '../ui/Portal';
import { LoadingButton } from '../ui/Common';
import { toast } from 'sonner';
import { getAuthHeaders } from '../../lib/authFetch';
import { TRACKING_REQUIRED_ABOVE_EUR, CARRIERS, checkTrackingNumber, getCarrierLabel, ShippingType } from '../../lib/shippingRules';

interface MarkShippedModalProps {
  isOpen: boolean;
  onClose: () => void;
  auctionId: string;
  onSuccess: () => void;
  itemPrice: number;
}

export const MarkShippedModal: React.FC<MarkShippedModalProps> = ({ 
  isOpen, 
  onClose, 
  auctionId, 
  onSuccess,
  itemPrice
}) => {
  const [carrierId, setCarrierId] = useState('posta_si');
  const [otherCarrierName, setOtherCarrierName] = useState('');
  const [shippingType, setShippingType] = useState<ShippingType>('tracked');
  const [tracking, setTracking] = useState('');
  const [riskAck, setRiskAck] = useState(false);
  const [proofAck, setProofAck] = useState(false);
  const [receiptRef, setReceiptRef] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // Deutscher Kommentar: Ueber der Schwelle ist nur eine Sendung mit Sendungsverfolgung erlaubt
  const trackingRequired = itemPrice > TRACKING_REQUIRED_ABOVE_EUR;
  const effectiveType: ShippingType = trackingRequired ? 'tracked' : shippingType;
  const trackingCheck = effectiveType === 'tracked' ? checkTrackingNumber(carrierId, tracking) : null;
  const canSubmit =
    proofAck &&
    (effectiveType === 'tracked' ? !!tracking.trim() && !trackingCheck?.error : riskAck && receiptRef.trim().length >= 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (effectiveType === 'tracked' && trackingCheck?.error) {
      toast.error(trackingCheck.error);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${auctionId}/mark-as-shipped`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          carrier_id: carrierId,
          carrier_name: carrierId === 'other' && otherCarrierName.trim() ? otherCarrierName.trim().slice(0, 60) : getCarrierLabel(carrierId),
          shipping_type: effectiveType,
          tracking_number: effectiveType === 'tracked' ? tracking.trim() : '',
          untracked_risk_ack: effectiveType === 'untracked' ? riskAck : false,
          posting_proof_ack: proofAck,
          posting_receipt_ref: receiptRef.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Napaka pri označevanju pošiljke.');
      }

      toast.success('Predmet je bil označen kot poslan.');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-2.5 sm:p-4">
        <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={onClose}></div>
        {/* Deutscher Kommentar: Versandmodal mit max-h-[92dvh] und responsiver Skalierung fuer Smartphones */}
        <div className="relative bg-white w-full max-w-lg rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-10 lg:p-14 shadow-2xl animate-in border-2 border-[#FEBA4F] max-h-[92dvh] overflow-y-auto">
          <button onClick={onClose} className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center" aria-label="Zapri"><X size={24} /></button>
          
          <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-[#FEBA4F]/10 p-3 sm:p-4 rounded-2xl sm:rounded-3xl shrink-0">
              <Truck className="text-[#FEBA4F]" size={28} />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[#0A1128] uppercase tracking-tighter">Označi kot poslano</h3>
              <p className="text-slate-400 font-bold text-xs">Vnesite podatke o pošiljki</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {trackingRequired ? (
              <div className="flex items-start gap-2 text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold leading-relaxed">
                  Znesek je nad {TRACKING_REQUIRED_ABOVE_EUR} €, zato je obvezna pošiljka s sledenjem (paket ali priporočena pošiljka). Sledilno številko vpišite spodaj. Pošiljka brez sledenja ni dovoljena.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 sm:mb-2">Vrsta pošiljke</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setShippingType('tracked')} className={`py-3 rounded-2xl font-black text-xs uppercase tracking-wider border-2 transition-all ${effectiveType === 'tracked' ? 'bg-[#0A1128] text-white border-[#0A1128]' : 'bg-white text-slate-500 border-slate-200'}`}>S sledenjem</button>
                  <button type="button" onClick={() => setShippingType('untracked')} className={`py-3 rounded-2xl font-black text-xs uppercase tracking-wider border-2 transition-all ${effectiveType === 'untracked' ? 'bg-[#0A1128] text-white border-[#0A1128]' : 'bg-white text-slate-500 border-slate-200'}`}>Brez sledenja</button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 sm:mb-2">Prevoznik / Služba</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 sm:py-4 px-4 sm:px-6 font-bold text-base focus:ring-2 focus:ring-[#FEBA4F] outline-none"
                value={carrierId}
                onChange={e => setCarrierId(e.target.value)}
              >
                {CARRIERS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {carrierId === 'other' && (
                <input
                  type="text"
                  maxLength={60}
                  value={otherCarrierName}
                  onChange={e => setOtherCarrierName(e.target.value)}
                  placeholder="Ime prevoznika (npr. Hrvatska pošta)"
                  className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 font-bold text-base focus:ring-2 focus:ring-[#FEBA4F] outline-none"
                />
              )}
            </div>

            {effectiveType === 'tracked' ? (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 sm:mb-2">Sledilna številka</label>
                <input
                  type="text"
                  placeholder="npr. RR123456789SI"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 sm:py-4 px-4 sm:px-6 font-bold text-base focus:ring-2 focus:ring-[#FEBA4F] outline-none uppercase"
                  value={tracking}
                  onChange={e => setTracking(e.target.value)}
                  required
                />
                {tracking.trim() && trackingCheck?.error && <p className="text-[11px] font-bold text-red-600 mt-2">{trackingCheck.error}</p>}
                {tracking.trim() && !trackingCheck?.error && trackingCheck?.warning && <p className="text-[11px] font-bold text-amber-600 mt-2">{trackingCheck.warning}</p>}
              </div>
            ) : (
              <label className="flex items-start gap-3 bg-red-50 border border-red-200 p-3 sm:p-4 rounded-2xl cursor-pointer">
                <input type="checkbox" checked={riskAck} onChange={e => setRiskAck(e.target.checked)} className="mt-1 w-4 h-4 shrink-0" />
                <span className="text-[11px] font-bold text-red-800 leading-relaxed">
                  Razumem, da pri pošiljki brez sledenja tveganje izgube nosim sam. Če kupec sporoči, da pošiljka ni prispela, moram v 48 urah predložiti potrdilo o oddaji; ker dostave brez sledenja ni mogoče dokazati, je običajna odločitev vračilo kupcu.
                </span>
              </label>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 sm:mb-2">
                {effectiveType === 'untracked' ? 'Podatki s potrdila o oddaji (obvezno)' : 'Številka potrdila o oddaji (neobvezno)'}
              </label>
              <input
                type="text"
                placeholder="npr. 14. 10. 2026, pošta Maribor 2000, potrdilo št. 12345"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 sm:py-4 px-4 sm:px-6 font-bold text-base focus:ring-2 focus:ring-[#FEBA4F] outline-none"
                value={receiptRef}
                maxLength={200}
                onChange={e => setReceiptRef(e.target.value)}
              />
            </div>

            <label className="flex items-start gap-3 bg-slate-50 border border-slate-200 p-3 sm:p-4 rounded-2xl cursor-pointer">
              <input type="checkbox" checked={proofAck} onChange={e => setProofAck(e.target.checked)} className="mt-1 w-4 h-4 shrink-0" />
              <span className="text-[11px] font-bold text-slate-600 leading-relaxed">
                Potrjujem, da je pošiljka oddana in da hranim potrdilo o oddaji (račun s pošte ali fotografijo pošiljke z naslovnico). Dokaz bom predložil na zahtevo.
              </span>
            </label>

            <div className="bg-blue-50 border border-blue-100 p-3 sm:p-4 rounded-2xl flex gap-2.5 sm:gap-3">
              <Info className="text-blue-500 shrink-0" size={18} />
              <p className="text-blue-900 font-bold text-[10px] leading-relaxed">
                Po oddaji pošiljke bo kupec prejel e-poštno obvestilo{effectiveType === 'tracked' ? ' s povezavo za sledenje' : ''}. Sredstva bodo sproščena samodejno 7-14 dni po odpremi, če kupec prejema ne potrdi ročno. Napačno označena odprema, ki jo kupec utemeljeno ovrže, pomeni vračilo kupcu in opomin.
              </p>
            </div>

            <LoadingButton
              type="submit"
              loading={loading}
              disabled={!canSubmit}
              loadingText="Shranjujem..."
              className="w-full bg-[#0A1128] text-white py-3.5 sm:py-6 rounded-2xl sm:rounded-[1.35rem] font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Potrdi odpremo
            </LoadingButton>
          </form>
        </div>
      </div>
    </Portal>
  );
};
