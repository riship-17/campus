import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import clsx from 'clsx';

const ToastContext = createContext(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}

const TONES = {
  success: 'border-forest text-forest',
  error: 'border-brick text-brick',
  info: 'border-line-strong text-ink',
};

/**
 * Confirmations that do not need to interrupt. Announced politely, dismissible, and gone
 * after six seconds — long enough to read a sentence about a waitlist position.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message, tone = 'info') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 rounded-md border-l-2 border-y border-r bg-surface px-3 py-2.5 text-[14px]',
              TONES[toast.tone]
            )}
          >
            <span className="flex-1 text-ink">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="rounded-xs text-muted transition-ui hover:text-ink"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
