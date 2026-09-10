import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clapperboard, Gamepad2, Keyboard, Monitor, MonitorUp, RefreshCw, ShieldCheck, Sparkles, Volume2 } from 'lucide-react';
import type { AppSettings, CaptureSource } from '../../shared/types';
import { BrandMark } from './BrandMark';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface OnboardingProps {
  busy: boolean;
  sources: CaptureSource[];
  settings: AppSettings;
  refreshing: boolean;
  onRefresh: () => void;
  onComplete: (source: CaptureSource, patch: Partial<AppSettings>) => void;
}

export function OnboardingModal({
  busy,
  sources,
  settings,
  refreshing,
  onRefresh,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [sourceId, setSourceId] = useState(settings.selectedSourceId);
  const [systemAudio, setSystemAudio] = useState(settings.systemAudio);
  const [microphone, setMicrophone] = useState(settings.microphone);
  const dialogRef = useDialogFocus(true);
  const selectedSource = sources.find((source) => source.id === sourceId) ?? null;

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section ref={dialogRef} tabIndex={-1} className="modal onboarding-modal" role="dialog" aria-modal="true" aria-label="PulseClip 시작 설정">
        <div className="onboarding-visual">
          <BrandMark className="onboarding-logo" />
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="visual-card card-one"><Clapperboard size={18} /><span>REC</span><strong>00:42</strong></div>
          <div className="visual-card card-two"><Sparkles size={17} /><span>최근 순간</span><strong>저장 완료</strong></div>
          <div className="visual-copy"><span className="eyebrow">WELCOME TO</span><h2>PulseClip</h2><p>플레이는 계속.<br />기억은 우리가 남길게요.</p></div>
        </div>
        <div className="onboarding-content">
          <div className="onboarding-progress">{[0, 1, 2].map((value) => <span key={value} className={step >= value ? 'active' : ''} />)}</div>
          {step === 0 && (
            <div className="onboarding-step">
              <span className="step-kicker">1 / 3 · 시작하기</span>
              <h1>게임의 결정적인 순간,<br />이제 놓치지 마세요.</h1>
              <p>PulseClip은 계정도, 구독도 필요 없는 Windows 게임 녹화 도구입니다.</p>
              <div className="feature-list">
                <div><span><Keyboard size={19} /></span><div><strong>단축키 한 번</strong><small>F8로 방금 전 장면을 즉시 저장</small></div></div>
                <div><span><ShieldCheck size={19} /></span><div><strong>완전한 로컬 처리</strong><small>영상과 음성을 외부로 전송하지 않음</small></div></div>
                <div><span><Sparkles size={19} /></span><div><strong>한 번만 인코딩</strong><small>녹화와 리플레이가 같은 하드웨어 파이프라인 사용</small></div></div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="onboarding-step source-step">
              <div className="step-title-row"><div><span className="step-kicker">2 / 3 · 캡처 소스</span><h1>녹화할 화면을 선택하세요.</h1></div><button type="button" className="refresh-button" aria-label="캡처 소스 새로고침" onClick={onRefresh}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /></button></div>
              <p>나중에 홈 화면에서 언제든 바꿀 수 있어요.</p>
              <div className="onboarding-source-list">
                {sources.map((source) => (
                  <button type="button" key={source.id} className={sourceId === source.id ? 'selected' : ''} onClick={() => setSourceId(source.id)}>
                    <div>{source.thumbnailDataUrl ? <img src={source.thumbnailDataUrl} alt="" /> : <Monitor size={22} />}</div>
                    <span>{source.name}</span>
                    <i>{sourceId === source.id && <Check size={13} />}</i>
                  </button>
                ))}
                {sources.length === 0 && <div className="onboarding-no-source"><MonitorUp size={26} /><span>소스를 찾는 중입니다…</span></div>}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-step">
              <span className="step-kicker">3 / 3 · 오디오</span>
              <h1>어떤 소리를 담을까요?</h1>
              <p>게임 소리와 마이크를 선택해서 하나의 영상에 정확히 맞춰 저장합니다.</p>
              <div className="onboarding-options">
                <button type="button" aria-pressed={systemAudio} className={systemAudio ? 'selected' : ''} onClick={() => setSystemAudio(!systemAudio)}><span><Volume2 size={22} /></span><div><strong>게임 소리</strong><small>Windows 시스템 오디오</small></div><i>{systemAudio && <Check size={13} />}</i></button>
                <button type="button" aria-pressed={microphone} className={microphone ? 'selected' : ''} onClick={() => setMicrophone(!microphone)}><span><Gamepad2 size={22} /></span><div><strong>마이크</strong><small>팀 보이스와 리액션</small></div><i>{microphone && <Check size={13} />}</i></button>
              </div>
              <div className="hotkey-preview"><Keyboard size={18} /><div><small>기본 리플레이 단축키</small><strong>{settings.hotkeys.saveReplay}</strong></div><span>설정에서 변경 가능</span></div>
            </div>
          )}
          <footer className="onboarding-footer">
            <button type="button" className="button ghost" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={17} /> 이전</button>
            {step < 2 ? (
              <button type="button" className="button primary" disabled={step === 1 && !selectedSource} onClick={() => setStep((current) => current + 1)}>계속하기 <ChevronRight size={17} /></button>
            ) : (
              <button type="button" className="button primary" disabled={!selectedSource || busy} onClick={() => selectedSource && onComplete(selectedSource, { systemAudio, microphone, completedOnboarding: true, selectedSourceId: selectedSource.id, selectedSourceName: selectedSource.name })}>PulseClip 시작 <Sparkles size={17} /></button>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}
