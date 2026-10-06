import { useState, useEffect, useRef } from 'react';
import { getAuthHeaders } from './authFetch';

export interface FeePreviewData {
  itemPriceCents: number;
  feeCents: number;
  feePercent: number;
  vatRate: number;
  vatCents: number;
  isReverseCharge: boolean;
  totalCents: number;
  tier: 'FREE' | 'BASIC' | 'PRO';
  feeIsMinimum: boolean;
}

export function useFeePreview(params: { amount?: number; auctionId?: string; enabled?: boolean }) {
  const { amount, auctionId, enabled = true } = params;
  const [data, setData] = useState<FeePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || (!amount && !auctionId)) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }

    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const headers = await getAuthHeaders();
        const resp = await fetch('/api/fees/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify({ amount, auction_id: auctionId })
        });

        if (currentReqId !== reqIdRef.current) return;

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || 'Napaka pri pridobivanju izračuna provizije.');
        }

        const json = await resp.json();
        if (currentReqId === reqIdRef.current) {
          setData(json);
          setLoading(false);
        }
      } catch (err: any) {
        if (currentReqId === reqIdRef.current) {
          setError(err.message || 'Napaka');
          setLoading(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [amount, auctionId, enabled]);

  return { data, loading, error };
}
