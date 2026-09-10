import { useState } from 'react';
import { Check, Gamepad2, Monitor, MonitorUp, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { CaptureSource } from '../../shared/types';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface SourcePickerProps {
  open: boolean;
  sources: CaptureSource[];
  selectedId: string;
  refreshing: boolean;
  disabled: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (source: CaptureSource) => void;
}

export function SourcePickerModal({
  open,
  sources,
  selectedId,
  refreshing,
  disabled,
  onClose,
  onRefresh,
  onSelect,
}: SourcePickerProps) {
  const [filter, setFilter] = useState<'all' | 'screen' | 'window'>('all');
  const dialogRef = useDialogFocus(open, onClose);
  if (!open) return null;
  const visible = filter === 'all' ? sources : sources.filter((source) => source.kind === filter);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title">
        <header className="modal-header">
          <div><span className="eyebrow">CAPTURE SOURCE</span><h2 id="source-title">어떤 화면을 녹화할까요?</h2><p>게임이 전체 화면이면 모니터, 창 모드면 해당 창을 선택하세요.</p></div>
          <button type="button" className="modal-close" aria-label="소스 선택 닫기" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="source-toolbar">
          <div className="filter-tabs compact" role="group" aria-label="캡처 소스 종류">
            <button type="button" aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체</button>
            <button type="button" aria-pressed={filter === 'screen'} className={filter === 'screen' ? 'active' : ''} onClick={() => setFilter('screen')}>모니터</button>
            <button type="button" aria-pressed={filter === 'window'} className={filter === 'window' ? 'active' : ''} onClick={() => setFilter('window')}>창</button>
          </div>
          <button type="button" className="refresh-button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /> 새로고침</button>
        </div>
        <div className="source-grid">
          {visible.map((source) => (
            <button
              type="button"
              className={`source-card ${selectedId === source.id ? 'selected' : ''}`}
              key={source.id}
              onClick={() => onSelect(source)}
              disabled={disabled}
              data-autofocus={selectedId === source.id ? 'true' : undefined}
            >
              <div className="source-thumb">
                {source.thumbnailDataUrl ? <img src={source.thumbnailDataUrl} alt="" /> : <Monitor size={30} />}
                {selectedId === source.id && <span className="selected-check"><Check size={14} /></span>}
              </div>
              <div className="source-card-label">
                {source.appIconDataUrl ? <img src={source.appIconDataUrl} alt="" /> : source.kind === 'screen' ? <Monitor size={16} /> : <Gamepad2 size={16} />}
                <div><strong>{source.name}</strong><small>{source.kind === 'screen' ? '모니터 전체' : '애플리케이션 창'}</small></div>
              </div>
            </button>
          ))}
          {visible.length === 0 && <div className="source-empty"><MonitorUp size={28} /><strong>표시할 소스가 없습니다</strong><span>게임을 실행한 뒤 새로고침해 보세요.</span></div>}
        </div>
        <footer className="modal-footer"><span><ShieldCheck size={15} /> 선택한 화면은 로컬에서만 처리됩니다.</span><button type="button" className="button ghost" onClick={onClose}>취소</button></footer>
      </section>
    </div>
  );
}
