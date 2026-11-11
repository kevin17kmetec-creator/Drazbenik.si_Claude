import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getAuthHeaders } from '../../lib/authFetch';
import { toast } from '../../lib/toast';

// Deutscher Kommentar: Uebersicht aller Warnungen, offenen Rueckbuchungen und Schulden mit Typ- und Textfilter
export const AdminAlertsPanel: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/alerts${type ? `?type=${encodeURIComponent(type)}` : ''}`, { headers: await getAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Napaka pri nalaganju.');
      setData(json);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('sl-SI') : '/');
  const eur = (c: number) => (c / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2 }) + ' €';
  const q = query.trim().toLowerCase();
  const alerts = (data?.alerts || []).filter((a: any) => !q || JSON.stringify(a).toLowerCase().includes(q));

  const submitEvidence = async (disputeId: string, submit: boolean) => {
    if (submit && !window.confirm('Dokaze oddati banki? Po oddaji jih ni več mogoče spremeniti.')) return;
    const res = await fetch(`/api/admin/chargebacks/${disputeId}/submit-evidence`, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ submit }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) { toast.success(submit ? 'Dokazi so oddani.' : 'Osnutek je osvežen v Stripe.'); load(); } else toast.error(json.error || 'Napaka.');
  };

  const clearDebt = async (userId: string) => {
    if (!window.confirm('Dolg je poravnan? Dejanje se zabeleži.')) return;
    const res = await fetch(`/api/admin/users/${userId}/clear-chargeback-debt`, { method: 'POST', headers: await getAuthHeaders() });
    if (res.ok) { toast.success('Dolg je izbrisan.'); load(); } else toast.error('Napaka.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 rounded-xl text-xs font-black uppercase border-2 border-slate-200 text-slate-600 bg-white">
          <option value="">Vse vrste</option>
          {(data?.types || []).map((t: string) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Iskanje" className="px-3 py-2 rounded-xl text-base font-bold border-2 border-slate-200 outline-none min-w-[200px]" />
        <button onClick={load} className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-[#0A1128]"><RefreshCw size={14} /> Osveži</button>
      </div>

      {loading && <div className="h-24 animate-pulse bg-slate-50 rounded-3xl" />}

      {!loading && data && (
        <>
          <section className="bg-white border border-slate-100 rounded-3xl p-5 space-y-2">
            <h3 className="font-black text-[#0A1128] uppercase text-sm">Odprti spori pri banki ({data.open_chargebacks.length})</h3>
            {data.open_chargebacks.length === 0 && <p className="text-xs font-bold text-slate-400">Ni odprtih.</p>}
            {data.open_chargebacks.map((c: any) => (
              <div key={c.transaction_id} className="text-xs text-slate-600 space-y-1 border-b border-slate-100 pb-2">
                <p>Transakcija {c.transaction_id} · {eur(c.amount_cents)} · razlog {c.reason || '/'} · rok za dokaze <b>{fmt(c.evidence_due_by)}</b> · izplačilo {c.payout_status}</p>
                <p>Paket dokazov: {c.packet ? `pripravljen ${fmt(c.packet.built_at)}, zapisov ${c.packet.summary?.log_entries ?? 0}, prejem potrjen: ${c.packet.summary?.receipt_confirmed ? 'da' : 'ne'}, IP enak: ${c.packet.summary?.ip_match === null || c.packet.summary?.ip_match === undefined ? '/' : c.packet.summary.ip_match ? 'da' : 'ne'}` : 'ni pripravljen'}{c.evidence_submitted_at ? ` · oddano ${fmt(c.evidence_submitted_at)}` : ''}</p>
                {c.dispute_id && !c.evidence_submitted_at && (
                  <div className="flex gap-2">
                    <button onClick={() => submitEvidence(c.dispute_id, false)} className="px-3 py-1.5 rounded-xl border-2 border-slate-200 font-black uppercase">Osveži osnutek</button>
                    <button onClick={() => submitEvidence(c.dispute_id, true)} className="px-3 py-1.5 rounded-xl bg-[#0A1128] text-white font-black uppercase">Oddaj dokaze banki</button>
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="bg-white border border-slate-100 rounded-3xl p-5 space-y-2">
            <h3 className="font-black text-[#0A1128] uppercase text-sm">Dolgovi prodajalcev ({data.debts.length})</h3>
            {data.debts.length === 0 && <p className="text-xs font-bold text-slate-400">Ni dolgov.</p>}
            {data.debts.map((d: any) => (
              <div key={d.user_id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>{d.email || d.user_id} · {eur(d.debt_cents)}</span>
                <button onClick={() => clearDebt(d.user_id)} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-black uppercase">Dolg poravnan</button>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h3 className="font-black text-[#0A1128] uppercase text-sm">Opozorila ({alerts.length})</h3>
            {alerts.map((a: any) => (
              <div key={a.id} className="bg-white border border-slate-100 rounded-2xl p-4 text-xs text-slate-600">
                <p><b className="text-[#0A1128]">{a.type}</b> · {fmt(a.created_at)}</p>
                <p className="break-words">{Object.entries(a).filter(([k]) => !['id', 'type', 'created_at'].includes(k)).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
};
