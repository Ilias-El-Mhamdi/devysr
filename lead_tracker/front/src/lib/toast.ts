export type ToastVariant = 'success' | 'error';

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  message: string;
}

type Listener = (toasts: ToastMessage[]) => void;

let toasts: ToastMessage[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(toasts);
}

function dismiss(id: string): void {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

function push(variant: ToastVariant, message: string): void {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, variant, message }];
  emit();
  setTimeout(() => dismiss(id), 5000);
}

export const toast = {
  success: (message: string): void => push('success', message),
  error: (message: string): void => push('error', message),
};

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export function getToastsSnapshot(): ToastMessage[] {
  return toasts;
}
