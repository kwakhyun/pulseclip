import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import type { CaptureTelemetry } from '../../shared/types';
import { phaseLabel } from '../utils';

interface TitleBarProps {
  telemetry: CaptureTelemetry;
  /** The window can already be maximized when the renderer reloads after a crash. */
  initialMaximized: boolean;
}

export function TitleBar({ telemetry, initialMaximized }: TitleBarProps) {
  const [maximized, setMaximized] = useState(initialMaximized);
  useEffect(
    () => window.pulseClip.onAppEvent('window:maximized-changed', (state) => setMaximized(state.maximized)),
    [],
  );

  return (
    <header className="titlebar">
      <div className="titlebar-drag-region">
        <span className={`status-dot status-${telemetry.phase}`} />
        <span className="titlebar-status">{phaseLabel(telemetry.phase)}</span>
        {telemetry.sourceName && (
          <span className="titlebar-source">· {telemetry.sourceName}</span>
        )}
      </div>
      <div className="window-controls">
        <button
          type="button"
          aria-label="최소화"
          onClick={() => void window.pulseClip.windowAction('minimize')}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label={maximized ? '이전 크기로 복원' : '최대화'}
          onClick={() => void window.pulseClip.windowAction('maximize')}
        >
          {maximized ? <Copy size={12} style={{ transform: 'scaleX(-1)' }} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className="window-close"
          aria-label="닫기"
          onClick={() => void window.pulseClip.windowAction('close')}
        >
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
