import React, { useState, useEffect } from 'react';
import { Lock, Calendar, AlertTriangle, ArrowLeft, Clock, CheckCircle2, FileText, Download, Loader2 } from 'lucide-react';
import { SubscriptionTier } from "../../types";
import { auth } from "../../lib/firebase";
import { getAuthHeaders } from "../../lib/authFetch";
import { getSubscriptionInvoicesAction } from "../../actions";

export const SubscriptionsView: React.FC<{ 
    t: any; 
    language?: string;
    currentPlan: SubscriptionTier; 
    onSubscribe: (tier: SubscriptionTier) => void; 
    isVerified: boolean;
    onCancelSubscription?: () => void;
    nextBillingDate?: Date;
    subscribedAt?: Date;
    isCanceled?: boolean;
    onBack?: () => void;
    onSyncSubscription?: () => void;
    isSyncing?: boolean;
}> = ({ t, language, currentPlan, onSubscribe, isVerified, onCancelSubscription, nextBillingDate, subscribedAt, isCanceled, onBack, onSyncSubscription, isSyncing }) => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [downloadingNo, setDownloadingNo] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadInvoices = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        setLoadingInvoices(true);
        const token = await user.getIdToken();
        const res = await getSubscriptionInvoicesAction(token);
        if (isMounted && res.success && res.data?.invoices) {
          setInvoices(res.data.invoices);
        }
      } catch (e) {
        console.error("Napaka pri nalaganju računov naročnin:", e);
      } finally {
        if (isMounted) setLoadingInvoices(false);
      }
    };
    loadInvoices();
    return () => { isMounted = false; };
  }, [currentPlan]);

  const handleDownloadInvoice = async (invoiceNo: string) => {
    try {
      setDownloadingNo(invoiceNo);
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : '';
      const response = await fetch(`/api/subscription/download-invoice/${encodeURIComponent(invoiceNo)}`, {
        headers: await getAuthHeaders()
      });
      if (!response.ok) {
        throw new Error('Napaka pri prenosu računa');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `racun_${invoiceNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error("Napaka pri prenosu PDF računa:", err);
      alert("Napaka pri prenosu računa. Poskusite ponovno.");
    } finally {
      setDownloadingNo(null);
    }
  };

  const plans = [
    { tier: SubscriptionTier.FREE, name: t('freeTier'), price: 0, desc: t('freeDesc'), color: 'bg-slate-100 text-slate-600' },
    { tier: SubscriptionTier.BASIC, name: t('basicTier'), price: 20, desc: t('basicDesc'), color: 'bg-[#FEBA4F] text-[#0A1128]' },
    { tier: SubscriptionTier.PRO, name: t('proTier'), price: 50, desc: t('proDesc'), color: 'bg-[#0A1128] text-white' }
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors"
          >
            <ArrowLeft size={16} /> {t('back') || 'Nazaj'}
          </button>
        ) : <div />}
        {onSyncSubscription && (
          <button
            type="button"
            onClick={onSyncSubscription}
            disabled={isSyncing}
            className="text-[11px] font-black uppercase tracking-wider text-slate-500 hover:text-[#0A1128] transition-colors flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {isSyncing ? 'Preverjanje...' : 'Osveži status naročnine'}
          </button>
        )}
      </div>
      <h2 className="text-4xl font-black uppercase tracking-tighter text-[#0A1128] mb-12">{t('subscriptions')}</h2>
      
      {isCanceled && currentPlan !== SubscriptionTier.FREE && (
          <div className="bg-amber-50 border-2 border-amber-200 text-amber-800 p-6 rounded-3xl mb-12 flex items-center gap-4">
              <AlertTriangle className="text-amber-500 shrink-0" size={32} />
              <div>
                  <h4 className="font-black uppercase tracking-widest text-sm mb-1">Naročnina je preklicana</h4>
                  <p className="text-sm font-bold opacity-80">Vaša naročnina je preklicana in se ne bo samodejno obnovila. Ugodnosti vašega paketa veljajo do izteka trenutnega obdobja ({nextBillingDate?.toLocaleDateString('sl-SI')}). Po tem datumu boste samodejno preklopljeni nazaj na brezplačni paket.</p>
              </div>
          </div>
      )}

      {currentPlan !== SubscriptionTier.FREE && !isCanceled && (
          <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-6 rounded-3xl mb-12 flex items-start gap-4">
              <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={28} />
              <div>
                  <h4 className="font-black uppercase tracking-widest text-sm mb-1">Aktivna naročnina</h4>
                  <p className="text-sm font-bold opacity-85">
                      {subscribedAt && <span>Naročeni od: <strong>{subscribedAt.toLocaleDateString('sl-SI')}</strong>. </span>}
                      Bremenitev naročnine poteka samodejno po poteku 1 meseca od nakupa (naslednja bremenitev: <strong>{nextBillingDate?.toLocaleDateString('sl-SI')}</strong>). Naročnino lahko kadarkoli prekinete brez obveznosti.
                  </p>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map(plan => (
          <div key={plan.tier} className={`rounded-[3rem] p-10 flex flex-col ${plan.color} ${currentPlan === plan.tier ? 'ring-4 ring-offset-4 ring-[#FEBA4F]' : ''}`}>
            {currentPlan === plan.tier && (
              <div className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-80 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {plan.tier === SubscriptionTier.FREE ? t('currentPlan') : (t('subscribed') || 'Naročen')}
              </div>
            )}
            <h3 className="text-3xl font-black uppercase tracking-tighter mb-2">{plan.name}</h3>
            <div className="text-5xl font-black mb-6">€{plan.price}<span className="text-lg opacity-60">/mo</span></div>
            <p className="font-bold opacity-80 mb-6 flex-1">{plan.desc}</p>
            
            {currentPlan === plan.tier && plan.tier !== SubscriptionTier.FREE && (
                <div className="bg-black/10 rounded-2xl p-4 mb-6 text-xs font-bold flex flex-col gap-2">
                    {subscribedAt && (
                      <div className="flex items-center gap-2 opacity-80">
                        <Clock size={14} />
                        <span>Naročeni od: {subscribedAt.toLocaleDateString('sl-SI')}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                        <Calendar size={14} />
                        <span>{isCanceled ? 'Velja do izteka' : 'Naslednja bremenitev'}: {nextBillingDate?.toLocaleDateString('sl-SI')}</span>
                    </div>
                </div>
            )}
            
            <button 
              onClick={() => onSubscribe(plan.tier)}
              disabled={currentPlan === plan.tier || (!isVerified && plan.tier !== SubscriptionTier.FREE)}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${currentPlan === plan.tier ? 'bg-black/10 opacity-50 cursor-not-allowed' : (!isVerified && plan.tier !== SubscriptionTier.FREE ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white text-[#0A1128] hover:scale-105 shadow-xl')}`}
            >
              {!isVerified && plan.tier !== SubscriptionTier.FREE ? (
                <><Lock size={18} /> {t('verifyAction')}</>
              ) : (
                currentPlan === plan.tier 
                  ? (plan.tier === SubscriptionTier.FREE ? t('currentPlan') : (t('subscribed') || 'Naročen')) 
                  : t('subscribe')
              )}
            </button>
          </div>
        ))}
      </div>

      {currentPlan !== SubscriptionTier.FREE && !isCanceled && (
          <div className="mt-12 text-center">
              <button 
                  onClick={onCancelSubscription} 
                  className="bg-red-50 text-red-600 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-red-100 transition-colors"
              >
                  Prekliči naročnino
              </button>
              <p className="text-slate-400 font-bold text-xs mt-4">Preklic bo zaustavil samodejno obnovitev. Ugodnosti boste obdržali do izteka trenutnega obdobja.</p>
          </div>
      )}

      {/* RAČUNI ZA NAROČNINE */}
      <div className="mt-16 bg-white border border-slate-200 rounded-[3rem] p-8 sm:p-10 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#FEBA4F]">
              <FileText size={20} className="text-[#0A1128]" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-[#0A1128]">Računi za naročnine</h3>
              <p className="text-xs font-bold text-slate-400">Vsi uradni PDF računi za vaše naročnine na platformi</p>
            </div>
          </div>
        </div>

        {loadingInvoices ? (
          <div className="py-8 flex items-center justify-center text-slate-400 gap-2">
            <Loader2 size={18} className="animate-spin text-[#FEBA4F]" />
            <span className="text-xs font-bold uppercase tracking-widest">Nalaganje računov...</span>
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ni izdanih računov za naročnine.</p>
            <p className="text-[11px] text-slate-400 mt-1">Ob vsakem uspešnem nakupu ali obnovitvi naročnine boste tukaj našli veljaven PDF račun, ki ga prejmete tudi na e-pošto.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => {
              const isPro = String(inv.package_id || '').toUpperCase().includes('PRO');
              const planTitle = isPro ? 'Paket NAPREDNI' : 'Paket OSNOVNI';
              const isDownloading = downloadingNo === inv.invoice_no;
              return (
                <div key={inv.id || inv.invoice_no} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 px-3 rounded-2xl transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-slate-400 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-[#0A1128]">{inv.invoice_no}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Plačano
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">
                        {planTitle} • €{Number(inv.amount || (isPro ? 50 : 20)).toFixed(2)} • {new Date(inv.created_at).toLocaleDateString('sl-SI')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadInvoice(inv.invoice_no)}
                    disabled={isDownloading}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-[#FEBA4F] text-[#0A1128] rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <><Loader2 size={14} className="animate-spin" /> Prenašanje...</>
                    ) : (
                      <><Download size={14} /> Prenesi PDF</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

