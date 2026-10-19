import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, Info } from '../icons';
import { Portal } from './Portal';
import { DialogRequest, registerDialogHost } from '../../lib/dialog';

// Deutscher Kommentar: Zeigt Bestaetigungs- und Hinweisdialoge im Look der Plattform (Warteschlange, Tastatur, Fokus)
export const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const current = queue[0] || null;

  useEffect(() => {
    registerDialogHost((req) => setQueue((q) => [...q, req]));
    return () => registerDialogHost(null);
  }, []);

  const close = useCallback((value: boolean) => {
    setQueue((q) => {
      const [head, ...rest] = q;
      head?.resolve(value);
      return rest;
    });
  }, []);

  useEffect(() => {
    if (!current) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current?.id, close]);

  if (!current) return null;

  const isConfirm = current.kind === 'confirm';
  const danger = current.tone === 'danger';
  const Icon = danger ? AlertTriangle : isConfirm ? HelpCircle : Info;
  const title = current.title || (isConfirm ? 'Potrditev' : 'Obvestilo');

  return (
    <Portal>
      <div className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={() => close(false)}></div>
        <div className="relative bg-white w-full max-w-md rounded-3xl sm:rounded-[1.35rem] p-6 sm:p-9 shadow-2xl animate-in border-2 border-[#FEBA4F] max-h-[92dvh] overflow-y-auto">
          <div className="flex items-start gap-4 mb-5">
            <div className={`p-3 rounded-2xl shrink-0 ${danger ? 'bg-red-50' : 'bg-[#FEBA4F]/10'}`}>
              <Icon className={danger ? 'text-red-500' : 'text-[#FEBA4F]'} size={26} />
            </div>
            <div className="min-w-0">
              <h3 id="app-dialog-title" className="text-lg sm:text-xl font-black text-[#0A1128] uppercase tracking-tighter leading-tight">{title}</h3>
              <p className="mt-2 text-sm font-bold text-slate-500 leading-relaxed whitespace-pre-line break-words">{current.message}</p>
            </div>
          </div>
          <div className={`grid gap-2 sm:gap-3 ${isConfirm ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {isConfirm && (
              <button
                type="button"
                onClick={() => close(false)}
                className="py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider border-2 border-slate-200 text-slate-500 hover:bg-slate-50 transition-all min-h-[48px]"
              >
                {current.cancelLabel || 'Prekliči'}
              </button>
            )}
            <button
              type="button"
              ref={confirmRef}
              onClick={() => close(true)}
              className={`py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all min-h-[48px] shadow-lg ${danger ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[#FEBA4F] text-[#0A1128] hover:brightness-95'}`}
            >
              {current.confirmLabel || (isConfirm ? 'Potrdi' : 'V redu')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};
