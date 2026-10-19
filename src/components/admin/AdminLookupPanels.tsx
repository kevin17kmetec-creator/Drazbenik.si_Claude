import React, { useCallback, useEffect, useState } from 'react';
import { confirmDialog } from '../../lib/dialog';
import { Search, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { getAuthHeaders } from '../../lib/authFetch';
import { toast } from '../../lib/toast';

type Diag = { level: 'error' | 'warn' | 'ok'; text: string };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { ...(await getAuthHeaders()), ...(init?.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Napaka pri nalaganju.');
  return json;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('sl-SI') : '/');

const Diagnostics: React.FC<{ items: Diag[] }> = ({ items }) => (
  <div className="space-y-1.5">
    {items.map((d, i) => (
      <div key={i} className={`flex items-start gap-2 text-xs font-bold p-2.5 rounded-xl ${d.level === 'error' ? 'bg-red-50 text-red-700' : d.level === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
        {d.level === 'error' ? <XCircle size={14} className="mt-0.5 shrink-0" /> : d.level === 'warn' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
        <span>{d.text}</span>
      </div>
    ))}
  </div>
);

const SearchBar: React.FC<{ value: string; onChange: (v: string) => void; onSearch: () => void; placeholder: string }> = ({ value, onChange, onSearch, placeholder }) => (
  <form onSubmit={e => { e.preventDefault(); onSearch(); }} className="flex gap-2">
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-base font-bold outline-none focus:ring-2 focus:ring-[#FEBA4F]" />
    <button type="submit" className="px-4 rounded-xl bg-[#0A1128] text-white flex items-center gap-2 text-xs font-black uppercase tracking-wider"><Search size={14} /> Išči</button>
  </form>
);

const KV: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <p className="text-xs text-slate-600"><span className="font-black uppercase text-slate-400">{k}: </span>{v ?? '/'}</p>
);

export const AdminUsersPanel: React.FC<{ initialId?: string | null }> = ({ initialId }) => {
  const [q, setQ] = useState(initialId || '');
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const json = await api(`/api/admin/users?q=${encodeURIComponent(query)}`);
      setItems(json.items || []);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }, []);

  const open = useCallback(async (id: string) => {
    try { setDetail(await api(`/api/admin/users/${encodeURIComponent(id)}`)); } catch (e: any) { toast.error(e.message); }
  }, []);

  useEffect(() => { if (initialId) open(initialId); else search(''); }, [initialId, open, search]);

  const toggleAdmin = async () => {
    const makeAdmin = detail.user.role !== 'admin';
    if (!(await confirmDialog(makeAdmin ? 'Ta uporabnik bo postal administrator. Nadaljujem?' : 'Uporabniku bo odvzeta vloga administratorja. Nadaljujem?', { tone: 'danger' }))) return;
    try {
      await api(`/api/admin/users/${detail.user.id}/set-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: makeAdmin }) });
      toast.success('Vloga je posodobljena.');
      open(detail.user.id);
    } catch (e: any) { toast.error(e.message); }
  };

  if (detail) {
    const u = detail.user;
    const ds = detail.dispute_stats || {};
    return (
      <div className="space-y-4">
        <button onClick={() => setDetail(null)} className="text-xs font-black uppercase tracking-wider text-slate-500 underline">Nazaj na seznam</button>
        <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-black text-[#0A1128]">{u.username || u.id}</p>
              <p className="text-[11px] font-bold text-slate-400">ID {u.id} · {u.email_masked || 'brez e-pošte'}</p>
            </div>
            <button onClick={toggleAdmin} className="px-3 py-2 rounded-xl border-2 border-slate-200 text-[11px] font-black uppercase tracking-wider">{u.role === 'admin' ? 'Odvzemi admina' : 'Naredi admina'}</button>
          </div>
          <Diagnostics items={detail.diagnostics} />
          <div className="grid sm:grid-cols-2 gap-1">
            <KV k="Vloga" v={u.role} /><KV k="Tip" v={`${u.user_type || '/'}${u.company_name ? ` (${u.company_name})` : ''}`} />
            <KV k="Država" v={u.country_code} /><KV k="Jezik" v={u.preferred_language} />
            <KV k="Registriran" v={fmt(u.created_at)} /><KV k="Zadnja aktivnost" v={fmt(u.last_seen_at)} />
            <KV k="E-pošta potrjena" v={u.email_verified ? 'da' : 'ne'} /><KV k="Profil dopolnjen" v={u.profile_completed ? 'da' : 'ne'} />
            <KV k="Identiteta preverjena" v={u.identity_verified ? 'da' : 'ne'} /><KV k="Pogoji" v={`${u.terms_version || '/'} (veljavni ${u.terms_version_current})`} />
            <KV k="Naročnina" v={u.subscription_tier} /><KV k="Račun za izplačila" v={u.has_payout_account ? (u.payout_onboarding_complete === false ? 'ni dokončan' : 'da') : 'ne'} />
            <KV k="Blokada objav do" v={u.auction_blocked_until ? fmt(u.auction_blocked_until) : 'ni'} /><KV k="DDV ID veljaven" v={u.vat_id_valid === null ? '/' : u.vat_id_valid ? 'da' : 'ne'} />
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-2">
          <p className="font-black uppercase text-xs text-[#0A1128]">Opomini in spori</p>
          <KV k="Opomini zadnjih 180 dni" v={detail.strikes_180d} />
          {detail.strikes.map((s: any) => <p key={s.id} className="text-xs text-slate-500">{fmt(s.created_at)} · {s.reason} · naročilo {s.order_id || '/'}</p>)}
          <KV k="Prijave »ni prispelo« (skupaj / 180 dni)" v={`${ds.not_received_reports || 0} / ${ds.not_received_180d || 0}`} />
          <KV k="Druge prijave" v={ds.other_disputes || 0} />
          <KV k="Spori kot prodajalec" v={ds.disputes_as_seller || 0} />
          <KV k="Utemeljene / zavrnjene prijave" v={`${ds.reports_upheld || 0} / ${ds.reports_rejected || 0}`} />
          <KV k="Neoddan dokaz prodajalca" v={ds.proof_missed_as_seller || 0} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-1">
            <p className="font-black uppercase text-xs text-[#0A1128]">Kot prodajalec ({detail.selling.total})</p>
            <p className="text-[11px] text-slate-400">{Object.entries(detail.selling.by_status).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
            {detail.selling.recent.map((a: any) => <p key={a.id} className="text-xs text-slate-600">{a.title} · {a.price ?? '/'} € · {a.status}/{a.post_auction_status || '-'}/{a.payment_status || '-'} <span className="text-slate-300">({a.id})</span></p>)}
          </div>
          <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-1">
            <p className="font-black uppercase text-xs text-[#0A1128]">Kot zmagovalec ({detail.winning.total})</p>
            <p className="text-[11px] text-slate-400">{Object.entries(detail.winning.by_payment).map(([k, v]) => `plačilo ${k}: ${v}`).join(' · ')}</p>
            {detail.winning.recent.map((a: any) => <p key={a.id} className="text-xs text-slate-600">{a.title} · {a.price ?? '/'} € · {a.post_auction_status || '-'}/{a.payment_status || '-'} <span className="text-slate-300">({a.id})</span></p>)}
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-1">
          <p className="font-black uppercase text-xs text-[#0A1128]">Naročila</p>
          {detail.transactions.length === 0 && <p className="text-xs text-slate-400">Ni naročil.</p>}
          {detail.transactions.map((t: any) => <p key={t.id} className="text-xs text-slate-600">{t.role} · {t.status}/{t.payout_status} · {t.item_price ?? '/'} € · {t.shipping_type || 'brez odpreme'} <span className="text-slate-300">({t.id})</span></p>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SearchBar value={q} onChange={setQ} onSearch={() => search(q)} placeholder="UID, e-pošta (natančno) ali začetek uporabniškega imena" />
      {loading && <div className="h-16 animate-pulse bg-slate-50 rounded-2xl" />}
      {!loading && items.length === 0 && <p className="text-sm font-bold text-slate-400 text-center py-6">Ni zadetkov.</p>}
      {items.map(u => (
        <button key={u.id} onClick={() => open(u.id)} className="w-full text-left bg-white border border-slate-100 rounded-2xl p-4 hover:border-[#FEBA4F] transition">
          <p className="font-black text-[#0A1128] text-sm">{u.username || u.id} {u.role === 'admin' && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-[#FEBA4F]/30">admin</span>}</p>
          <p className="text-[11px] text-slate-400 font-bold">{u.email_masked || '/'} · {u.country_code || '/'} · registriran {fmt(u.created_at)}</p>
        </button>
      ))}
    </div>
  );
};

export const AdminAuctionsPanel: React.FC<{ onOpenUser: (id: string) => void }> = ({ onOpenUser }) => {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try { setItems((await api(`/api/admin/auctions?q=${encodeURIComponent(query)}`)).items || []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { search(''); }, [search]);

  const open = async (id: string) => {
    try { setDetail(await api(`/api/admin/auctions/${encodeURIComponent(id)}`)); } catch (e: any) { toast.error(e.message); }
  };

  if (detail) {
    const a = detail.auction;
    const person = (label: string, p: any) => p && (
      <p className="text-xs text-slate-600"><span className="font-black uppercase text-slate-400">{label}: </span>
        <button onClick={() => onOpenUser(p.id)} className="underline font-bold text-[#0A1128]">{p.username || p.id}</button> ({p.email_masked || '/'})</p>
    );
    return (
      <div className="space-y-4">
        <button onClick={() => setDetail(null)} className="text-xs font-black uppercase tracking-wider text-slate-500 underline">Nazaj na seznam</button>
        <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-3">
          <p className="font-black text-[#0A1128]">{a.title}</p>
          <p className="text-[11px] font-bold text-slate-400">ID {a.id}</p>
          <Diagnostics items={detail.diagnostics} />
          <div className="grid sm:grid-cols-2 gap-1">
            <KV k="Status" v={`${a.status || '/'} / ${a.post_auction_status || '-'} / plačilo ${a.payment_status || '-'}`} />
            <KV k="Cena" v={`${a.price ?? '/'} € (začetna ${a.starting_price ?? '/'} €)`} />
            <KV k="Ponudb" v={a.bid_count} /><KV k="Slik" v={a.images} />
            <KV k="Kategorija" v={a.category} /><KV k="Regija" v={a.region} />
            <KV k="Predaja" v={a.delivery_option} /><KV k="Objavljena" v={fmt(a.created_at)} />
            <KV k="Konec" v={fmt(a.end_time)} />
          </div>
          {person('Prodajalec', detail.seller)}
          {person('Zmagovalec', detail.winner)}
        </div>
        {detail.transaction && (
          <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-1">
            <p className="font-black uppercase text-xs text-[#0A1128]">Naročilo {detail.transaction.id}</p>
            <KV k="Stanje" v={`${detail.transaction.status} / ${detail.transaction.payout_status}`} />
            <KV k="Plačano" v={fmt(detail.transaction.paid_at)} /><KV k="Odposlano" v={fmt(detail.transaction.shipped_at)} />
            <KV k="Pošiljka" v={`${detail.transaction.shipping_type || '/'} ${detail.transaction.tracking_number || ''}`} />
          </div>
        )}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-1">
          <p className="font-black uppercase text-xs text-[#0A1128]">Zadnje ponudbe</p>
          {detail.recent_bids.length === 0 && <p className="text-xs text-slate-400">Ni ponudb.</p>}
          {detail.recent_bids.map((b: any, i: number) => <p key={i} className="text-xs text-slate-600">{fmt(b.created_at)} · {b.amount ?? '/'} € · {b.user_id || '/'}</p>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SearchBar value={q} onChange={setQ} onSearch={() => search(q)} placeholder="ID dražbe, UID prodajalca ali del naslova" />
      {loading && <div className="h-16 animate-pulse bg-slate-50 rounded-2xl" />}
      {!loading && items.length === 0 && <p className="text-sm font-bold text-slate-400 text-center py-6">Ni zadetkov.</p>}
      {items.map(a => (
        <button key={a.id} onClick={() => open(a.id)} className="w-full text-left bg-white border border-slate-100 rounded-2xl p-4 hover:border-[#FEBA4F] transition">
          <p className="font-black text-[#0A1128] text-sm">{a.title || a.id}</p>
          <p className="text-[11px] text-slate-400 font-bold">{a.price ?? '/'} € · {a.status}/{a.post_auction_status || '-'}/{a.payment_status || '-'} · konec {fmt(a.end_time)}</p>
        </button>
      ))}
    </div>
  );
};
