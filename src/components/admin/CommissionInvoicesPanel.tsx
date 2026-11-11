import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, RefreshCw, FileText } from 'lucide-react';
import { getAuthHeaders } from '../../lib/authFetch';
import { toast } from '../../lib/toast';

interface CommissionInvoice {
  id: string;
  invoice_no: string;
  issued_at: string;
  net_cents: number;
  vat_cents: number;
  gross_cents: number;
  vat_rate: number;
  buyer_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_tax_id: string;
  seller_id: string;
  auction_id: string;
  auction_title: string;
  transaction_id: string;
  sales_invoice_no: string;
  payment_method: string;
  item_price: number;
  promo_code: string;
  status: string;
}

const eur = (c: number) => (c / 100).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Deutscher Kommentar: Gesamtuebersicht aller Provisionsrechnungen mit Filtern, Einzel- und Sammel-Download
export const CommissionInvoicesPanel: React.FC = () => {
  const [rows, setRows] = useState<CommissionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [method, setMethod] = useState('ALL');

  const load = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/accounting/commission-invoices', { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Napaka pri nalaganju računov.');
      setRows(data.invoices || []);
    } catch (e: any) {
      toast.error(e.message || 'Napaka pri nalaganju računov.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const methods = useMemo(() => Array.from(new Set(rows.map(r => r.payment_method).filter(Boolean))), [rows]);

  const filtered = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59.999').getTime() : null;
    const min = minAmount !== '' ? Number(minAmount.replace(',', '.')) * 100 : null;
    const max = maxAmount !== '' ? Number(maxAmount.replace(',', '.')) * 100 : null;
    return rows.filter(r => {
      const t = new Date(r.issued_at).getTime();
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      if (min !== null && !isNaN(min) && r.gross_cents < min) return false;
      if (max !== null && !isNaN(max) && r.gross_cents > max) return false;
      if (method !== 'ALL' && r.payment_method !== method) return false;
      if (words.length) {
        // Deutscher Kommentar: Alle Suchwoerter muessen in irgendeinem Datenfeld der Rechnung vorkommen
        const hay = [r.invoice_no, r.buyer_id, r.buyer_name, r.buyer_email, r.buyer_tax_id, r.seller_id, r.auction_id, r.auction_title,
          r.transaction_id, r.sales_invoice_no, r.payment_method, r.promo_code, r.status,
          new Date(r.issued_at).toLocaleDateString('sl-SI'), eur(r.gross_cents), eur(r.net_cents), eur(r.vat_cents)].join(' ').toLowerCase();
        if (!words.every(w => hay.includes(w))) return false;
      }
      return true;
    });
  }, [rows, search, dateFrom, dateTo, minAmount, maxAmount, method]);

  const totals = useMemo(() => filtered.reduce((a, r) => ({
    net: a.net + r.net_cents, vat: a.vat + r.vat_cents, gross: a.gross + r.gross_cents
  }), { net: 0, vat: 0, gross: 0 }), [filtered]);

  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadOne = async (no: string) => {
    setBusyId(no);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/accounting/file?invoice_no=${encodeURIComponent(no)}`, { headers });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Napaka pri prenosu PDF.');
      saveBlob(await res.blob(), `racun_${no}.pdf`);
    } catch (e: any) {
      toast.error(e.message || 'Napaka pri prenosu računa.');
    } finally {
      setBusyId(null);
    }
  };

  const downloadFiltered = async () => {
    setExporting(true);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/accounting/export-selected', {
        method: 'POST', headers, body: JSON.stringify({ invoice_nos: filtered.map(r => r.invoice_no) })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Napaka pri izvozu.');
      saveBlob(await res.blob(), `provizijski_racuni_${new Date().toISOString().slice(0, 10)}.zip`);
      toast.success(`Preneseno računov: ${filtered.length} (ZIP s PDF-ji in pregled.csv).`);
    } catch (e: any) {
      toast.error(e.message || 'Napaka pri izvozu.');
    } finally {
      setExporting(false);
    }
  };

  const reset = () => { setSearch(''); setDateFrom(''); setDateTo(''); setMinAmount(''); setMaxAmount(''); setMethod('ALL'); };
  const inp = 'bg-slate-50 border border-slate-200 text-[#0A1128] font-bold text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FEBA4F]';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-black uppercase text-[#0A1128] tracking-tight">Provizijski računi</h2>
          <p className="text-sm font-semibold text-slate-500">Vsi računi za provizijo (PROV-…) na enem mestu</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-black uppercase tracking-wider">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Osveži
          </button>
          <button onClick={downloadFiltered} disabled={exporting || filtered.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0A1128] text-white hover:bg-[#FEBA4F] hover:text-[#0A1128] rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">
            <Download size={16} /> {exporting ? 'Pripravljam ZIP...' : `Prenesi filtrirane (${filtered.length})`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
          <span className="text-[11px] font-black uppercase text-slate-500">Iskanje po vseh podatkih (št. računa, kupec, e-pošta, davčna, dražba, ID, način plačila, koda …)</span>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} className={`${inp} w-full pl-9`} placeholder="npr. PROV-2026-000012 ali ime kupca" />
          </div>
        </label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-black uppercase text-slate-500">Datum od</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inp} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-black uppercase text-slate-500">Datum do</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inp} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-black uppercase text-slate-500">Znesek (bruto) od – do €</span>
          <div className="flex gap-2">
            <input value={minAmount} onChange={e => setMinAmount(e.target.value)} inputMode="decimal" className={`${inp} w-full`} placeholder="min" />
            <input value={maxAmount} onChange={e => setMaxAmount(e.target.value)} inputMode="decimal" className={`${inp} w-full`} placeholder="max" />
          </div></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-black uppercase text-slate-500">Način plačila</span>
          <select value={method} onChange={e => setMethod(e.target.value)} className={inp}>
            <option value="ALL">Vsi</option>
            {methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select></label>
        <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between flex-wrap gap-2 text-sm font-bold text-[#0A1128]">
          <span>Prikazano: {filtered.length} / {rows.length} · Neto {eur(totals.net)} € · DDV {eur(totals.vat)} € · Bruto {eur(totals.gross)} €</span>
          <button onClick={reset} className="text-xs font-black uppercase text-slate-500 hover:text-[#0A1128] underline">Počisti filtre</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase font-black text-slate-500">
            <tr>
              <th className="px-4 py-3">Št. računa</th><th className="px-4 py-3">Datum</th><th className="px-4 py-3">Kupec</th>
              <th className="px-4 py-3">Dražba</th><th className="px-4 py-3">Plačilo</th>
              <th className="px-4 py-3 text-right">Neto</th><th className="px-4 py-3 text-right">DDV</th><th className="px-4 py-3 text-right">Bruto</th>
              <th className="px-4 py-3 text-right">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-[#0A1128]">
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Nalaganje...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Ni računov za izbrane filtre.</td></tr>}
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 whitespace-nowrap"><FileText size={14} className="inline mr-1.5 text-[#FEBA4F]" />{r.invoice_no}</td>
                <td className="px-4 py-3 whitespace-nowrap">{new Date(r.issued_at).toLocaleDateString('sl-SI')}</td>
                <td className="px-4 py-3"><div>{r.buyer_name || r.buyer_id}</div><div className="text-xs text-slate-400">{r.buyer_email}</div></td>
                <td className="px-4 py-3 max-w-[220px] truncate" title={r.auction_title}>{r.auction_title || r.auction_id}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.payment_method || '—'}{r.promo_code ? ` · ${r.promo_code}` : ''}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{eur(r.net_cents)} €</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{eur(r.vat_cents)} €</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{eur(r.gross_cents)} €</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => downloadOne(r.invoice_no)} disabled={busyId === r.invoice_no}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-[#FEBA4F] disabled:opacity-50" title="Prenesi PDF">
                    <Download size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
