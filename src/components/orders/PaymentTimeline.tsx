import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Truck, UserCheck, CreditCard, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from '../../lib/authFetch';

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
}

export const PaymentTimeline: React.FC<{ auctionId: string }> = ({ auctionId }) => {
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [auctionId]);

  if (loading) return <div className="h-24 animate-pulse bg-slate-50 rounded-3xl" />;
  if (error || !data) return null;

  const isRefunded = data.status === 'CANCELLED' && data.payout_status === 'refunded';

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
      date: data.paid_out_at 
        ? new Date(data.paid_out_at).toLocaleDateString('sl-SI') 
        : (data.status === 'DELIVERED' || data.status === 'COMPLETED' ? 'V obdelavi' : 'Čaka na sprostitev'),
      isDone: !!data.paid_out_at,
      icon: <CreditCard size={20} />
    }
  ];

  return (
    <div className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-xl overflow-hidden relative">
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
    </div>
  );
};
