import { Minus, Square, X } from 'lucide-react';
import type { CaptureTelemetry } from '../../shared/types';
import { phaseLabel } from '../utils';

interface TitleBarProps {
  telemetry: CaptureTelemetry;
}

export function TitleBar({ telemetry }: TitleBarProps) {
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
          aria-label="최대화"
          onClick={() => void window.pulseClip.windowAction('maximize')}
        >
          <Square size={12} />
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
