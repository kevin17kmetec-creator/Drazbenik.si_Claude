import React, { useEffect, useState, useCallback } from 'react';
import { Gift, Star, Users, Tag, RefreshCw, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthHeaders } from '../../lib/authFetch';
import { friendlyError } from '../../lib/friendlyError';
import { confirmDialog } from '../../lib/dialog';

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('sl-SI') : '–');
const toLocalInput = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

async function api(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Napaka.');
  return json;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: 'V teku', cls: 'bg-amber-100 text-amber-700' },
  rewarded: { text: 'Nagrajen', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { text: 'Zavrnjen', cls: 'bg-red-100 text-red-600' }
};

const REASON_LABEL: Record<string, string> = {
  same_device_as_referrer: 'Ista naprava kot povabitelj',
  same_network_as_referrer: 'Isto omrežje kot povabitelj',
  device_already_used_for_referral: 'Naprava je že uporabljena za povabilo',
  same_network_as_other_invited: 'Isto omrežje kot drug povabljenec',
  buyer_is_party: 'Kupec je povabitelj ali povabljenec',
  buyer_same_device_or_network: 'Kupec z iste naprave/omrežja',
  admin_rejected: 'Ročno zavrnjeno'
};

const inputCls = 'w-full px-3 py-2 rounded-xl border-2 border-slate-100 focus:border-[#FEBA4F] outline-none text-sm font-bold';
const labelCls = 'block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1';
const cardCls = 'bg-white rounded-3xl p-5 md:p-6 border border-slate-100 shadow-sm';

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-slate-50 rounded-2xl p-4">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-2xl font-black text-[#0A1128]">{value}</p>
    {sub && <p className="text-[11px] text-slate-500 font-bold">{sub}</p>}
  </div>
);

const emptyPromo = {
  code: '', description: '', type: 'commission_percent', value: 100,
  max_discount_cents: 0, min_purchase_cents: 0, max_uses: 0, per_user_limit: 1,
  valid_from: '', valid_until: '', active: true
};

export const PromotionsAdminPanel: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [promo, setPromo] = useState<any>({ ...emptyPromo });
  const [grantEmail, setGrantEmail] = useState('');
  const [refFilter, setRefFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await api('/api/admin/promotions/overview');
      setData(json);
      setCfg(json.config);
    } catch (e: any) {
      toast.error(friendlyError(e, 'Podatkov ni bilo mogoče pridobiti.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api('/api/admin/promotions/config', 'POST', cfg);
      toast.success('Nastavitve so shranjene.');
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Shranjevanje ni uspelo.'));
    } finally {
      setSaving(false);
    }
  };

  const founderAction = async (payload: any, okMsg: string) => {
    try {
      await api('/api/admin/promotions/founder', 'POST', payload);
      toast.success(okMsg);
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Dejanje ni uspelo.'));
    }
  };

  const referralAction = async (invited_id: string, action: 'approve' | 'reject') => {
    try {
      await api('/api/admin/promotions/referral', 'POST', { invited_id, action });
      toast.success('Shranjeno.');
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Dejanje ni uspelo.'));
    }
  };

  const savePromo = async () => {
    try {
      await api('/api/admin/promotions/promo-codes', 'POST', {
        ...promo,
        valid_from: promo.valid_from ? new Date(promo.valid_from).toISOString() : null,
        valid_until: promo.valid_until ? new Date(promo.valid_until).toISOString() : null,
        // Deutscher Kommentar: Betraege werden im Formular in Euro erfasst, der Server speichert Cent
        value: promo.type === 'commission_fixed' ? Math.round(Number(promo.value) * 100) : Number(promo.value),
        max_discount_cents: Math.round(Number(promo.max_discount_cents || 0) * 100),
        min_purchase_cents: Math.round(Number(promo.min_purchase_cents || 0) * 100)
      });
      toast.success('Koda je shranjena.');
      setPromo({ ...emptyPromo });
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Shranjevanje ni uspelo.'));
    }
  };

  const toggleCode = async (code: string, active: boolean) => {
    try {
      await api('/api/admin/promotions/promo-codes/toggle', 'POST', { code, active });
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Dejanje ni uspelo.'));
    }
  };

  const deleteCode = async (code: string) => {
    const ok = await confirmDialog(`Ali želite izbrisati kodo ${code}? Statistika uporabe se izgubi.`, { title: 'Izbris kode', confirmLabel: 'Izbriši', tone: 'danger' });
    if (!ok) return;
    try {
      await api('/api/admin/promotions/promo-codes/toggle', 'POST', { code, delete: true });
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Brisanje ni uspelo.'));
    }
  };

  if (loading && !data) return <div className="py-16 text-center text-slate-400 font-bold">Nalaganje...</div>;
  if (!data || !cfg) return <div className="py-16 text-center text-red-500 font-bold">Podatkov ni bilo mogoče naložiti.</div>;

  const counts = data.referralCounts || {};
  const referrals = (data.referrals || []).filter((r: any) => refFilter === 'all' || r.status === refFilter);
  const totalDiscount = (data.promoCodes || []).reduce((s: number, p: any) => s + (p.total_discount_cents || 0), 0);
  const totalUses = (data.promoCodes || []).reduce((s: number, p: any) => s + (p.used_count || 0), 0);

  return (
    <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] flex items-center gap-2">
          <Gift size={20} className="text-[#FEBA4F]" /> Promocije (admin)
        </h3>
        <button type="button" onClick={load} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer" aria-label="Osveži">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Uebersicht */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Ustanovni člani" value={`${cfg.founder.count} / ${cfg.founder.limit}`} sub={cfg.founder.enabled ? 'Aktivno' : 'Izklopljeno'} />
        <Stat label="Povabila" value={Object.values(counts).reduce((a: any, b: any) => a + b, 0) as number} sub={`${counts.rewarded || 0} nagrajenih · ${counts.pending || 0} v teku · ${counts.rejected || 0} zavrnjenih`} />
        <Stat label="Uporabe kod" value={totalUses} />
        <Stat label="Podarjena provizija" value={`€${(totalDiscount / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2 })}`} sub="brez DDV" />
      </div>

      {/* Nastavitve */}
      <div className={cardCls}>
        <p className="font-black text-[#0A1128] uppercase tracking-tight mb-4 flex items-center gap-2"><Star size={16} className="text-[#FEBA4F]" /> Pravila programov</p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-[#0A1128]">Ustanovni član</p>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={cfg.founder.enabled} onChange={e => setCfg({ ...cfg, founder: { ...cfg.founder, enabled: e.target.checked } })} /> Program je vklopljen
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Število mest</label><input type="number" min={cfg.founder.count} className={inputCls} value={cfg.founder.limit} onChange={e => setCfg({ ...cfg, founder: { ...cfg.founder, limit: Number(e.target.value) } })} /></div>
              <div><label className={labelCls}>Trajanje (meseci)</label><input type="number" min={1} max={36} className={inputCls} value={cfg.founder.months} onChange={e => setCfg({ ...cfg, founder: { ...cfg.founder, months: Number(e.target.value) } })} /></div>
              <div><label className={labelCls}>Paket</label>
                <select className={inputCls} value={cfg.founder.tier} onChange={e => setCfg({ ...cfg, founder: { ...cfg.founder, tier: e.target.value } })}>
                  <option value="PRO">PRO</option><option value="BASIC">BASIC</option>
                </select>
              </div>
              <div><label className={labelCls}>Velja za registracije od</label><input type="datetime-local" className={inputCls} value={toLocalInput(cfg.founder.eligible_from)} onChange={e => setCfg({ ...cfg, founder: { ...cfg.founder, eligible_from: e.target.value ? new Date(e.target.value).toISOString() : null } })} /></div>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Mesta se podelijo ob potrjenem e-naslovu. Prazen datum = vsi uporabniki (tudi obstoječi).</p>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-[#0A1128]">Povabi prijatelja</p>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={cfg.referral.enabled} onChange={e => setCfg({ ...cfg, referral: { ...cfg.referral, enabled: e.target.checked } })} /> Program je vklopljen
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Bonus objav (vsak)</label><input type="number" min={0} max={50} className={inputCls} value={cfg.referral.reward_listings} onChange={e => setCfg({ ...cfg, referral: { ...cfg.referral, reward_listings: Number(e.target.value) } })} /></div>
              <div><label className={labelCls}>Veljavnost (meseci)</label><input type="number" min={1} max={36} className={inputCls} value={cfg.referral.reward_valid_months} onChange={e => setCfg({ ...cfg, referral: { ...cfg.referral, reward_valid_months: Number(e.target.value) } })} /></div>
              <div className="col-span-2"><label className={labelCls}>Največ nagrad na povabitelja (0 = neomejeno)</label><input type="number" min={0} className={inputCls} value={cfg.referral.max_rewards_per_user} onChange={e => setCfg({ ...cfg, referral: { ...cfg.referral, max_rewards_per_user: Number(e.target.value) } })} /></div>
            </div>
          </div>
        </div>
        <button type="button" disabled={saving} onClick={saveConfig} className="mt-5 px-6 py-3 rounded-2xl bg-[#0A1128] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50 cursor-pointer">
          <Save size={14} /> {saving ? 'Shranjujem...' : 'Shrani pravila'}
        </button>
      </div>

      {/* Aktionscodes */}
      <div className={cardCls}>
        <p className="font-black text-[#0A1128] uppercase tracking-tight mb-4 flex items-center gap-2"><Tag size={16} className="text-[#FEBA4F]" /> Promocijske kode</p>
        <div className="grid md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Koda</label><input className={`${inputCls} uppercase`} maxLength={32} value={promo.code} onChange={e => setPromo({ ...promo, code: e.target.value.toUpperCase() })} placeholder="NPR. START100" /></div>
          <div><label className={labelCls}>Vrsta</label>
            <select className={inputCls} value={promo.type} onChange={e => setPromo({ ...promo, type: e.target.value })}>
              <option value="commission_percent">Popust na provizijo (%)</option>
              <option value="commission_fixed">Popust na provizijo (€)</option>
              <option value="bonus_listings">Bonus objave (v nastavitvah)</option>
            </select>
          </div>
          <div><label className={labelCls}>{promo.type === 'commission_percent' ? 'Odstotek' : promo.type === 'commission_fixed' ? 'Znesek (€)' : 'Št. objav'}</label><input type="number" min={0} step={promo.type === 'commission_fixed' ? '0.01' : '1'} className={inputCls} value={promo.value} onChange={e => setPromo({ ...promo, value: e.target.value })} /></div>
          <div><label className={labelCls}>Opis (za vas)</label><input className={inputCls} value={promo.description} onChange={e => setPromo({ ...promo, description: e.target.value })} /></div>
          {promo.type !== 'bonus_listings' && (
            <>
              <div><label className={labelCls}>Največji popust (€, 0 = brez)</label><input type="number" min={0} step="0.01" className={inputCls} value={promo.max_discount_cents} onChange={e => setPromo({ ...promo, max_discount_cents: e.target.value })} /></div>
              <div><label className={labelCls}>Najmanjši nakup (€)</label><input type="number" min={0} step="0.01" className={inputCls} value={promo.min_purchase_cents} onChange={e => setPromo({ ...promo, min_purchase_cents: e.target.value })} /></div>
            </>
          )}
          <div><label className={labelCls}>Skupno uporab (0 = brez)</label><input type="number" min={0} className={inputCls} value={promo.max_uses} onChange={e => setPromo({ ...promo, max_uses: e.target.value })} /></div>
          <div><label className={labelCls}>Uporab na uporabnika</label><input type="number" min={1} className={inputCls} value={promo.per_user_limit} onChange={e => setPromo({ ...promo, per_user_limit: e.target.value })} /></div>
          <div><label className={labelCls}>Velja od</label><input type="datetime-local" className={inputCls} value={promo.valid_from} onChange={e => setPromo({ ...promo, valid_from: e.target.value })} /></div>
          <div><label className={labelCls}>Velja do</label><input type="datetime-local" className={inputCls} value={promo.valid_until} onChange={e => setPromo({ ...promo, valid_until: e.target.value })} /></div>
        </div>
        <button type="button" onClick={savePromo} className="mt-4 px-6 py-3 rounded-2xl bg-[#FEBA4F] text-[#0A1128] text-xs font-black uppercase tracking-wider cursor-pointer">Shrani kodo</button>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-400">
              <th className="py-2 pr-3">Koda</th><th className="pr-3">Ugodnost</th><th className="pr-3">Uporabe</th><th className="pr-3">Velja</th><th className="pr-3">Stanje</th><th></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data.promoCodes || []).length === 0 && <tr><td colSpan={6} className="py-4 text-slate-400 font-medium">Ni še nobene kode.</td></tr>}
              {(data.promoCodes || []).map((p: any) => (
                <tr key={p.code} className="align-top">
                  <td className="py-2 pr-3 font-black text-[#0A1128]">{p.code}<div className="text-[11px] text-slate-400 font-medium">{p.description}</div></td>
                  <td className="pr-3 font-bold text-slate-600">
                    {p.type === 'commission_percent' && `${p.value} % provizije`}
                    {p.type === 'commission_fixed' && `${(p.value / 100).toFixed(2)} € provizije`}
                    {p.type === 'bonus_listings' && `+${p.value} objav`}
                    {p.max_discount_cents > 0 && <div className="text-[11px] text-slate-400">največ {(p.max_discount_cents / 100).toFixed(2)} €</div>}
                  </td>
                  <td className="pr-3 font-bold text-slate-600">{p.used_count || 0}{p.max_uses > 0 ? ` / ${p.max_uses}` : ''}<div className="text-[11px] text-slate-400">{((p.total_discount_cents || 0) / 100).toFixed(2)} € popusta</div></td>
                  <td className="pr-3 text-xs text-slate-500 font-medium">{fmt(p.valid_from)} – {fmt(p.valid_until)}</td>
                  <td className="pr-3"><button type="button" onClick={() => toggleCode(p.code, !p.active)} className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.active ? 'Aktivna' : 'Izklopljena'}</button></td>
                  <td><button type="button" onClick={() => deleteCode(p.code)} className="p-2 text-slate-300 hover:text-red-500 cursor-pointer" aria-label="Izbriši"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gruendungsmitglieder */}
      <div className={cardCls}>
        <p className="font-black text-[#0A1128] uppercase tracking-tight mb-4 flex items-center gap-2"><Star size={16} className="text-[#FEBA4F]" /> Ustanovni člani</p>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input className={inputCls} placeholder="E-naslov uporabnika (ročna dodelitev, npr. obstoječi uporabnik)" value={grantEmail} onChange={e => setGrantEmail(e.target.value)} />
          <button type="button" onClick={() => { if (grantEmail.trim()) { founderAction({ email: grantEmail.trim().toLowerCase(), action: 'grant' }, 'Status je dodeljen.'); setGrantEmail(''); } }} className="px-5 py-2 rounded-xl bg-[#0A1128] text-white text-xs font-black uppercase tracking-wider shrink-0 cursor-pointer">Dodeli</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">#</th><th className="pr-3">Uporabnik</th><th className="pr-3">Od</th><th className="pr-3">Do</th><th></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.founders.length === 0 && <tr><td colSpan={5} className="py-4 text-slate-400 font-medium">Še ni ustanovnih članov.</td></tr>}
              {data.founders.map((u: any) => (
                <tr key={u.id}>
                  <td className="py-2 pr-3 font-black text-[#0A1128]">{u.founder_number}</td>
                  <td className="pr-3 font-bold text-slate-600">{u.email || u.username || u.id}</td>
                  <td className="pr-3 text-xs text-slate-500">{fmt(u.founder_since)}</td>
                  <td className="pr-3 text-xs text-slate-500">{fmt(u.founder_until)}</td>
                  <td className="text-right">
                    {u.founder_revoked
                      ? <button type="button" onClick={() => founderAction({ user_id: u.id, action: 'restore' }, 'Status je obnovljen.')} className="text-[11px] font-black uppercase text-emerald-600 cursor-pointer">Obnovi</button>
                      : <button type="button" onClick={() => founderAction({ user_id: u.id, action: 'revoke' }, 'Status je odvzet.')} className="text-[11px] font-black uppercase text-red-500 cursor-pointer">Odvzemi</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Einladungen */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <p className="font-black text-[#0A1128] uppercase tracking-tight flex items-center gap-2"><Users size={16} className="text-[#FEBA4F]" /> Povabila</p>
          <select className="px-3 py-2 rounded-xl border-2 border-slate-100 text-xs font-bold" value={refFilter} onChange={e => setRefFilter(e.target.value)}>
            <option value="all">Vsa</option><option value="pending">V teku</option><option value="rewarded">Nagrajena</option><option value="rejected">Zavrnjena</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Datum</th><th className="pr-3">Povabitelj</th><th className="pr-3">Povabljeni</th><th className="pr-3">Stanje</th><th className="pr-3">Razlog</th><th></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {referrals.length === 0 && <tr><td colSpan={6} className="py-4 text-slate-400 font-medium">Ni povabil.</td></tr>}
              {referrals.map((r: any) => {
                const st = STATUS_LABEL[r.status] || { text: r.status, cls: 'bg-slate-100 text-slate-500' };
                return (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 text-xs text-slate-500">{fmt(r.created_at)}</td>
                    <td className="pr-3 text-xs font-bold text-slate-600 break-all">{r.referrer_id}</td>
                    <td className="pr-3 text-xs font-bold text-slate-600 break-all">{r.invited_id}</td>
                    <td className="pr-3"><span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${st.cls}`}>{st.text}</span></td>
                    <td className="pr-3 text-xs text-slate-500">{r.reject_reason ? (REASON_LABEL[r.reject_reason] || r.reject_reason) : ''}</td>
                    <td className="text-right whitespace-nowrap">
                      {r.status !== 'rewarded' && r.status !== 'pending' && <button type="button" onClick={() => referralAction(r.id, 'approve')} className="text-[11px] font-black uppercase text-emerald-600 mr-3 cursor-pointer">Odobri</button>}
                      {r.status !== 'rewarded' && r.status !== 'rejected' && <button type="button" onClick={() => referralAction(r.id, 'reject')} className="text-[11px] font-black uppercase text-red-500 cursor-pointer">Zavrni</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
