import React, { useEffect, useState, useCallback } from 'react';
import { Star, Gift, Copy, Share2, Users, Tag, CheckCircle2, Clock, XCircle, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthHeaders } from '../../lib/authFetch';
import { getDeviceId, getFingerprint } from '../../lib/referral';
import { friendlyError } from '../../lib/friendlyError';
import { LoadingButton } from '../ui/Common';

interface MeResponse {
  founder: { isFounder: boolean; isActive: boolean; number: number | null; tier: string; since: string | null; until: string | null; daysLeft: number };
  effective_tier: 'FREE' | 'BASIC' | 'PRO';
  referral: {
    enabled: boolean;
    code: string | null;
    link: string | null;
    reward_listings: number;
    reward_valid_months: number;
    invited: Array<{ status: string; created_at: string; rewarded_at: string | null }>;
    invited_by_status: string | null;
  };
  credits: Array<{ remaining: number; expires_at: string; source: string }>;
}

// Deutscher Kommentar: Provision im ersten Preisbereich je Stufe (muss mit lib/feeCalculator.ts uebereinstimmen)
const FIRST_BRACKET_PERCENT: Record<string, string> = { FREE: '10', BASIC: '7', PRO: '5' };

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('sl-SI') : '–');

export const PromotionsView: React.FC = () => {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = `?device_id=${encodeURIComponent(getDeviceId())}&fp=${encodeURIComponent(getFingerprint().slice(0, 190))}`;
      const res = await fetch(`/api/promotions/me${qs}`, { headers: await getAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Podatkov ni bilo mogoče pridobiti.');
      setData(json);
    } catch (e: any) {
      setError(friendlyError(e, 'Podatkov ni bilo mogoče pridobiti.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copyLink = async () => {
    if (!data?.referral.link) return;
    try {
      await navigator.clipboard.writeText(data.referral.link);
      toast.success('Povezava je kopirana.');
    } catch {
      toast.error('Kopiranje ni uspelo. Povezavo označite in kopirajte ročno.');
    }
  };

  const shareLink = async () => {
    if (!data?.referral.link) return;
    const text = 'Pridruži se mi na Dražbeniku – spletnih dražbah. Z mojo povezavo se registriraš in oba dobiva dodatne objave.';
    if (navigator.share) {
      try { await navigator.share({ title: 'Dražbenik', text, url: data.referral.link }); return; } catch { /* Abbruch */ }
    }
    copyLink();
  };

  const redeemCode = async () => {
    if (!code.trim()) return;
    setRedeeming(true);
    try {
      const res = await fetch('/api/promotions/redeem-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ code })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Kode ni bilo mogoče vnesti.');
      toast.success(`Koda sprejeta: +${json.listings} objav.`);
      setCode('');
      load();
    } catch (e: any) {
      toast.error(friendlyError(e, 'Kode ni bilo mogoče vnesti.'));
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-slate-400 font-bold">Nalaganje...</div>;
  if (error || !data) return <div className="py-16 text-center text-red-500 font-bold">{error || 'Napaka.'}</div>;

  const f = data.founder;
  const r = data.referral;
  const rewarded = r.invited.filter(i => i.status === 'rewarded').length;
  const pending = r.invited.filter(i => i.status === 'pending').length;
  const creditTotal = data.credits.reduce((sum, c) => sum + c.remaining, 0);

  return (
    <div className="animate-in fade-in slide-in-from-right-4 space-y-6">
      <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] flex items-center gap-2">
        <Gift size={20} className="text-[#FEBA4F]" /> Ugodnosti in povabila
      </h3>

      {/* Gruendungsmitglied */}
      <div className={`rounded-3xl p-5 md:p-6 border-2 ${f.isActive ? 'border-[#FEBA4F] bg-gradient-to-br from-amber-50 to-white' : 'border-slate-100 bg-slate-50'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${f.isActive ? 'bg-[#FEBA4F] text-[#0A1128]' : 'bg-slate-200 text-slate-400'}`}>
            <Star size={24} fill={f.isActive ? 'currentColor' : 'none'} />
          </div>
          <div className="min-w-0 flex-1">
            {f.isFounder ? (
              <>
                <p className="font-black text-[#0A1128] uppercase tracking-tight text-lg">
                  Ustanovni član #{f.number}
                  {!f.isActive && <span className="ml-2 text-xs text-slate-400 normal-case font-bold">(ugodnost je potekla)</span>}
                </p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white rounded-2xl p-3 border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Paket</p>
                    <p className="font-black text-[#0A1128]">{f.isActive ? f.tier : 'Običajni'}</p>
                  </div>
                  <div className="bg-white rounded-2xl p-3 border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1"><Percent size={11} /> Vaša provizija</p>
                    <p className="font-black text-[#0A1128]">{FIRST_BRACKET_PERCENT[data.effective_tier] || '10'} % <span className="text-[11px] text-slate-500 font-bold">(do 1.000 €, najmanj 1 €)</span></p>
                  </div>
                  <div className="bg-white rounded-2xl p-3 border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1"><Clock size={11} /> {f.isActive ? 'Velja do' : 'Potekla'}</p>
                    <p className="font-black text-[#0A1128]">{fmtDate(f.until)}</p>
                    {f.isActive && <p className="text-[11px] text-slate-500 font-bold">še {f.daysLeft} dni</p>}
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 font-medium leading-relaxed">
                  Kot ustanovni član imate eno leto paket PRO: neomejene objave in nižjo provizijo za kupce. Po izteku se račun samodejno vrne na izbrani paket.
                </p>
              </>
            ) : (
              <>
                <p className="font-black text-[#0A1128] uppercase tracking-tight">Ustanovni član</p>
                <p className="mt-1 text-sm text-slate-600 font-medium">
                  Ugodnost za prvih 500 uporabnikov (eno leto paket PRO) za vaš račun ni na voljo.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bonus-Inserate */}
      <div className="rounded-3xl p-5 md:p-6 border border-slate-100 bg-white shadow-sm">
        <p className="font-black text-[#0A1128] uppercase tracking-tight mb-1">Bonus objave</p>
        <p className="text-sm text-slate-600 font-medium">
          {creditTotal > 0
            ? <>Na voljo imate <span className="font-black text-[#0A1128]">{creditTotal}</span> dodatne objave.</>
            : 'Trenutno nimate dodatnih objav.'}
        </p>
        {data.credits.length > 0 && (
          <ul className="mt-2 text-xs text-slate-500 font-medium space-y-1">
            {data.credits.map((c, i) => (
              <li key={i}>{c.remaining} objav – velja do {fmtDate(c.expires_at)}</li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') redeemCode(); }}
            placeholder="Koda za bonus objave"
            maxLength={32}
            className="flex-1 min-w-0 px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-[#FEBA4F] outline-none text-sm font-bold uppercase tracking-wider"
          />
          <LoadingButton
            type="button"
            onClick={redeemCode}
            loading={redeeming}
            loadingText="..."
            className="px-5 py-3 rounded-2xl bg-[#0A1128] text-white text-xs font-black uppercase tracking-wider"
          >
            <Tag size={14} /> Vnesi
          </LoadingButton>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 font-medium">Kode za popust na provizijo vnesete pri plačilu dražbe.</p>
      </div>

      {/* Einladungsprogramm */}
      {r.enabled && (
        <div className="rounded-3xl p-5 md:p-6 border border-slate-100 bg-white shadow-sm">
          <p className="font-black text-[#0A1128] uppercase tracking-tight mb-1 flex items-center gap-2"><Users size={18} className="text-[#FEBA4F]" /> Povabi prijatelja</p>
          <p className="text-sm text-slate-600 font-medium leading-relaxed">
            Ko se povabljeni registrira, potrdi e-naslov in zaključi svojo prvo prodajo, dobita <span className="font-black text-[#0A1128]">oba +{r.reward_listings} objavi</span>.
            Povabite lahko neomejeno prijateljev – za vsakega dobite novo nagrado. Dodatne objave veljajo {r.reward_valid_months} mesecev od prejema.
          </p>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={r.link || ''}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 px-4 py-3 rounded-2xl border-2 border-slate-100 bg-slate-50 text-xs md:text-sm font-bold text-slate-700"
            />
            <div className="flex gap-2">
              <button type="button" onClick={copyLink} className="flex-1 sm:flex-none px-4 py-3 rounded-2xl bg-[#0A1128] text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer">
                <Copy size={14} /> Kopiraj
              </button>
              <button type="button" onClick={shareLink} className="flex-1 sm:flex-none px-4 py-3 rounded-2xl bg-[#FEBA4F] text-[#0A1128] text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer">
                <Share2 size={14} /> Deli
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400 font-medium">Vaša koda: <span className="font-black text-slate-600">{r.code}</span></p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-50 rounded-2xl p-3"><p className="text-2xl font-black text-[#0A1128]">{r.invited.length}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Povabljenih</p></div>
            <div className="bg-slate-50 rounded-2xl p-3"><p className="text-2xl font-black text-amber-500">{pending}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">V teku</p></div>
            <div className="bg-slate-50 rounded-2xl p-3"><p className="text-2xl font-black text-emerald-600">{rewarded}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nagrajenih</p></div>
          </div>

          {r.invited.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {r.invited.map((i, idx) => (
                <li key={idx} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-slate-500 font-medium">Povabljen {fmtDate(i.created_at)}</span>
                  {i.status === 'rewarded' && <span className="flex items-center gap-1 text-emerald-600 font-black text-xs uppercase"><CheckCircle2 size={14} /> Nagrajen</span>}
                  {i.status === 'pending' && <span className="flex items-center gap-1 text-amber-600 font-black text-xs uppercase"><Clock size={14} /> Čaka na prvo prodajo</span>}
                  {i.status === 'rejected' && <span className="flex items-center gap-1 text-slate-400 font-black text-xs uppercase"><XCircle size={14} /> Ni upravičen</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[11px] text-slate-400 font-medium leading-relaxed">
            Nagrada ne velja za račune z iste naprave ali iz istega omrežja kot povabljeni in je omejena na en račun na napravo.
          </p>

          {r.invited_by_status && (
            <p className="mt-3 text-xs font-bold text-slate-600">
              Registrirani ste bili s povabilom. {r.invited_by_status === 'pending' && 'Po vaši prvi zaključeni prodaji dobita oba nagrado.'}
              {r.invited_by_status === 'rewarded' && 'Nagrada je že dodeljena.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
