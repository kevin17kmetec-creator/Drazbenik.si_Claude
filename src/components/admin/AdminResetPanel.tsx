import React, { useState } from 'react';
import { getAuthHeaders } from '../../lib/authFetch';
import { toast } from '../../lib/toast';

// Deutscher Kommentar: Admin-Bereich zum Zuruecksetzen der Testdaten mit Trockenlauf und Bestaetigungswort
const GROUPS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'auctions', label: 'Dražbe, ponudbe in slike dražb', hint: 'Vse dražbe, ponudbe, shranjene in slike v shrambi' },
  { id: 'orders', label: 'Naročila, plačila, računi, spori, opozorila', hint: 'Transakcije, denarnica, računovodski dokumenti, spori, dokazi, chargeback opozorila' },
  { id: 'messages', label: 'Sporočila, obvestila, ocene, povpraševanja', hint: 'Pogovori, obvestila, ocene, povpraševanja za nepremičnine' },
  { id: 'users', label: 'Uporabniki (razen administratorjev)', hint: 'Profili in prijavni računi. Administratorji ostanejo.' },
];

export const AdminResetPanel: React.FC = () => {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const groups = GROUPS.filter(g => sel[g.id]).map(g => g.id);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/reset-test-data', { method: 'POST', headers: await getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ groups, dryRun, confirm }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Napaka.');
      setCounts(json.counts || {});
      if (!dryRun) { toast.success('Podatki so izbrisani.'); setConfirm(''); }
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-red-200 p-6 md:p-8 space-y-5">
      <div>
        <h2 className="text-xl font-black text-red-600 uppercase tracking-tight">Ponastavitev testnih podatkov</h2>
        <p className="text-sm font-bold text-slate-500 mt-1">Samo za testno fazo. Brisanje je trajno. Stripe podatkov ta gumb ne izbriše (to storite v Stripe nadzorni plošči, testni način).</p>
      </div>
      <div className="space-y-2">
        {GROUPS.map(g => (
          <label key={g.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={!!sel[g.id]} onChange={e => { setSel({ ...sel, [g.id]: e.target.checked }); setCounts(null); }} />
            <span><span className="font-black text-[#0A1128] text-sm">{g.label}</span><br /><span className="text-xs font-bold text-slate-400">{g.hint}</span></span>
          </label>
        ))}
      </div>
      <button disabled={busy || groups.length === 0} onClick={() => run(true)} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border-2 border-slate-300 text-slate-600 disabled:opacity-40">Preveri, kaj bo izbrisano</button>
      {counts && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs font-bold text-slate-600 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
          {Object.entries(counts).map(([k, v]) => <div key={k}>{k}: <span className="text-[#0A1128]">{v}</span></div>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Vpišite IZBRIŠI" className="border-2 border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:border-red-400" />
        <button disabled={busy || groups.length === 0 || confirm !== 'IZBRIŠI'} onClick={() => run(false)} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-red-600 text-white disabled:opacity-40">Trajno izbriši izbrano</button>
      </div>
    </div>
  );
};
