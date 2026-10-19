import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NotificationItem, getNotificationText } from '../components/layout/NotificationBell';
import { toast } from '../lib/toast';

export function useNotifications(user: any, onSelectNotification?: (item: NotificationItem) => void) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const initialLoadRef = useRef(true);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Polling-Funktion zum Abrufen der Benachrichtigungen
  const fetchNotifications = useCallback(async () => {
    if (!user || typeof document === 'undefined' || document.visibilityState !== 'visible') return;

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/notifications', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const list: NotificationItem[] = data.notifications || [];

      setNotifications(list);

      if (initialLoadRef.current) {
        // Erstes Laden: Verarbeitete IDs speichern ohne Toast
        list.forEach((n) => seenIdsRef.current.add(n.id));
        initialLoadRef.current = false;
      } else {
        // Neue Benachrichtigungen identifizieren
        const newNotifications = list.filter((n) => !seenIdsRef.current.has(n.id));
        // Max 3 Toasts auf einmal anzeigen
        const toShow = newNotifications.slice(0, 3);

        toShow.forEach((n) => {
          seenIdsRef.current.add(n.id);
          const shortText = n.message || getNotificationText(n.type, n.price);

          // Toast im Plattform-Benachrichtigungsstil mit Auktionsbild und Aktionsschaltfläche
          toast(
            <div className="flex items-center gap-3 w-full bg-[#0A1128] text-white p-3 rounded-2xl shadow-xl border border-white/10">
              {n.image_url ? (
                <img
                  src={n.image_url}
                  alt={n.auction_title || 'Dražba'}
                  className="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 text-slate-300 font-bold text-xs">
                  Dražba
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-black text-xs text-[#FEBA4F] truncate">
                  {n.auction_title || 'Dražba'}
                </h4>
                <p className="text-[11px] text-slate-200 font-medium line-clamp-2 leading-snug">
                  {shortText}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onSelectNotification) onSelectNotification(n);
                }}
                className="bg-[#FEBA4F] text-[#0A1128] px-3 py-1.5 rounded-xl font-black text-xs hover:bg-white transition-colors flex-shrink-0"
              >
                Odpri
              </button>
            </div>,
            { duration: 8000 }
          );
        });

        // Alle restlichen neuen IDs ebenfalls markieren
        newNotifications.forEach((n) => seenIdsRef.current.add(n.id));
      }
    } catch (err) {
      // Fehler stumm abfangen, um das Intervall nicht zu unterbrechen
    }
  }, [user, onSelectNotification]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      initialLoadRef.current = true;
      seenIdsRef.current.clear();
      return;
    }

    fetchNotifications();

    const interval = setInterval(() => {
      fetchNotifications();
    }, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, fetchNotifications]);

  const markRead = useCallback(async (id?: string, all?: boolean) => {
    if (!user) return;

    // Lokalen Zustand sofort optimistisch aktualisieren
    if (all) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } else if (id) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    }

    try {
      const token = await user.getIdToken();
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id, all })
      });
    } catch (err) {
      // Server-Fehler beim Als-gelesen-Markieren ignorieren
    }
  }, [user]);

  return {
    notifications,
    markRead,
    refetch: fetchNotifications
  };
}
