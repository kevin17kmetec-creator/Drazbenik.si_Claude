import { useEffect, useState } from 'react';
import { getAuthHeaders } from './authFetch';

// Deutscher Kommentar: Fragt den Server, ob der Nutzer Administrator ist (ADMIN_UIDS ist nur serverseitig verfuegbar)
export function useServerAdmin(uid?: string | null): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!uid) { setIsAdmin(false); return; }
    (async () => {
      try {
        const res = await fetch('/api/admin/me', { headers: await getAuthHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setIsAdmin(data?.isAdmin === true);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);
  return isAdmin;
}
