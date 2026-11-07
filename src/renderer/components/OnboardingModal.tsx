import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clapperboard, Gauge, Keyboard, Mic, Monitor, MonitorUp, Power, RefreshCw, ShieldCheck, Sparkles, Volume2, Zap } from 'lucide-react';
import type { AppSettings, CaptureSource } from '../../shared/types';
import { QUALITY_PRESETS, matchesPreset } from '../../shared/quality-presets';
import { displayShortcut } from '../../shared/hotkeys';
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

const STEP_COUNT = 4;

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
  const [quality, setQuality] = useState(() => QUALITY_PRESETS.find(preset => matchesPreset(settings, preset))?.id ?? 'balanced');
  const [autoStartBuffer, setAutoStartBuffer] = useState(settings.autoStartBuffer);
  const [launchAtStartup, setLaunchAtStartup] = useState(settings.launchAtStartup);
  const dialogRef = useDialogFocus(true);
  const selectedSource = sources.find((source) => source.id === sourceId) ?? null;
  const replayKey = displayShortcut(settings.hotkeys.saveReplay);

  const finish = () => {
    if (!selectedSource) return;
    const preset = QUALITY_PRESETS.find(item => item.id === quality) ?? QUALITY_PRESETS[1];
    onComplete(selectedSource, {
      systemAudio,
      microphone,
      resolution: preset.resolution,
      fps: preset.fps,
      videoBitrateMbps: preset.videoBitrateMbps,
      autoStartBuffer,
      launchAtStartup,
      completedOnboarding: true,
      selectedSourceId: selectedSource.id,
      selectedSourceName: selectedSource.name,
    });
  };

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
          <div className="onboarding-progress" role="progressbar" aria-label="시작 설정 진행" aria-valuemin={1} aria-valuemax={STEP_COUNT} aria-valuenow={step + 1}>
            {Array.from({ length: STEP_COUNT }, (_, value) => <span key={value} className={step >= value ? 'active' : ''} />)}
          </div>
          {step === 0 && (
            <div className="onboarding-step">
              <span className="step-kicker">1 / {STEP_COUNT} · 시작하기</span>
              <h1>게임의 결정적인 순간,<br />이제 놓치지 마세요.</h1>
              <p>PulseClip은 계정도, 구독도 필요 없는 Windows 게임 녹화 도구입니다.</p>
              <div className="feature-list">
                <div><span><Keyboard size={19} /></span><div><strong>단축키 한 번</strong><small>{replayKey}로 방금 전 장면을 즉시 저장</small></div></div>
                <div><span><ShieldCheck size={19} /></span><div><strong>완전한 로컬 처리</strong><small>영상과 음성을 외부로 전송하지 않음</small></div></div>
                <div><span><Sparkles size={19} /></span><div><strong>한 번만 인코딩</strong><small>녹화와 리플레이가 같은 하드웨어 파이프라인 사용</small></div></div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="onboarding-step source-step">
              <div className="step-title-row"><div><span className="step-kicker">2 / {STEP_COUNT} · 캡처 소스</span><h1>녹화할 화면을 선택하세요.</h1></div><button type="button" className="refresh-button" aria-label="캡처 소스 새로고침" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} /></button></div>
              <p>전체 화면 게임은 모니터를, 창 모드 게임은 해당 창을 고르세요. 나중에 홈에서 바꿀 수 있어요.</p>
              <div className="onboarding-source-list">
                {sources.map((source) => (
                  <button type="button" key={source.id} aria-pressed={sourceId === source.id} className={sourceId === source.id ? 'selected' : ''} onClick={() => setSourceId(source.id)}>
                    <div>{source.thumbnailDataUrl ? <img src={source.thumbnailDataUrl} alt="" /> : <Monitor size={22} />}</div>
                    <span>{source.name}</span>
                    <i>{sourceId === source.id && <Check size={13} />}</i>
                  </button>
                ))}
                {sources.length === 0 && (
                  <div className="onboarding-no-source">
                    <MonitorUp size={26} />
                    {refreshing
                      ? <span>화면과 창을 찾고 있습니다…</span>
                      : <><span>표시할 화면이나 창을 찾지 못했습니다.</span><button type="button" className="button ghost" onClick={onRefresh}><RefreshCw size={15} /> 다시 찾기</button></>}
                  </div>
                )}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-step">
              <span className="step-kicker">3 / {STEP_COUNT} · 오디오</span>
              <h1>어떤 소리를 담을까요?</h1>
              <p>게임 소리와 마이크를 하나의 영상에 맞춰 저장합니다. 마이크 장치와 음량은 설정에서 고를 수 있어요.</p>
              <div className="onboarding-options">
                <button type="button" aria-pressed={systemAudio} className={systemAudio ? 'selected' : ''} onClick={() => setSystemAudio(!systemAudio)}><span><Volume2 size={22} /></span><div><strong>게임 소리</strong><small>Windows 시스템 오디오</small></div><i>{systemAudio && <Check size={13} />}</i></button>
                <button type="button" aria-pressed={microphone} className={microphone ? 'selected' : ''} onClick={() => setMicrophone(!microphone)}><span><Mic size={22} /></span><div><strong>마이크</strong><small>팀 보이스와 리액션</small></div><i>{microphone && <Check size={13} />}</i></button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="onboarding-step">
              <span className="step-kicker">4 / {STEP_COUNT} · 준비</span>
              <h1>화질과 시작 방식을 고르세요.</h1>
              <p>게임이 버벅이면 성능 우선을 선택하세요. 설정에서 언제든 바꿀 수 있어요.</p>
              <div className="onboarding-presets" role="radiogroup" aria-label="녹화 화질">
                {QUALITY_PRESETS.map(preset => (
                  <button type="button" role="radio" key={preset.id} aria-checked={quality === preset.id} className={quality === preset.id ? 'selected' : ''} onClick={() => setQuality(preset.id)}>
                    <Gauge size={16} /><strong>{preset.name}</strong><small>{preset.description}</small>
                  </button>
                ))}
              </div>
              <div className="onboarding-toggles">
                <OnboardingToggle icon={<Zap size={18} />} label="PulseClip을 켜면 리플레이도 자동으로 켜기" hint={`잊어버려도 ${replayKey}가 바로 동작합니다. 권장`} checked={autoStartBuffer} onChange={setAutoStartBuffer} />
                <OnboardingToggle icon={<Power size={18} />} label="Windows 시작 시 트레이에서 실행" hint="게임 전에 PulseClip을 따로 켤 필요가 없습니다." checked={launchAtStartup} onChange={setLaunchAtStartup} />
              </div>
            </div>
          )}
          <footer className="onboarding-footer">
            <button type="button" className="button ghost" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={17} /> 이전</button>
            {step < STEP_COUNT - 1 ? (
              <button type="button" className="button primary" disabled={step === 1 && !selectedSource} onClick={() => setStep((current) => current + 1)}>계속하기 <ChevronRight size={17} /></button>
            ) : (
              <button type="button" className="button primary" disabled={!selectedSource || busy} onClick={finish}>PulseClip 시작 <Sparkles size={17} /></button>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}

function OnboardingToggle({ icon, label, hint, checked, onChange }: { icon: React.ReactNode; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="onboarding-toggle">
      <span>{icon}</span>
      <div><strong>{label}</strong><small>{hint}</small></div>
      <button type="button" role="switch" aria-label={label} aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}
