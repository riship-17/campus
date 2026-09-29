import { useEffect, useRef } from 'react';
import { Button } from './Button.jsx';

/**
 * A confirmation sheet. Uses the native <dialog> so focus trapping, Escape and the backdrop
 * come from the platform rather than from a hand-rolled focus manager that gets it wrong.
 */
export function Modal({ open, onClose, title, description, children, footer }) {
  const dialog = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={onClose}
      className="w-[min(92vw,30rem)] rounded-md border border-line bg-surface p-0 text-ink backdrop:bg-ink/30"
    >
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[20px]">{title}</h2>
        {description && (
          <p className="mt-1 text-[14px] leading-relaxed text-muted">{description}</p>
        )}
      </div>

      {children && <div className="px-5 py-4">{children}</div>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
        {footer ?? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </dialog>
  );
}
