import React, { useCallback, useEffect, useState } from 'react';
import { confirmDialog } from '../../lib/dialog';
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getAuthHeaders } from '../../lib/authFetch';
import { toast } from '../../lib/toast';

interface UserInfo {
  id: string;
  name: string;
  email: string | null;
  stats: Record<string, any>;
  not_received_180d: number;
  disputes_180d: number;
}

interface DisputeItem {
  dispute_id: string;
  order_id: string;
  auction_title: string;
  kind: string;
  reason: string;
  status: string;
  resolution: string | null;
  suspicious_buyer: boolean;
  created_at: string;
  tx_status: string | null;
  payout_status: string | null;
  item_price: number | null;
  amount_total: number | null;
  shipping_type: string | null;
  carrier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  posting_receipt_ref: string | null;
  shipped_at: string | null;
  proof_requested_until: string | null;
  seller_proof_note: string | null;
  seller_proof_at: string | null;
  seller_proof_photo_urls?: string[];
  buyer: UserInfo | null;
  seller: UserInfo | null;
}

// Deutscher Kommentar: Zaehler-Zeile eines Nutzers fuer die Missbrauchskontrolle
const StatsLine: React.FC<{ label: string; u: UserInfo | null }> = ({ label, u }) => {
  if (!u) return null;
  const s = u.stats || {};
  return (
    <div className="text-xs text-slate-600 leading-relaxed">
      <span className="font-black uppercase tracking-wider text-slate-400">{label}: </span>
      <span className="font-bold text-[#0A1128]">{u.name}</span>{u.email ? ` (${u.email})` : ''}
      <div>
        Prijave »ni prispelo«: {s.not_received_reports || 0} (zadnjih 180 dni: {u.not_received_180d}) · druge prijave: {s.other_disputes || 0} · odprti spori kot prodajalec: {s.disputes_as_seller || 0} ·
        utemeljeno: {s.reports_upheld || 0} · zavrnjeno: {s.reports_rejected || 0} · neoddan dokaz: {s.proof_missed_as_seller || 0}
      </div>
    </div>
  );
};

export const AdminDisputesPanel: React.FC = () => {
  const [items, setItems] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/disputes?status=${showResolved ? 'RESOLVED' : 'OPEN'}`, { headers: await getAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Napaka pri nalaganju sporov.');
      setItems(json.items || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (orderId: string, decision: 'refund_buyer' | 'release_to_seller') => {
    const label = decision === 'refund_buyer' ? 'vrniti znesek kupcu' : 'sprostiti izplačilo prodajalcu';
    if (!(await confirmDialog(`Ste prepričani, da želite ${label}? Dejanja ni mogoče razveljaviti.`, { tone: 'danger' }))) return;
    setBusyId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/resolve-dispute`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ decision, note: notes[orderId] || '' })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Napaka pri razrešitvi.');
      toast.success('Spor je razrešen.');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('sl-SI') : '/');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setShowResolved(false)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border-2 ${!showResolved ? 'bg-[#0A1128] text-white border-[#0A1128]' : 'border-slate-200 text-slate-500'}`}>Odprti</button>
          <button onClick={() => setShowResolved(true)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border-2 ${showResolved ? 'bg-[#0A1128] text-white border-[#0A1128]' : 'border-slate-200 text-slate-500'}`}>Razrešeni</button>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-[#0A1128]"><RefreshCw size={14} /> Osveži</button>
      </div>

      {loading && <div className="h-24 animate-pulse bg-slate-50 rounded-3xl" />}
      {!loading && items.length === 0 && <p className="text-sm font-bold text-slate-400 py-8 text-center">Ni sporov.</p>}

      {items.map(it => (
        <div key={it.dispute_id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-black text-[#0A1128] text-sm">{it.auction_title || it.order_id}</p>
              <p className="text-[11px] font-bold text-slate-400">Naročilo {it.order_id} · odprto {fmt(it.created_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black uppercase">{it.kind === 'not_received' ? 'Ni prispelo' : 'Druga težava'}</span>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black uppercase">{it.shipping_type === 'untracked' ? 'Brez sledenja' : it.shipping_type === 'tracked' ? 'S sledenjem' : '-'}</span>
              {it.suspicious_buyer && <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-black uppercase flex items-center gap-1"><AlertTriangle size={12} /> Pogoste prijave kupca</span>}
              {it.status === 'RESOLVED' && <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase flex items-center gap-1"><CheckCircle2 size={12} /> {it.resolution || 'Razrešeno'}</span>}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-xs text-slate-600">
            <div className="space-y-1">
              <p><span className="font-black text-slate-400 uppercase">Razlog kupca:</span> {it.reason}</p>
              <p><span className="font-black text-slate-400 uppercase">Znesek:</span> {it.item_price ?? '/'} € (skupaj {it.amount_total ?? '/'} €) · status {it.tx_status} / {it.payout_status}</p>
              <p><span className="font-black text-slate-400 uppercase">Odprema:</span> {fmt(it.shipped_at)} · {it.carrier_name || '/'} {it.tracking_number ? `· ${it.tracking_number}` : ''}
                {it.tracking_url && <> · <a className="underline" href={it.tracking_url} target="_blank" rel="noopener noreferrer">sledenje</a></>}
              </p>
              {it.posting_receipt_ref && <p><span className="font-black text-slate-400 uppercase">Potrdilo ob odpremi:</span> {it.posting_receipt_ref}</p>}
            </div>
            <div className="space-y-1">
              <p><span className="font-black text-slate-400 uppercase">Rok za dokaz:</span> {fmt(it.proof_requested_until)}</p>
              <p><span className="font-black text-slate-400 uppercase">Dokaz prodajalca:</span> {it.seller_proof_at ? `${fmt(it.seller_proof_at)}: ${it.seller_proof_note}` : 'ni oddan'}</p>
              {it.seller_proof_photo_urls && it.seller_proof_photo_urls.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {it.seller_proof_photo_urls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`Dokaz ${i + 1}`} className="h-20 w-20 object-cover rounded-xl border border-slate-200" /></a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1 bg-slate-50 rounded-2xl p-3">
            <StatsLine label="Kupec" u={it.buyer} />
            <StatsLine label="Prodajalec" u={it.seller} />
          </div>

          {it.status === 'OPEN' && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Opomba (vidita jo kupec in prodajalec)"
                value={notes[it.order_id] || ''}
                onChange={e => setNotes(n => ({ ...n, [it.order_id]: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-base font-bold outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <button disabled={busyId === it.order_id} onClick={() => resolve(it.order_id, 'refund_buyer')} className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50">Vrni znesek kupcu</button>
                <button disabled={busyId === it.order_id} onClick={() => resolve(it.order_id, 'release_to_seller')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50">Sprosti prodajalcu</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
