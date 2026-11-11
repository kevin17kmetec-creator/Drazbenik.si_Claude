import React, { useState } from 'react';
import { toast } from 'sonner';
import { getAuthHeaders } from '../../lib/authFetch';

// Deutscher Kommentar: Immobilien koennen nicht direkt inseriert werden, stattdessen eine Anfrage an den Betreiber
export const RealEstateInquiry: React.FC<{ onChooseOther: () => void }> = ({ onChooseOther }) => {
  const [form, setForm] = useState({ property_type: '', location: '', asking_price: '', phone: '', message: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('/api/real-estate-inquiry', {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Povpraševanja ni bilo mogoče poslati.');
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || 'Napaka pri pošiljanju.');
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full bg-slate-50 border-2 border-slate-200 focus:border-[#FEBA4F] rounded-2xl py-3 px-5 font-bold outline-none';

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 md:p-10 space-y-6">
        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-[#0A1128]">Nepremičnine: povpraševanje</h2>
        <p className="text-slate-500 font-bold">Nepremičnin trenutno ni mogoče objaviti kot dražbo. Pošljite povpraševanje in se vam bomo oglasili.</p>
        {done ? (
          <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-5 font-bold text-green-700">Povpraševanje je poslano. Odgovorili vam bomo na e-poštni naslov v vašem profilu.</div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input className={input} placeholder="Vrsta nepremičnine (npr. stanovanje, hiša, zemljišče)" value={form.property_type} onChange={e => setForm({ ...form, property_type: e.target.value })} />
            <input className={input} required placeholder="Lokacija" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
            <input className={input} placeholder="Okvirna cena (neobvezno)" value={form.asking_price} onChange={e => setForm({ ...form, asking_price: e.target.value })} />
            <input className={input} placeholder="Telefon (neobvezno)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <textarea className={input + ' min-h-[140px]'} required minLength={10} placeholder="Opis in vaše vprašanje" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
            <button disabled={sending} className="w-full bg-[#0A1128] text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-60">{sending ? 'Pošiljam...' : 'Pošlji povpraševanje'}</button>
          </form>
        )}
        <button type="button" onClick={onChooseOther} className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-[#0A1128]">Izberi drugo kategorijo</button>
      </div>
    </div>
  );
};
