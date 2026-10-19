import { toast } from 'sonner';
import { getAuthHeaders } from './authFetch';

// Deutscher Kommentar: Beobachtet ein offenes Ueberweisungs-Popup und schliesst es automatisch, sobald der Zahlungseingang bestaetigt ist
const PAID_STATUSES = ['HELD_IN_ESCROW', 'SHIPPED', 'DELIVERED', 'COMPLETED'];

export const watchBankTransferPopup = (
  popup: Window | null,
  auctionId: string,
  onPaid?: () => void
) => {
  const startedAt = Date.now();
  const maxMs = 30 * 60 * 1000;
  let stopped = false;

  const timer = setInterval(async () => {
    if (stopped) return;
    if (Date.now() - startedAt > maxMs) {
      stopped = true;
      clearInterval(timer);
      return;
    }
    try {
      const res = await fetch(`/api/orders/payment-status?auction_id=${encodeURIComponent(auctionId)}`, {
        headers: await getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && PAID_STATUSES.includes(String(data.status || '').toUpperCase())) {
        stopped = true;
        clearInterval(timer);
        if (popup && !popup.closed) {
          try { popup.close(); } catch (e) {}
        }
        toast.success('Nakazilo je prejeto. Čakamo na predajo oz. prejem predmeta.');
        onPaid?.();
      }
    } catch (e) {
      // Deutscher Kommentar: Netzwerkfehler beim Polling werden ignoriert
    }
  }, 4000);
};
