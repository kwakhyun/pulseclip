import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { UpdateInfo } from '../../shared/types';

export function UpdatePanel() {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState('');
  const check = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { setInfo(await window.pulseClip.checkForUpdates()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '업데이트를 확인하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  return <section className="update-panel">
    <h3>앱 업데이트</h3>
    <p>확인 버튼을 누르면 GitHub의 공식 릴리스를 조회합니다.</p>
    <button type="button" className="button ghost" disabled={busy} onClick={() => void check()}><RefreshCw size={16} className={busy ? 'spin' : ''} />{busy ? '확인 중…' : '업데이트 확인'}</button>
    {info && <div role="status"><p>{info.available ? `새 버전 v${info.latestVersion}을 사용할 수 있습니다.` : '현재 버전에 적용할 새 업데이트가 없습니다.'}</p><small>설치 v{info.currentVersion} · 최신 릴리스 v{info.latestVersion}</small></div>}
    {info?.available && <button type="button" className="button primary" onClick={() => void window.pulseClip.openReleasePage().catch(() => setError('릴리스 페이지를 열지 못했습니다.'))}><Download size={16} /> 공식 다운로드 열기</button>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
