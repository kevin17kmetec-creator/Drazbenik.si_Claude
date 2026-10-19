import { normalizeImageFile } from '../../lib/imageConvert';
import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Truck, UserCheck, CreditCard, AlertCircle } from '../icons';
import { getAuthHeaders } from '../../lib/authFetch';
import { Portal } from '../ui/Portal';
import { toast } from 'sonner';
import { compressImage as imageCompression } from '../../lib/imageCompress';
import { Camera, ImagePlus, X as XIcon } from '../icons';
import { CameraCapture, isCameraSupported } from '../ui/CameraCapture';

interface PaymentStatus {
  status: string;
  payout_status: string;
  delivery_method: string;
  paid_at: string;
  shipping_deadline?: string;
  shipped_at?: string;
  delivered_at?: string;
  auto_release_at?: string;
  paid_out_at?: string;
  refunded_at?: string;
  role: 'buyer' | 'seller';
  shipping_type?: 'tracked' | 'untracked' | null;
  carrier_name?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  dispute_kind?: string | null;
  proof_requested_until?: string | null;
  seller_proof_at?: string | null;
  not_received_allowed_from?: string | null;
  tx_id?: string;
}

export const PaymentTimeline: React.FC<{ auctionId: string }> = ({ auctionId }) => {
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'buyer' | 'seller'>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'not_received' | 'other'>('not_received');
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Deutscher Kommentar: Fotos als Nachweis der Aufgabe (nur Verkaeufer), bereits verkleinert
  const [photos, setPhotos] = useState<Array<{ file: File; url: string }>>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const galleryRef = React.useRef<HTMLInputElement | null>(null);
  const chainRef = React.useRef<Promise<void>>(Promise.resolve());

  const addPhoto = async (file: File) => {
    try {
      const blob = await imageCompression(await normalizeImageFile(file), { maxSizeMB: 0.6, maxWidthOrHeight: 1400, useWebWorker: true, fileType: 'image/jpeg', initialQuality: 0.8 });
      const small = new File([blob], `dokaz-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPhotos(prev => (prev.length >= 3 ? prev : [...prev, { file: small, url: URL.createObjectURL(small) }]));
    } catch {
      toast.error('Slike ni bilo mogoče pripraviti.');
    }
  };
  const queuePhoto = (file: File) => { chainRef.current = chainRef.current.then(() => addPhoto(file)).catch(() => {}); };
  const toBase64 = (f: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(f);
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/orders/payment-status?auction_id=${auctionId}`, {
          headers: await getAuthHeaders()
        });
        if (!res.ok) throw new Error('Napaka pri nalaganju statusa.');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [auctionId, reloadKey]);

  if (loading) return <div className="h-24 animate-pulse bg-slate-50 rounded-3xl" />;
  if (error || !data) return null;

  const submit = async () => {
    if (!data?.tx_id) return;
    if (text.trim().length < 10 && !(modal === 'seller' && photos.length > 0)) {
      toast.error('Vnesite vsaj 10 znakov.');
      return;
    }
    setBusy(true);
    try {
      const isBuyer = modal === 'buyer';
      const res = await fetch(`/api/orders/${data.tx_id}/${isBuyer ? 'open-dispute' : 'submit-shipping-proof'}`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(isBuyer
          ? { kind, reason: text.trim() }
          : { note: text.trim(), photos: await Promise.all(photos.map(async p => ({ mime_type: 'image/jpeg', data_base64: await toBase64(p.file) }))) })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Napaka pri pošiljanju.');
      toast.success(isBuyer ? 'Prijava je oddana.' : 'Dokaz je oddan.');
      setModal(null);
      setText('');
      setPhotos([]);
      setReloadKey(k => k + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const isRefunded = (data.status === 'CANCELLED' || data.status === 'REFUNDED') && data.payout_status === 'refunded';

  if (isRefunded) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-3xl p-6 flex items-center gap-4">
        <div className="bg-red-500 text-white p-3 rounded-2xl shadow-lg">
          <AlertCircle size={24} />
        </div>
        <div>
          <p className="font-black text-[#0A1128] uppercase text-sm tracking-tight">Naročilo preklicano</p>
          <p className="text-slate-500 font-bold text-xs">Sredstva so bila vrnjena kupcu {data.refunded_at ? ` dne ${new Date(data.refunded_at).toLocaleDateString('sl-SI')}` : ''}.</p>
        </div>
      </div>
    );
  }

  const steps = [
    {
      id: 1,
      title: 'Plačilo prejeto',
      date: data.paid_at ? new Date(data.paid_at).toLocaleDateString('sl-SI') : null,
      isDone: !!data.paid_at,
      icon: <CheckCircle2 size={20} />
    },
    {
      id: 2,
      title: data.delivery_method === 'pickup' ? 'Predmet predan' : 'Predmet poslan',
      date: data.shipped_at 
        ? new Date(data.shipped_at).toLocaleDateString('sl-SI') 
        : (data.status === 'HELD_IN_ESCROW' && data.shipping_deadline ? `Rok: ${new Date(data.shipping_deadline).toLocaleDateString('sl-SI')}` : null),
      isDone: !!data.shipped_at || data.status === 'DELIVERED' || data.status === 'COMPLETED',
      icon: data.delivery_method === 'pickup' ? <UserCheck size={20} /> : <Truck size={20} />
    },
    {
      id: 3,
      title: 'Prejem potrjen',
      date: data.delivered_at 
        ? new Date(data.delivered_at).toLocaleDateString('sl-SI') 
        : (data.status === 'SHIPPED' && data.auto_release_at ? `Samodejno: ${new Date(data.auto_release_at).toLocaleDateString('sl-SI')}` : null),
      isDone: !!data.delivered_at || data.status === 'COMPLETED',
      icon: <CheckCircle2 size={20} />
    },
    {
      id: 4,
      title: 'Izplačilo prodajalcu',
      // Deutscher Kommentar: Status je vom payout_status abhaengig, nicht nur vom Transaktionsstatus
      date: data.paid_out_at 
        ? new Date(data.paid_out_at).toLocaleDateString('sl-SI') 
        : data.payout_status === 'payout_pending'
          ? 'Izplačilo v teku'
          : data.payout_status === 'releasable'
            ? (data.role === 'seller' ? 'Na voljo za izplačilo' : 'Sproščeno prodajalcu')
            : data.payout_status === 'frozen'
              ? 'Zadržano (spor)'
              : 'Čaka na sprostitev',
      isDone: !!data.paid_out_at,
      icon: <CreditCard size={20} />
    }
  ];

  return (
    <div className="bg-white rounded-[1.35rem] p-8 md:p-10 border border-slate-100 shadow-xl overflow-hidden relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
        {steps.map((step, idx) => {
          const isCurrent = !step.isDone && (idx === 0 || steps[idx - 1].isDone);
          const color = step.isDone ? 'text-emerald-500' : isCurrent ? 'text-[#FEBA4F]' : 'text-slate-300';
          const bgColor = step.isDone ? 'bg-emerald-500' : isCurrent ? 'bg-[#FEBA4F]' : 'bg-slate-100';

          return (
            <React.Fragment key={step.id}>
              <div className="flex items-center md:flex-col gap-4 md:gap-3 flex-1">
                <div className={`${bgColor} text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all transform ${isCurrent ? 'scale-110' : ''}`}>
                  {step.icon}
                </div>
                <div className="flex flex-col md:items-center">
                  <p className={`text-[10px] md:text-[11px] font-black uppercase tracking-widest ${color}`}>{step.title}</p>
                  {step.date && <p className="text-[10px] font-bold text-slate-400 mt-0.5">{step.date}</p>}
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div className="hidden md:block flex-1 h-0.5 bg-slate-100 self-center -mt-8 relative overflow-hidden">
                  {step.isDone && <div className="absolute inset-0 bg-emerald-500/20" />}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {data.delivery_method !== 'pickup' && data.shipped_at && (
        <div className="mt-8 pt-6 border-t border-slate-100 space-y-3 relative z-10">
          <p className="text-[11px] font-bold text-slate-500">
            {data.shipping_type === 'untracked'
              ? 'Pošiljka brez sledenja'
              : <>Pošiljka s sledenjem{data.carrier_name ? ` (${data.carrier_name})` : ''}: <span className="font-black text-[#0A1128]">{data.tracking_number}</span></>}
          </p>
          {data.tracking_url && (
            <a href={data.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-block text-[11px] font-black uppercase tracking-widest text-[#0A1128] underline">
              Preveri sledenje
            </a>
          )}

          {data.role === 'buyer' && data.status === 'SHIPPED' && (
            data.not_received_allowed_from && new Date(data.not_received_allowed_from) > new Date() ? (
              <p className="text-[11px] font-bold text-slate-400">
                Če pošiljka ne prispe, lahko težavo prijavite od {new Date(data.not_received_allowed_from).toLocaleDateString('sl-SI')}.
              </p>
            ) : (
              <button onClick={() => { setKind('not_received'); setText(''); setModal('buyer'); }} className="block text-[11px] font-black uppercase tracking-widest text-red-600 underline">
                Pošiljka ni prispela / težava
              </button>
            )
          )}

          {data.role === 'seller' && data.status === 'DISPUTED' && data.dispute_kind === 'not_received' && data.proof_requested_until && !data.seller_proof_at && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold text-red-800">
                Kupec sporoča, da pošiljka ni prispela. Dokaz o oddaji predložite do {new Date(data.proof_requested_until).toLocaleString('sl-SI')}
                {data.shipping_type === 'untracked' ? ', sicer bo kupcu vrnjen znesek.' : ', sicer bo kupcu vrnjen znesek in prejmete opomin.'}
              </p>
              <button onClick={() => { setText(''); setPhotos([]); setModal('seller'); }} className="text-[11px] font-black uppercase tracking-widest text-red-700 underline">
                Oddaj dokaz o oddaji
              </button>
            </div>
          )}
          {data.role === 'seller' && data.status === 'DISPUTED' && data.seller_proof_at && (
            <p className="text-[11px] font-bold text-emerald-600">Dokaz je oddan, spor je v obravnavi.</p>
          )}
        </div>
      )}

      {modal && (
        <Portal>
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50" onClick={() => !busy && setModal(null)}>
            <div className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-black text-[#0A1128] uppercase text-sm tracking-tight">
                {modal === 'buyer' ? 'Prijava težave s pošiljko' : 'Dokaz o oddaji pošiljke'}
              </h3>
              {modal === 'buyer' && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setKind('not_received')} className={`py-2 rounded-xl text-[11px] font-black uppercase border-2 ${kind === 'not_received' ? 'bg-[#0A1128] text-white border-[#0A1128]' : 'border-slate-200 text-slate-500'}`}>Ni prispela</button>
                  <button type="button" onClick={() => setKind('other')} className={`py-2 rounded-xl text-[11px] font-black uppercase border-2 ${kind === 'other' ? 'bg-[#0A1128] text-white border-[#0A1128]' : 'border-slate-200 text-slate-500'}`}>Druga težava</button>
                </div>
              )}
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={5}
                maxLength={modal === 'buyer' ? 1000 : 2000}
                placeholder={modal === 'buyer' ? 'Opišite težavo (vsaj 10 znakov).' : 'Datum oddaje, pošta, številka potrdila ... (vsaj 10 znakov)'}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-base font-bold outline-none focus:ring-2 focus:ring-[#FEBA4F]"
              />
              {modal === 'seller' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fotografija potrdila ali pošiljke (neobvezno, do 3)</p>
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p, i) => (
                      <div key={p.url} className="relative">
                        <img src={p.url} alt={`Dokaz ${i + 1}`} className="h-16 w-16 object-cover rounded-xl border border-slate-200" />
                        <button type="button" onClick={() => setPhotos(prev => prev.filter((_, k) => k !== i))} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5" aria-label="Odstrani"><XIcon size={14} /></button>
                      </div>
                    ))}
                  </div>
                  {photos.length < 3 && (
                    <div className="flex gap-2">
                      {isCameraSupported() && (
                        <button type="button" onClick={() => setCameraOpen(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0A1128] text-white text-[11px] font-black uppercase tracking-wider"><Camera size={14} /> Fotografiraj</button>
                      )}
                      <button type="button" onClick={() => galleryRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-slate-200 text-[#0A1128] text-[11px] font-black uppercase tracking-wider"><ImagePlus size={14} /> Iz galerije</button>
                      <input ref={galleryRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden" onChange={e => { Array.from(e.target.files || []).slice(0, 3 - photos.length).forEach(queuePhoto); e.target.value = ''; }} />
                    </div>
                  )}
                  <CameraCapture isOpen={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={queuePhoto} remaining={3 - photos.length} onPickFromGallery={() => galleryRef.current?.click()} />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setModal(null)} disabled={busy} className="flex-1 py-3 rounded-2xl border border-slate-200 text-xs font-black uppercase">Prekliči</button>
                <button onClick={submit} disabled={busy} className="flex-1 py-3 rounded-2xl bg-[#0A1128] text-white text-xs font-black uppercase disabled:opacity-50">{busy ? 'Pošiljam...' : 'Pošlji'}</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};
