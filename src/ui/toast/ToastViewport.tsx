import { useEffect, useMemo } from 'react';
import { toastStore, useToastStore, type Toast, type ToastVariant } from './toastStore';

function variantClasses(variant: ToastVariant): {
  bar: string;
  iconBg: string;
  icon: string;
} {
  switch (variant) {
    case 'success':
      return {
        bar: 'bg-emerald-500',
        iconBg: 'bg-emerald-500/15',
        icon: 'text-emerald-600',
      };
    case 'error':
      return {
        bar: 'bg-rose-500',
        iconBg: 'bg-rose-500/15',
        icon: 'text-rose-600',
      };
    case 'warning':
      return {
        bar: 'bg-amber-500',
        iconBg: 'bg-amber-500/15',
        icon: 'text-amber-700',
      };
    default:
      return {
        bar: 'bg-sky-500',
        iconBg: 'bg-sky-500/15',
        icon: 'text-sky-600',
      };
  }
}

function VariantIcon({ variant }: { variant: ToastVariant }) {
  const cls = variantClasses(variant);

  // Minimal inline icons; keeps toast system independent of editor icon set.
  if (variant === 'success') {
    return (
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${cls.iconBg}`}>
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${cls.icon}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }

  if (variant === 'error') {
    return (
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${cls.iconBg}`}>
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${cls.icon}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </span>
    );
  }

  if (variant === 'warning') {
    return (
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${cls.iconBg}`}>
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${cls.icon}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.6 2.3 17.6a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${cls.iconBg}`}>
      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${cls.icon}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    </span>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useMemo(() => () => toastStore.getState().dismissToast(toast.id), [toast.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.durationMs]);

  const cls = variantClasses(toast.variant);

  return (
    <div
      className={
        'pointer-events-auto relative overflow-hidden rounded-xl border border-gray-200 bg-white/95 shadow-xl backdrop-blur ' +
        'min-w-[280px] max-w-[360px]'
      }
      role="status"
      aria-live="polite"
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 ${cls.bar}`} />

      <div className="flex gap-3 p-4">
        <VariantIcon variant={toast.variant} />

        <div className="min-w-0 flex-1">
          {toast.title ? <div className="truncate text-sm font-semibold text-gray-900">{toast.title}</div> : null}
          <div className="text-sm text-gray-700">
            <span className="break-words">{toast.message}</span>
          </div>
        </div>

        <button
          type="button"
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          onClick={dismiss}
          aria-label="Dismiss notification"
          title="Dismiss"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="toast-progress absolute bottom-0 left-0 h-0.5 w-full bg-gray-900/10">
        <div
          className={`h-full ${cls.bar}`}
          style={{
            animation: `toast-progress ${toast.durationMs}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

export default function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[1000] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {toasts.map((t) => (
        <div key={t.id} className="animate-toast-in">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  );
}
