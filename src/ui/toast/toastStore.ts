import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type ToastInput = {
  message: string;
  title?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

export type Toast = {
  id: string;
  message: string;
  title?: string;
  variant: ToastVariant;
  durationMs: number;
  createdAt: number;
};

const DEFAULT_DURATION_MS = 3000;
const MAX_TOASTS = 4;

function safeId(): string {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type ToastState = {
  toasts: Toast[];
  addToast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

export const toastStore = createStore<ToastState>((set) => ({
  toasts: [],

  addToast: (input) => {
    const id = safeId();
    const toast: Toast = {
      id,
      message: input.message,
      title: input.title,
      variant: input.variant ?? 'info',
      durationMs: Math.max(800, input.durationMs ?? DEFAULT_DURATION_MS),
      createdAt: Date.now(),
    };

    set((s) => ({
      toasts: [toast, ...s.toasts].slice(0, MAX_TOASTS),
    }));

    return id;
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clearToasts: () => set({ toasts: [] }),
}));

export function useToastStore<T>(selector: (s: ToastState) => T): T {
  return useStore(toastStore, selector);
}

export const toast = {
  show: (input: ToastInput) => toastStore.getState().addToast(input),
  success: (message: string, opts?: Omit<ToastInput, 'message' | 'variant'>) =>
    toastStore.getState().addToast({ message, variant: 'success', ...opts }),
  error: (message: string, opts?: Omit<ToastInput, 'message' | 'variant'>) =>
    toastStore.getState().addToast({ message, variant: 'error', durationMs: 4500, ...opts }),
  info: (message: string, opts?: Omit<ToastInput, 'message' | 'variant'>) =>
    toastStore.getState().addToast({ message, variant: 'info', ...opts }),
  warning: (message: string, opts?: Omit<ToastInput, 'message' | 'variant'>) =>
    toastStore.getState().addToast({ message, variant: 'warning', durationMs: 4500, ...opts }),
  dismiss: (id: string) => toastStore.getState().dismissToast(id),
  clear: () => toastStore.getState().clearToasts(),
};
