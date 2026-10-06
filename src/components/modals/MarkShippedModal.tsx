import React, { useState } from 'react';
import { X, Truck, Package, Info, AlertCircle } from 'lucide-react';
import { Portal } from '../ui/Portal';
import { toast } from 'sonner';
import { getAuthHeaders } from '../../lib/authFetch';

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
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (itemPrice > 15 && !tracking.trim()) {
      toast.error('Za zneske nad 15 € je obvezen vnos sledilne številke.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${auctionId}/mark-as-shipped`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          carrier_name: carrier.trim() || 'Pošta Slovenije',
          tracking_number: tracking.trim()
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
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={onClose}></div>
        <div className="relative bg-white w-full max-w-lg rounded-[3rem] p-10 lg:p-14 shadow-2xl animate-in border-4 border-[#FEBA4F]">
          <button onClick={onClose} className="absolute top-8 right-8 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
          
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-[#FEBA4F]/10 p-4 rounded-3xl">
              <Truck className="text-[#FEBA4F]" size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-[#0A1128] uppercase tracking-tighter">Označi kot poslano</h3>
              <p className="text-slate-400 font-bold text-xs">Vnesite podatke o pošiljki</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Prevoznik / Služba</label>
              <input 
                type="text" 
                placeholder="npr. Pošta Slovenije, DPD, GLS..."
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-[#FEBA4F] outline-none"
                value={carrier}
                onChange={e => setCarrier(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Sledilna številka</label>
              <input 
                type="text" 
                placeholder="Vnesite kodo za sledenje"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-[#FEBA4F] outline-none"
                value={tracking}
                onChange={e => setTracking(e.target.value)}
                required={itemPrice > 15}
              />
              {itemPrice > 15 && (
                <div className="flex items-center gap-2 mt-2 text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
                  <AlertCircle size={14} className="shrink-0" />
                  <p className="text-[10px] font-bold">Za zneske nad 15 € je sledilna številka obvezna za zaščito prodajalca.</p>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex gap-3">
              <Info className="text-blue-500 shrink-0" size={20} />
              <p className="text-blue-900 font-bold text-[10px] leading-relaxed">
                Po oddaji pošiljke bo kupec prejel e-poštno obvestilo s podatki za sledenje. Sredstva bodo sproščena samodejno 7-14 dni po odpremi, če kupec prejema ne potrdi ročno.
              </p>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#0A1128] text-white py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Obdelujem...
                </>
              ) : (
                'Potrdi odpremo'
              )}
            </button>
          </form>
        </div>
      </div>
    </Portal>
  );
};
