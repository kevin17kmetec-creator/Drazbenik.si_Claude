import React, { useState, useEffect } from 'react';
import { MessageSquare, Key, CheckCircle2, Star, FileText, Clock, Truck } from '../icons';
import { toast } from '@/src/lib/toast';
import { QRCodeSVG } from 'qrcode.react';
import { LoadingButton } from '../ui/Common';

export interface WinnerActionsProps {
  wonItem: any;
  user: any;
  isPaid: boolean;
  setReceiptConfirmModal: (data: any) => void;
  openReviewModal: (item: any) => void;
  canLeaveReview: (item: any) => boolean;
  onOpenMessages?: (auctionId: string) => void;
  onOpenInvoice?: (auction: any) => void;
  // Optionale Props fuer Karten- oder Detail-Layout (DEL D)
  layout?: 'card' | 'detail';
  onOpenDetail?: (item: any) => void;
  onOpenTimeline?: (auctionId: string) => void;
  onOpenDeliveryChooser?: (auctionId: string) => void;
  onRefreshWonItems?: () => void;
  className?: string;
}

export const WinnerActions: React.FC<WinnerActionsProps> = ({
  wonItem,
  user,
  isPaid,
  setReceiptConfirmModal,
  openReviewModal,
  canLeaveReview,
  onOpenMessages,
  onOpenInvoice,
  layout = 'detail',
  onOpenDetail,
  onOpenTimeline,
  onOpenDeliveryChooser,
  onRefreshWonItems,
  className = ""
}) => {
  const [pickupData, setPickupData] = useState<{ pin: string; qrUrl: string } | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  // Deutscher Kommentar: Prueft auf Abholung unter Beruecksichtigung von delivery_method und selected_delivery
  const isPickup = Boolean(wonItem?.delivery_method === "pickup" || wonItem?.selected_delivery === "pickup");
  const isFinished = Boolean(
    wonItem?.buyer_received ||
    wonItem?.post_auction_status === 'delivered' ||
    wonItem?.post_auction_status === 'completed' ||
    wonItem?.receipt_confirmed_at ||
    wonItem?.received_at
  );
  // Deutscher Kommentar: Versandstatus fuer den Kaeufer (nur bezahlte Paketsendungen): Wartet auf Versand / Versendet
  const showShipChip = Boolean(isPaid && !isPickup && !isFinished && (wonItem?.delivery_method || wonItem?.selected_delivery));
  const isShipped = Boolean(wonItem?.shipped_at);
  const shipChip = showShipChip ? (
    isShipped ? (
      <div className="w-full flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 rounded-xl py-2 px-3">
        <Truck size={13} /> Poslano{wonItem?.carrier_name ? ` (${wonItem.carrier_name})` : ''} {new Date(wonItem.shipped_at).toLocaleDateString('sl-SI')}
      </div>
    ) : (
      <div className="w-full flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-xl py-2 px-3">
        <Clock size={13} /> Čaka na odpremo
      </div>
    )
  ) : null;
  const isDeliveryUnset = Boolean(!wonItem?.delivery_method && !wonItem?.selected_delivery && !isFinished);

  // Deutscher Kommentar: Regelmaessiges Abrufen der Auktionsdaten alle 20 Sekunden, solange das PIN-Panel geoeffnet ist und der Artikel noch nicht empfangen wurde
  useEffect(() => {
    if (!pickupData || wonItem?.buyer_received) return;
    const interval = setInterval(() => {
      onRefreshWonItems?.();
    }, 20000);
    return () => clearInterval(interval);
  }, [pickupData, wonItem?.buyer_received, onRefreshWonItems]);

  // Deutscher Kommentar: PIN-Panel schliessen, sobald der Artikel empfangen wurde
  useEffect(() => {
    if (wonItem?.buyer_received && pickupData) {
      setPickupData(null);
    }
  }, [wonItem?.buyer_received, pickupData]);

  // Hilfsfunktion zum Abrufen oder Umschalten des Abholcodes und QR-Codes
  const togglePickupPin = async () => {
    if (pickupData) {
      setPickupData(null);
      return;
    }
    setPinLoading(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/orders/${wonItem.id}/pickup-pin`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.pin) {
        setPickupData({ pin: data.pin, qrUrl: data.qrUrl });
      } else {
        toast.error(data.error || "Napaka pri pridobivanju prevzemne kode.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Napaka pri pridobivanju prevzemne kode.");
    } finally {
      setPinLoading(false);
    }
  };

  // Karten-Layout fuer "Moje zmage" (3 Spalten wie zuvor)
  if (layout === 'card') {
    return (
      <div className={`flex flex-col w-full ${className}`}>
        <div className="flex flex-col sm:flex-row gap-3 w-full shrink-0">
          {/* Spalte 1: Auktion oeffnen, Rechnung, Zahlungsstatus */}
          <div className="flex flex-col gap-3 flex-1 min-w-[140px]">
            {onOpenDetail && (
              <button
                type="button"
                onClick={() => onOpenDetail(wonItem)}
                className="bg-slate-100 text-[#0A1128] px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#FEBA4F] transition-all shadow-sm flex items-center justify-center gap-2 h-[42px]"
              >
                Odpri dražbo
              </button>
            )}

            {onOpenInvoice && (
              <LoadingButton
                type="button"
                onClick={() => onOpenInvoice(wonItem)}
                loadingText="Nalagam..."
                className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:border-slate-400 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5 h-[42px] mt-auto"
              >
                <FileText size={14} /> Račun
              </LoadingButton>
            )}

            {onOpenTimeline && (
              <button
                type="button"
                onClick={() => onOpenTimeline(wonItem.id)}
                className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:border-[#FEBA4F] transition-all flex items-center justify-center gap-1.5 h-[42px] mt-2"
              >
                <Clock size={14} /> Status plačila
              </button>
            )}
          </div>

          {/* Spalte 2: Nachrichten und Empfangsbestaetigung */}
          <div className="flex flex-col gap-3 flex-1 min-w-[140px]">
            {isPickup ? (
              <button
                type="button"
                onClick={() => onOpenMessages?.(wonItem.id)}
                className="bg-[#FEBA4F] text-[#0A1128] px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all flex items-center justify-center gap-2 h-[42px]"
              >
                <MessageSquare size={14} /> Sporočila
              </button>
            ) : (
              <div className="h-[42px] hidden sm:block"></div>
            )}

            {isDeliveryUnset && isPaid && (
              <div className="flex flex-col items-center gap-1.5 p-2 bg-amber-50/80 border border-amber-200 rounded-xl text-center w-full my-1">
                <span className="text-[11px] font-bold text-amber-800">
                  Prodajalec še ni izbral načina predaje.
                </span>
                {onOpenDeliveryChooser && (
                  <button
                    type="button"
                    onClick={() => onOpenDeliveryChooser(wonItem.id)}
                    className="text-[10px] font-black uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] underline cursor-pointer"
                  >
                    Izberi način predaje
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col items-center justify-center gap-2 mt-auto w-full">
              {shipChip}
              {wonItem.buyer_received ? (
                <div className="text-green-500 font-bold text-[10px] uppercase flex items-center gap-1 w-full justify-center bg-green-50 py-2 rounded-xl border border-green-100 h-[42px]">
                  <CheckCircle2 size={12} /> Predmet prejet
                </div>
              ) : isDeliveryUnset ? (
                null
              ) : isPickup && isPaid ? (
                <div className="flex flex-col items-center w-full gap-1">
                  <button
                    type="button"
                    onClick={togglePickupPin}
                    disabled={pinLoading}
                    className="bg-amber-100 text-[#0A1128] border-2 border-[#FEBA4F] px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#FEBA4F] transition-all w-full h-[42px] flex items-center justify-center gap-1.5"
                  >
                    <Key size={14} className="text-[#0A1128]" />
                    {pinLoading ? "Nalaganje..." : pickupData ? "Skrij kodo" : "Pokaži prevzemno kodo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptConfirmModal({
                        isOpen: true,
                        auctionId: wonItem.id,
                        sellerId: wonItem.sellerId || wonItem.seller_id,
                        isPickup: true,
                      });
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer text-center mt-1 bg-transparent border-0 p-0"
                  >
                    Koda ne deluje? Potrdi prevzem brez kode
                  </button>
                </div>
              ) : isPaid ? (
                <button
                  type="button"
                  onClick={() => {
                    setReceiptConfirmModal({
                      isOpen: true,
                      auctionId: wonItem.id,
                      sellerId: wonItem.sellerId || wonItem.seller_id,
                      isPickup: false,
                    });
                  }}
                  className="bg-white border-2 border-slate-200 text-[#0A1128] px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:border-[#FEBA4F] transition-all w-full h-[42px] flex items-center justify-center"
                >
                  Potrdi prejem
                </button>
              ) : null}
            </div>
          </div>

          {/* Spalte 3: Bewertung des Verkaeufers */}
          <div className="flex flex-col gap-3 flex-1 min-w-[140px]">
            {(wonItem as any).review_submitted ? (
              <button
                type="button"
                onClick={() => openReviewModal(wonItem)}
                className="bg-green-50 text-green-700 border-2 border-green-200 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-green-100 transition-all flex items-center justify-center gap-1.5 h-[42px] shadow-sm"
                title="Vaša oddana ocena za prodajalca"
              >
                <Star size={14} className="text-[#FEBA4F] fill-[#FEBA4F]" />
                <span>Ocenjeno ({(wonItem as any).review_rating || 5}/5)</span>
              </button>
            ) : canLeaveReview(wonItem) ? (
              <button
                type="button"
                onClick={() => openReviewModal(wonItem)}
                className="bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] border-2 border-[#FEBA4F]/40 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all shadow-md flex items-center justify-center gap-1.5 h-[42px]"
                title="Oddajte oceno za prodajalca"
              >
                <Star size={14} className="fill-current" />
                <span>Oceni prodajalca</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="bg-slate-100 text-slate-400 border border-slate-200 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-1.5 h-[42px] cursor-not-allowed opacity-60"
                title="Oceno lahko oddate po potrditvi prejema."
              >
                <Star size={14} className="text-slate-400" />
                <span>Oceni prodajalca</span>
              </button>
            )}
          </div>
        </div>

        {/* Abholcode-Feld fuer den Kaeufer */}
        {pickupData && !wonItem.buyer_received && (
          <div className="w-full bg-amber-50 border-2 border-[#FEBA4F] rounded-2xl p-4 mt-3 flex flex-col items-center text-center gap-3">
            <span className="text-xs font-black uppercase text-slate-500 tracking-wider">Prevzemna koda in QR koda za prodajalca</span>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full">
              <div className="font-mono text-3xl font-black tracking-[0.3em] text-[#0A1128] py-1 select-all">
                {pickupData.pin}
              </div>
              {pickupData.qrUrl && (
                <div className="bg-white p-3 rounded-2xl shadow-sm border border-amber-200">
                  <QRCodeSVG value={pickupData.qrUrl} size={110} level="M" includeMargin={false} />
                </div>
              )}
            </div>
            <p className="text-xs text-slate-600 font-bold max-w-md">
              Prodajalec lahko kodo skenira s kamero telefona ali vnese 6-mestno kodo. Kodo pokažite prodajalcu šele po pregledu predmeta. Z razkritjem kode potrjujete, da je predmet skladen z opisom, in prodajalec prejme izplačilo.
            </p>
            <button
              type="button"
              onClick={() => setPickupData(null)}
              className="text-xs font-bold text-slate-500 underline hover:text-[#0A1128] mt-1"
            >
              Skrij kodo
            </button>
          </div>
        )}
      </div>
    );
  }

  // Detail-Layout fuer die Auktionsseite (AuctionView.tsx)
  return (
    <div className={`w-full flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
        {/* Rechnungs-Button */}
        {onOpenInvoice && (
          <LoadingButton
            type="button"
            onClick={() => onOpenInvoice(wonItem)}
            loadingText="Nalagam..."
            className="bg-slate-100 text-[#0A1128] border-2 border-slate-200 px-3.5 py-2 rounded-xl font-black uppercase tracking-wider text-[11px] hover:border-slate-400 hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5 h-[40px]"
          >
            <FileText size={14} /> Račun
          </LoadingButton>
        )}

        {/* Nachrichten-Button (bei persoenlicher Uebergabe) */}
        {isPickup && onOpenMessages && (
          <button
            type="button"
            onClick={() => onOpenMessages(wonItem.id)}
            className="bg-[#FEBA4F] text-[#0A1128] px-3.5 py-2 rounded-xl font-black uppercase tracking-wider text-[11px] hover:bg-[#0A1128] hover:text-[#FEBA4F] transition-all flex items-center justify-center gap-1.5 h-[40px]"
          >
            <MessageSquare size={14} /> Sporočila
          </button>
        )}

        {isDeliveryUnset && isPaid && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
            <span>Prodajalec še ni izbral načina predaje.</span>
            {onOpenDeliveryChooser && (
              <button
                type="button"
                onClick={() => onOpenDeliveryChooser(wonItem.id)}
                className="font-black underline text-[#0A1128] hover:text-[#FEBA4F] cursor-pointer uppercase text-[10px]"
              >
                Izberi način predaje
              </button>
            )}
          </div>
        )}

        {/* Empfangsstatus / Abholcode / Empfangsbestaetigung */}
        {shipChip}
              {wonItem.buyer_received ? (
          <div className="text-green-600 font-bold text-[11px] uppercase flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 border border-green-200 h-[40px]">
            <CheckCircle2 size={14} /> Predmet prejet
          </div>
        ) : isDeliveryUnset ? (
          null
        ) : isPickup && isPaid ? (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={togglePickupPin}
              disabled={pinLoading}
              className="bg-amber-100 text-[#0A1128] border-2 border-[#FEBA4F] px-3.5 py-2 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-[#FEBA4F] transition-all h-[40px] flex items-center justify-center gap-1.5"
            >
              <Key size={14} className="text-[#0A1128]" />
              {pinLoading ? "Nalaganje..." : pickupData ? "Skrij kodo" : "Pokaži prevzemno kodo"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReceiptConfirmModal({
                  isOpen: true,
                  auctionId: wonItem.id,
                  sellerId: wonItem.sellerId || wonItem.seller_id,
                  isPickup: true,
                });
              }}
              className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer text-center mt-1 bg-transparent border-0 p-0"
            >
              Koda ne deluje? Potrdi prevzem brez kode
            </button>
          </div>
        ) : isPaid ? (
          <button
            type="button"
            onClick={() => {
              setReceiptConfirmModal({
                isOpen: true,
                auctionId: wonItem.id,
                sellerId: wonItem.sellerId || wonItem.seller_id,
                isPickup: false,
              });
            }}
            className="bg-white border-2 border-slate-200 text-[#0A1128] px-3.5 py-2 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:border-[#FEBA4F] transition-all h-[40px] flex items-center justify-center"
          >
            Potrdi prejem
          </button>
        ) : null}

        {/* Bewertung des Verkaeufers */}
        {(wonItem as any).review_submitted ? (
          <button
            type="button"
            onClick={() => openReviewModal(wonItem)}
            className="bg-green-50 text-green-700 border-2 border-green-200 px-3.5 py-2 rounded-xl font-black uppercase tracking-wider text-[11px] hover:bg-green-100 transition-all flex items-center justify-center gap-1.5 h-[40px] shadow-sm"
            title="Vaša oddana ocena za prodajalca"
          >
            <Star size={14} className="text-[#FEBA4F] fill-[#FEBA4F]" />
            <span>Ocenjeno ({(wonItem as any).review_rating || 5}/5)</span>
          </button>
        ) : canLeaveReview(wonItem) ? (
          <button
            type="button"
            onClick={() => openReviewModal(wonItem)}
            className="bg-[#0A1128] text-[#FEBA4F] hover:bg-[#FEBA4F] hover:text-[#0A1128] border-2 border-[#FEBA4F]/40 px-3.5 py-2 rounded-xl font-black uppercase tracking-wider text-[11px] transition-all shadow-md flex items-center justify-center gap-1.5 h-[40px]"
            title="Oddajte oceno za prodajalca"
          >
            <Star size={14} className="fill-current" />
            <span>Oceni prodajalca</span>
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="bg-slate-100 text-slate-400 border border-slate-200 px-3.5 py-2 rounded-xl font-black uppercase tracking-wider text-[11px] flex items-center justify-center gap-1.5 h-[40px] cursor-not-allowed opacity-60"
            title="Oceno lahko oddate po potrditvi prejema."
          >
            <Star size={14} className="text-slate-400" />
            <span>Oceni prodajalca</span>
          </button>
        )}
      </div>

      {/* Abholcode-Feld fuer den Kaeufer */}
      {pickupData && !wonItem.buyer_received && (
        <div className="w-full bg-amber-50 border-2 border-[#FEBA4F] rounded-2xl p-4 mt-2 flex flex-col items-center text-center gap-3">
          <span className="text-xs font-black uppercase text-slate-500 tracking-wider">Prevzemna koda in QR koda za prodajalca</span>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full">
            <div className="font-mono text-3xl font-black tracking-[0.3em] text-[#0A1128] py-1 select-all">
              {pickupData.pin}
            </div>
            {pickupData.qrUrl && (
              <div className="bg-white p-3 rounded-2xl shadow-sm border border-amber-200">
                <QRCodeSVG value={pickupData.qrUrl} size={110} level="M" includeMargin={false} />
              </div>
            )}
          </div>
          <p className="text-xs text-slate-600 font-bold max-w-md">
            Prodajalec lahko kodo skenira s kamero telefona ali vnese 6-mestno kodo. Kodo pokažite prodajalcu šele po pregledu predmeta. Z razkritjem kode potrjujete, da je predmet skladen z opisom, in prodajalec prejme izplačilo.
          </p>
          <button
            type="button"
            onClick={() => setPickupData(null)}
            className="text-xs font-bold text-slate-500 underline hover:text-[#0A1128] mt-1"
          >
            Skrij kodo
          </button>
        </div>
      )}
    </div>
  );
};
