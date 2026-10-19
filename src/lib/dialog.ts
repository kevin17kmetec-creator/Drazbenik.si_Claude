// Deutscher Kommentar: Promise-basierter Ersatz fuer window.confirm / window.alert im Design der Seite
export type DialogTone = 'default' | 'danger';

export interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}

export interface DialogRequest extends DialogOptions {
  id: number;
  kind: 'confirm' | 'alert';
  message: string;
  resolve: (value: boolean) => void;
}

type HostPush = (req: DialogRequest) => void;

let hostPush: HostPush | null = null;
let nextId = 1;

// Deutscher Kommentar: Der DialogHost registriert sich hier; ohne Host wird auf den Browserdialog zurueckgefallen
export function registerDialogHost(push: HostPush | null) {
  hostPush = push;
}

export function confirmDialog(message: string, options: DialogOptions = {}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!hostPush) {
      resolve(typeof window !== 'undefined' ? window.confirm(message) : false);
      return;
    }
    hostPush({ ...options, id: nextId++, kind: 'confirm', message, resolve });
  });
}

export function alertDialog(message: string, options: DialogOptions = {}): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!hostPush) {
      if (typeof window !== 'undefined') window.alert(message);
      resolve();
      return;
    }
    hostPush({ ...options, id: nextId++, kind: 'alert', message, resolve: () => resolve() });
  });
}
