import {
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import type {
  DiagnosticCheck,
  DiagnosticReport,
  DiagnosticStatus,
  DiskSpaceStatus,
} from '../../shared/types';
import { formatBytes } from '../utils';

interface DiagnosticsPageProps {
  report: DiagnosticReport | null;
  diskSpace: DiskSpaceStatus | null;
  loading: boolean;
  exporting: boolean;
  onRun: () => void;
  onExport: () => void;
}

const statusCopy: Record<DiagnosticStatus, { label: string; title: string; description: string }> = {
  pass: {
    label: '정상',
    title: '녹화 준비가 완료되었습니다',
    description: '현재 환경에서 PulseClip의 핵심 녹화 기능을 사용할 수 있습니다.',
  },
  warning: {
    label: '확인 필요',
    title: '일부 항목을 확인해 주세요',
    description: '녹화는 가능하지만 안정적인 사용을 위해 아래 권장 사항을 확인해 주세요.',
  },
  fail: {
    label: '조치 필요',
    title: '녹화를 시작하기 전 조치가 필요합니다',
    description: '실패한 항목을 해결한 뒤 상태 점검을 다시 실행해 주세요.',
  },
};

export function DiagnosticsPage({
  report,
  diskSpace,
  loading,
  exporting,
  onRun,
  onExport,
}: DiagnosticsPageProps) {
  const overall = report?.overall ?? diskStatusToDiagnostic(diskSpace);
  const copy = statusCopy[overall];
  const currentDisk = report?.diskSpace ?? diskSpace;
  const diskRatio = currentDisk && currentDisk.totalBytes > 0
    ? Math.min(100, (currentDisk.freeBytes / currentDisk.totalBytes) * 100)
    : 0;

  return (
    <section className="page diagnostics-page">
      <header className="diagnostics-header">
        <div>
          <span className="eyebrow">SYSTEM HEALTH</span>
          <h1>상태 점검</h1>
          <p>녹화 장치, 코덱, 저장 공간과 단축키를 한 번에 확인합니다.</p>
        </div>
        <div className="diagnostics-actions">
          <button
            type="button"
            className="button ghost"
            onClick={onExport}
            disabled={!report || loading || exporting}
          >
            {exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
            결과 내보내기
          </button>
          <button type="button" className="button primary" onClick={onRun} disabled={loading}>
            {loading ? <LoaderCircle size={17} className="spin" /> : <RefreshCw size={17} />}
            {report ? '다시 점검' : '점검 시작'}
          </button>
        </div>
      </header>

      <div className={`diagnostics-overview status-${overall}`}>
        <span className="diagnostics-overview-icon">{statusIcon(overall, 27)}</span>
        <div>
          <small>{copy.label}</small>
          <h2>{loading ? '시스템을 점검하고 있습니다' : copy.title}</h2>
          <p>{loading ? '몇 초 안에 결과를 보여드릴게요.' : copy.description}</p>
        </div>
        {report && (
          <time dateTime={report.generatedAt}>
            마지막 점검 {formatDiagnosticTime(report.generatedAt)}
          </time>
        )}
      </div>

      <div className="diagnostics-grid">
        <div className="diagnostics-panel checks-panel">
          <header>
            <div>
              <ShieldCheck size={18} />
              <h2>핵심 점검 항목</h2>
            </div>
            {report && <span>{report.checks.length}개 항목</span>}
          </header>
          <div className="diagnostic-check-list" aria-live="polite">
            {report ? (
              report.checks.map((check) => <DiagnosticCheckRow key={check.id} check={check} />)
            ) : (
              <div className="diagnostics-empty">
                <ShieldCheck size={31} />
                <strong>아직 점검 결과가 없습니다</strong>
                <p>점검을 실행하면 녹화 준비 상태와 해결 방법을 확인할 수 있습니다.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="diagnostics-side">
          <div className="diagnostics-panel disk-health-card">
            <header>
              <div>
                <HardDrive size={18} />
                <h2>저장 공간</h2>
              </div>
              {currentDisk && (
                <span className={`health-pill health-${currentDisk.health}`}>
                  {diskHealthLabel(currentDisk.health)}
                </span>
              )}
            </header>
            {currentDisk ? (
              <>
                <strong className="disk-free-value">{formatBytes(currentDisk.freeBytes)} 여유</strong>
                <p>{currentDisk.summary}</p>
                <div
                  className="disk-capacity-track"
                  role="progressbar"
                  aria-label="저장 공간 여유 비율"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(diskRatio)}
                >
                  <span style={{ width: `${diskRatio}%` }} />
                </div>
                <dl className="disk-health-details">
                  <div><dt>전체 용량</dt><dd>{formatBytes(currentDisk.totalBytes)}</dd></div>
                  <div><dt>보호 여유 공간</dt><dd>{formatBytes(currentDisk.reserveBytes)}</dd></div>
                  <div><dt>녹화 시작 기준</dt><dd>{formatBytes(currentDisk.requiredStartBytes)}</dd></div>
                </dl>
              </>
            ) : (
              <p className="diagnostics-muted">점검을 실행하면 저장 공간을 확인합니다.</p>
            )}
          </div>

          <div className="diagnostics-panel system-card">
            <header>
              <div>
                <Cpu size={18} />
                <h2>시스템 정보</h2>
              </div>
            </header>
            {report ? (
              <dl>
                <div><dt>PulseClip</dt><dd>v{report.system.appVersion}</dd></div>
                <div><dt>운영체제</dt><dd>{report.system.platform} {report.system.osRelease}</dd></div>
                <div><dt>아키텍처</dt><dd>{report.system.architecture}</dd></div>
                <div><dt>Electron</dt><dd>{report.system.electronVersion}</dd></div>
              </dl>
            ) : (
              <p className="diagnostics-muted">점검 결과에 시스템 버전 정보가 포함됩니다.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function DiagnosticCheckRow({ check }: { check: DiagnosticCheck }) {
  return (
    <article className={`diagnostic-check status-${check.status}`}>
      <span>{statusIcon(check.status, 19)}</span>
      <div>
        <div>
          <h3>{check.title}</h3>
          <em>{statusCopy[check.status].label}</em>
        </div>
        <p>{check.summary}</p>
        {check.detail && <small>{check.detail}</small>}
      </div>
    </article>
  );
}

function statusIcon(status: DiagnosticStatus, size: number) {
  if (status === 'pass') return <CheckCircle2 size={size} />;
  if (status === 'warning') return <TriangleAlert size={size} />;
  return <XCircle size={size} />;
}

function diskStatusToDiagnostic(diskSpace: DiskSpaceStatus | null): DiagnosticStatus {
  if (!diskSpace) return 'warning';
  if (diskSpace.health === 'healthy') return 'pass';
  if (diskSpace.health === 'low') return 'warning';
  return 'fail';
}

function diskHealthLabel(health: DiskSpaceStatus['health']): string {
  if (health === 'healthy') return '충분';
  if (health === 'low') return '부족';
  if (health === 'critical') return '위험';
  return '확인 불가';
}

function formatDiagnosticTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
