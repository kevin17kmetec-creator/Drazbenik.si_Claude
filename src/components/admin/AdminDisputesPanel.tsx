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
  buyer_photo_urls?: string[];
  difference?: string | null;
  delivery_method?: string | null;
  chargeback_open?: boolean;
  chargeback_status?: string | null;
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
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const [kindFilter, setKindFilter] = useState<'' | 'not_received' | 'other'>('');
  const [query, setQuery] = useState('');
  const [onlySuspicious, setOnlySuspicious] = useState(false);
  const [onlyNoProof, setOnlyNoProof] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/disputes?status=${statusFilter}${kindFilter ? `&kind=${kindFilter}` : ''}`, { headers: await getAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Napaka pri nalaganju sporov.');
      setItems(json.items || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, kindFilter]);

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

  const q = query.trim().toLowerCase();
  const visible = items.filter(it => {
    if (onlySuspicious && !it.suspicious_buyer) return false;
    if (onlyNoProof && !(it.kind === 'not_received' && !it.seller_proof_at)) return false;
    if (!q) return true;
    return [it.auction_title, it.order_id, it.reason, it.buyer?.name, it.buyer?.email, it.seller?.name, it.seller?.email, it.tracking_number]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('sl-SI') : '/');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['OPEN', 'RESOLVED', 'ALL'] as const).map(v => (
            <button key={v} onClick={() => setStatusFilter(v)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border-2 ${statusFilter === v ? 'bg-[#0A1128] text-white border-[#0A1128]' : 'border-slate-200 text-slate-500'}`}>{v === 'OPEN' ? 'Odprti' : v === 'RESOLVED' ? 'Razrešeni' : 'Vsi'}</button>
          ))}
          <select value={kindFilter} onChange={e => setKindFilter(e.target.value as any)} className="px-3 py-2 rounded-xl text-xs font-black uppercase border-2 border-slate-200 text-slate-600 bg-white">
            <option value="">Vse vrste</option>
            <option value="not_received">Ni prispelo</option>
            <option value="other">Druga težava / ne ustreza opisu</option>
          </select>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Iskanje (predmet, uporabnik, sledenje)" className="px-3 py-2 rounded-xl text-base font-bold border-2 border-slate-200 outline-none min-w-[220px]" />
          <label className="flex items-center gap-1 text-xs font-black uppercase text-slate-500"><input type="checkbox" checked={onlySuspicious} onChange={e => setOnlySuspicious(e.target.checked)} /> Sumljivi kupci</label>
          <label className="flex items-center gap-1 text-xs font-black uppercase text-slate-500"><input type="checkbox" checked={onlyNoProof} onChange={e => setOnlyNoProof(e.target.checked)} /> Brez dokaza prodajalca</label>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-[#0A1128]"><RefreshCw size={14} /> Osveži</button>
      </div>

      {loading && <div className="h-24 animate-pulse bg-slate-50 rounded-3xl" />}
      {!loading && visible.length === 0 && <p className="text-sm font-bold text-slate-400 py-8 text-center">Ni sporov.</p>}

      {!loading && <p className="text-[11px] font-bold text-slate-400">Prikazano: {visible.length} od {items.length}</p>}
      {visible.map(it => (
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
              {it.difference && <p><span className="font-black text-slate-400 uppercase">Razlika od oglasa:</span> {it.difference}</p>}
              {it.buyer_photo_urls && it.buyer_photo_urls.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {it.buyer_photo_urls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`Dokaz kupca ${i + 1}`} className="h-20 w-20 object-cover rounded-xl border border-slate-200" /></a>
                  ))}
                </div>
              )}
              {it.chargeback_open && <p className="font-black text-red-600 uppercase">Hkrati odprt spor pri banki</p>}
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
