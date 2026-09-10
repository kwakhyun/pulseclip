import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const dialogs: HTMLElement[] = [];
const backgroundInert = new Map<HTMLElement, boolean>();
function syncDialogs() {
  for (const dialog of dialogs) dialog.inert = dialog !== dialogs.at(-1);
  if (dialogs.length > 0 && backgroundInert.size === 0) {
    document.querySelectorAll<HTMLElement>('.main-content, .sidebar, .titlebar').forEach(element => {
      backgroundInert.set(element, element.inert); element.inert = true;
    });
  } else if (dialogs.length === 0) {
    backgroundInert.forEach((inert, element) => { element.inert = inert; });
    backgroundInert.clear();
  }
}

export function useDialogFocus(open: boolean, onEscape?: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const escapeHandlerRef = useRef(onEscape);
  escapeHandlerRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialogs.push(dialog);
    syncDialogs();
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const initialFocus = dialog.querySelector<HTMLElement>('[data-autofocus="true"]')
      ?? dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ?? dialog;
    const frame = requestAnimationFrame(() => initialFocus.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape' && escapeHandlerRef.current) {
        event.preventDefault();
        event.stopPropagation();
        escapeHandlerRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      const index = dialogs.indexOf(dialog);
      if (index >= 0) dialogs.splice(index, 1);
      dialog.inert = false;
      syncDialogs();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  return dialogRef;
}
