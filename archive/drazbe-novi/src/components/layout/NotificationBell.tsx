import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { translateText, normalizeLang } from '../../lib/translateUi';

export interface NotificationItem {
  id: string;
  user_id: string;
  type: 'outbid' | 'ending_soon' | 'won' | 'lost' | 'review_received' | 'seller_decision' | 'second_chance_offer' | 'second_chance_failed' | 'second_chance_accepted' | 'shipping_dispute' | 'shipping_required' | 'shipping_reminder' | 'item_shipped';
  message?: string;
  target?: string;
  auction_id: string;
  auction_title: string;
  image_url?: string;
  price: number;
  read: boolean;
  created_at: string;
}

// Baut den slovenischen Nachrichtentext basierend auf dem Typ auf
export function getNotificationText(type: string, price: number): string {
  const p = (price || 0).toFixed(2).replace('.', ',');
  switch (type) {
    case 'outbid':
      return `Vaša ponudba je bila presežena. Nova cena: €${p}.`;
    case 'ending_soon':
      return `Dražba se zaključi čez manj kot 30 minut. Trenutna cena: €${p}.`;
    case 'won':
      return `Čestitamo, zmagali ste! Končna cena: €${p}. Plačajte v 48 urah.`;
    case 'lost':
      return `Dražba je zaključena in je niste zmagali. Končna cena: €${p}.`;
    default:
      return `Sprememba pri dražbi. Cena: €${p}.`;
  }
}

// Formatiert die relative Zeit auf Slowenisch
function getRelativeTime(isoString: string, language: string = 'SLO'): string {
  const L = normalizeLang(language);
  if (!isoString) return '';
  const now = Date.now();
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return '';
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return L === 'EN' ? 'just now' : L === 'DE' ? 'gerade eben' : 'pravkar';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return L === 'EN' ? `${diffMin} min ago` : L === 'DE' ? `vor ${diffMin} Min.` : `pred ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return L === 'EN' ? `${diffHours} h ago` : L === 'DE' ? `vor ${diffHours} Std.` : `pred ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return L === 'EN' ? `${diffDays} d ago` : L === 'DE' ? `vor ${diffDays} T.` : `pred ${diffDays} d`;
}

interface NotificationBellProps {
  notifications: NotificationItem[];
  onMarkRead: (id?: string, all?: boolean) => void;
  onSelectNotification: (notification: NotificationItem) => void;
  language?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  onMarkRead,
  onSelectNotification,
  language = 'SLO',
}) => {
  const L = normalizeLang(language);
  const tr = (text: string) => translateText(text, L);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Klick ausserhalb und Escape-Taste abfangen
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) {
      onMarkRead(item.id);
    }
    setIsOpen(false);
    onSelectNotification(item);
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkRead(undefined, true);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Glocken-Schaltfläche */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative bg-white/5 p-3 rounded-xl border border-white/10 transition-all text-white flex items-center justify-center ${
          isOpen ? 'bg-[#FEBA4F] text-[#0A1128] border-transparent' : 'hover:bg-white/10 hover:text-[#FEBA4F]'
        }`}
        title={tr('Obvestila')}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-2.5 -right-2.5 bg-red-600 text-white text-[11px] font-extrabold w-6 h-6 flex items-center justify-center rounded-full border-2 border-[#0A1128] animate-pulse shadow-lg select-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown-Menü für Benachrichtigungen */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-3 w-80 sm:w-96 bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden z-[1000] animate-in fade-in duration-150 text-[#0A1128]">
          {/* Kopfzeile */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="font-black text-xs uppercase tracking-wider text-[#0A1128]">
                {tr('Obvestila')}
              </span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {L === 'EN' ? `${unreadCount} unread` : L === 'DE' ? `${unreadCount} ungelesen` : `${unreadCount} neprebranih`}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-bold text-slate-500 hover:text-[#0A1128] flex items-center gap-1 transition-colors"
              >
                <CheckCheck size={13} />
                <span>{tr('Označi vse kot prebrano')}</span>
              </button>
            )}
          </div>

          {/* Liste der Benachrichtigungen */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Bell size={24} className="mx-auto mb-2 text-slate-300 opacity-60" />
                <p className="text-xs font-bold">{tr('Nimate obvestil.')}</p>
              </div>
            ) : (
              notifications.map((item) => {
                const isLost = item.type === 'lost';

                if (isLost) {
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        // Verlorene Auktionen sind rein informativ und nicht anklickbar (DEL E)
                        if (!item.read) {
                          onMarkRead(item.id);
                        }
                      }}
                      className={`w-full text-left p-3.5 flex items-start gap-3 cursor-default select-text ${
                        !item.read ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Bild des Auktionsgegenstands */}
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.auction_title || tr('Dražba')}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-slate-100 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-400">
                          <Bell size={18} />
                        </div>
                      )}

                      {/* Text und Zeit */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <h4 className="font-bold text-xs text-[#0A1128] truncate">
                            {item.auction_title || tr('Dražba')}
                          </h4>
                          <span className="text-[10px] text-slate-400 flex-shrink-0 font-medium">
                            {getRelativeTime(item.created_at, L)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-medium line-clamp-2 leading-snug">
                          {tr(item.message || getNotificationText(item.type, item.price))}
                        </p>
                      </div>

                      {/* Ungelesen-Punkt */}
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1.5 shadow-sm" />
                      )}
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`w-full text-left p-3.5 hover:bg-slate-50 cursor-pointer transition-colors flex items-start gap-3 ${
                      !item.read ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    {/* Bild des Auktionsgegenstands */}
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.auction_title || tr('Dražba')}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-slate-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-400">
                        <Bell size={18} />
                      </div>
                    )}

                    {/* Text und Zeit */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4 className="font-bold text-xs text-[#0A1128] truncate">
                          {item.auction_title || tr('Dražba')}
                        </h4>
                        <span className="text-[10px] text-slate-400 flex-shrink-0 font-medium">
                          {getRelativeTime(item.created_at, L)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium line-clamp-2 leading-snug">
                        {tr(item.message || getNotificationText(item.type, item.price))}
                      </p>
                    </div>

                    {/* Ungelesen-Punkt */}
                    {!item.read && (
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1.5 shadow-sm" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
