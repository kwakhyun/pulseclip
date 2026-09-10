import { TriangleAlert, Trash2 } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';

export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'danger', onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel: string; tone?: 'danger' | 'warning'; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useDialogFocus(open, onCancel);
  if (!open) return null;
  const Icon = tone === 'warning' ? TriangleAlert : Trash2;
  return <div className="modal-backdrop confirm-backdrop"><section ref={dialogRef} tabIndex={-1} className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-label={title}><span className={`confirm-icon ${tone}`}><Icon size={23} /></span><h2>{title}</h2><p>{description}</p><div><button type="button" className="button ghost" data-autofocus="true" onClick={onCancel}>취소</button><button type="button" className={`button ${tone === 'danger' ? 'destructive-button' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button></div></section></div>;
}
