import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

export interface ToastMessage {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

export function ToastHost({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? TriangleAlert : Info;
        return <div className={`toast toast-${toast.tone}`} key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'} aria-atomic="true"><span><Icon size={19} /></span><div><strong>{toast.title}</strong>{toast.description && <p>{toast.description}</p>}</div><button type="button" aria-label="알림 닫기" onClick={() => onDismiss(toast.id)}><X size={15} /></button></div>;
      })}
    </div>
  );
}
