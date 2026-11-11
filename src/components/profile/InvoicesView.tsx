import React, { useEffect, useMemo, useState } from 'react';
import { alertDialog } from '../../lib/dialog';
import { FileText, Download, Gavel, Repeat, Loader2 } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { getAuthHeaders } from '../../lib/authFetch';
import { LoadingButton } from '../ui/Common';

type InvoiceKind = 'auction' | 'subscription';

interface InvoiceItem {
  id: string;
  kind: InvoiceKind;
  invoice_no: string;
  auction_id?: string;
  auction_title?: string;
  auction_image?: string;
  seller_name?: string;
  package_id?: string;
  amount_total: number | null;
  item_price?: number | null;
  platform_fee?: number | null;
  payment_method?: string;
  created_at: string;
}

const formatMoney = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : `€${Number(v).toFixed(2)}`;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('sl-SI') + ', ' + d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
};

export const InvoicesView: React.FC = () => {
  const [view, setView] = useState<InvoiceKind>('auction');
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (!auth.currentUser) return;
        const res = await fetch('/api/invoices/mine', { headers: await getAuthHeaders() });
        if (!res.ok) throw new Error('Računov ni bilo mogoče naložiti.');
        const json = await res.json();
        if (alive) setInvoices(Array.isArray(json.invoices) ? json.invoices : []);
      } catch (e: any) {
        if (alive) setError(e.message || 'Računov ni bilo mogoče naložiti.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => invoices.filter(i => i.kind === view), [invoices, view]);
  const counts = useMemo(() => ({
    auction: invoices.filter(i => i.kind === 'auction').length,
    subscription: invoices.filter(i => i.kind === 'subscription').length
  }), [invoices]);

  const download = async (inv: InvoiceItem) => {
    try {
      setDownloadingId(inv.id);
      const url = inv.kind === 'subscription'
        ? `/api/subscription/download-invoice/${encodeURIComponent(inv.invoice_no)}`
        : `/api/invoices/file?auction_id=${encodeURIComponent(inv.auction_id || '')}`;
      const res = await fetch(url, { headers: await getAuthHeaders() });
      if (!res.ok) throw new Error('Napaka pri prenosu računa');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `racun_${inv.invoice_no || inv.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      void alertDialog('Napaka pri prenosu računa. Poskusite ponovno.', { tone: 'danger' });
    } finally {
      setDownloadingId(null);
    }
  };

  const tabClass = (active: boolean) =>
    `flex-1 flex items-center justify-center gap-2 px-3 md:px-5 py-3 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all ${
      active ? 'bg-[#0A1128] text-white shadow-lg' : 'text-slate-400 hover:text-[#0A1128]'
    }`;

  return (
    <div className="animate-in fade-in slide-in-from-right-4">
      <div className="mb-6">
        <h3 className="text-xl font-black uppercase tracking-tighter text-[#0A1128] mb-2 flex items-center gap-2">
          <FileText size={20} className="text-[#FEBA4F]" /> Računi
        </h3>
        <p className="text-slate-400 font-bold text-sm">Vsi uradni računi za nakupe na dražbah in za naročnine.</p>
      </div>

      <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl mb-6">
        <button type="button" onClick={() => setView('auction')} className={tabClass(view === 'auction')}>
          <Gavel size={16} /> Dražbe ({counts.auction})
        </button>
        <button type="button" onClick={() => setView('subscription')} className={tabClass(view === 'subscription')}>
          <Repeat size={16} /> Naročnine ({counts.subscription})
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-xs font-bold uppercase tracking-widest">Nalaganje računov...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold">{error}</div>
      ) : shown.length === 0 ? (
        <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {view === 'auction' ? 'Ni računov za nakupe na dražbah.' : 'Ni računov za naročnine.'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 px-4">
            Račun se pojavi tukaj takoj po uspešnem plačilu, prejmete pa ga tudi na e-pošto.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(inv => {
            const isPro = String(inv.package_id || '').toUpperCase().includes('PRO');
            const title = inv.kind === 'auction'
              ? (inv.auction_title || 'Dražba')
              : `Naročnina – paket ${isPro ? 'NAPREDNI' : 'OSNOVNI'}`;
            return (
              <div key={inv.id} className="border border-slate-100 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {inv.kind === 'auction' && inv.auction_image ? (
                    <img src={inv.auction_image} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0 bg-slate-100" loading="lazy" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                      {inv.kind === 'auction' ? <Gavel size={20} /> : <Repeat size={20} />}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-black text-sm text-[#0A1128] truncate">{title}</p>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">
                      Račun št. {inv.invoice_no || '—'} • <span className="text-slate-400">{formatDate(inv.created_at)}</span>
                    </p>
                    <p className="text-[11px] font-bold text-slate-400 mt-1 break-words">
                      {inv.kind === 'auction' ? (
                        <>
                          {inv.seller_name ? `Prodajalec: ${inv.seller_name} • ` : ''}
                          {inv.item_price != null ? `Cena: ${formatMoney(inv.item_price)} • ` : ''}
                          {inv.platform_fee != null ? `Provizija: ${formatMoney(inv.platform_fee)} • ` : ''}
                          {inv.payment_method ? `Plačilo: ${inv.payment_method}` : ''}
                        </>
                      ) : (
                        <>
                          Obdobje: 1 mesec • {inv.payment_method ? `Plačilo: ${inv.payment_method}` : ''}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6">
                  <div className="text-left md:text-right">
                    <p className="text-lg font-black text-[#0A1128] leading-none">{formatMoney(inv.amount_total)}</p>
                    <span className="inline-block mt-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Plačano</span>
                  </div>
                  <LoadingButton
                    type="button"
                    onClick={() => download(inv)}
                    loading={downloadingId === inv.id}
                    loadingText="Prenašanje..."
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-[#FEBA4F] text-[#0A1128] rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                  >
                    <Download size={14} /> PDF
                  </LoadingButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
