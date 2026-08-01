import { useSyncExternalStore } from 'react';
import { getToastsSnapshot, subscribeToasts } from '../lib/toast';

export function ToastViewport() {
  const toasts = useSyncExternalStore(subscribeToasts, getToastsSnapshot);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`glass-panel rounded-lg border px-4 py-3 text-sm shadow-lg ${
            item.variant === 'success' ? 'border-neon-green/40 text-neon-green' : 'border-neon-red/40 text-neon-red'
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
