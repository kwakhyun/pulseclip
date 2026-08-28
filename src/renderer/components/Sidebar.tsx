import {
  Clapperboard,
  HeartPulse,
  Home,
  Settings,
  Sparkles,
} from 'lucide-react';
import type { NavigationPage, StorageStats } from '../../shared/types';
import { formatBytes } from '../utils';
import { BrandMark } from './BrandMark';

interface SidebarProps {
  page: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  storage: StorageStats | null;
  version: string;
}

const navigation = [
  { id: 'home' as const, label: '홈', icon: Home },
  { id: 'clips' as const, label: '내 클립', icon: Clapperboard },
  { id: 'diagnostics' as const, label: '상태 점검', icon: HeartPulse },
  { id: 'settings' as const, label: '설정', icon: Settings },
];

export function Sidebar({ page, onNavigate, storage, version }: SidebarProps) {
  const ratio = storage && storage.limitBytes > 0
    ? Math.min(100, (storage.bytesUsed / storage.limitBytes) * 100)
    : 0;

  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark className="brand-mark" />
        <div>
          <strong>PulseClip</strong>
          <small>PLAY. SAVE. SHARE.</small>
        </div>
      </div>

      <nav className="main-nav" aria-label="주 메뉴">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => onNavigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{item.label}</span>
              {item.id === 'clips' && storage && storage.clipCount > 0 && (
                <em>{storage.clipCount}</em>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="local-first-card">
        <Sparkles size={17} />
        <div>
          <strong>로컬 우선</strong>
          <p>영상은 이 PC 밖으로 전송되지 않아요.</p>
        </div>
      </div>

      <div className="storage-mini">
        <div className="storage-mini-label">
          <span>저장공간</span>
          <strong>{storage ? formatBytes(storage.bytesUsed) : '—'}</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${ratio}%` }} />
        </div>
        <small>
          {storage ? `${formatBytes(storage.limitBytes)} 중 ${ratio.toFixed(0)}%` : '계산 중'}
        </small>
      </div>

      <span className="app-version">PulseClip v{version || '0.1.0'}</span>
    </aside>
  );
}
