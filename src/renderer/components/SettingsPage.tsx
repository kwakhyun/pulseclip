import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Info,
  Keyboard,
  Mic,
  Monitor,
  Power,
  RotateCcw,
  Save,
  ShieldCheck,
  Volume2,
  Zap,
} from 'lucide-react';
import type {
  AppSettings,
  AudioInputDevice,
  ShortcutRegistration,
} from '../../shared/types';
import { QUALITY_PRESETS, matchesPreset } from '../../shared/quality-presets';
import { acceleratorFromKeyboard, displayShortcut, hotkeyProblem, parseShortcut, formatShortcut, shortcutProblem } from '../../shared/hotkeys';
import { mergeSettingsDraft } from '../settings-draft';
import { formatBytes } from '../utils';
import { UpdatePanel } from './UpdatePanel';

interface SettingsPageProps {
  settings: AppSettings;
  microphones: AudioInputDevice[];
  shortcutRegistration: ShortcutRegistration;
  saving: boolean;
  captureActive: boolean;
  recording: boolean;
  version: string;
  onSave: (settings: AppSettings) => void;
  onChooseOutputFolder: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSuspendShortcuts: (suspended: boolean) => void;
}

const SECTIONS = [
  ['settings-quality', '영상 품질'],
  ['settings-audio', '오디오'],
  ['settings-replay', '리플레이·단축키'],
  ['settings-storage', '저장공간'],
  ['settings-behavior', '앱 동작'],
  ['settings-about', '정보'],
] as const;

export function SettingsPage({
  settings,
  microphones,
  shortcutRegistration,
  saving,
  captureActive,
  recording,
  version,
  onSave,
  onChooseOutputFolder,
  onDirtyChange,
  onSuspendShortcuts,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  const previous = useRef(settings);
  useEffect(() => {
    const old = previous.current;
    setDraft(current => mergeSettingsDraft(current, old, settings));
    previous.current = settings;
  }, [settings]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const shortcutError = hotkeyProblem(draft.hotkeys);
  // Show each field's own reason; a duplicate marks both fields.
  const saveKeyProblem = shortcutProblem(draft.hotkeys.saveReplay);
  const recordKeyProblem = shortcutProblem(draft.hotkeys.toggleRecording);
  const duplicateProblem = !saveKeyProblem && !recordKeyProblem ? shortcutError : null;
  const saveFieldProblem = saveKeyProblem ?? duplicateProblem;
  const recordFieldProblem = recordKeyProblem ?? duplicateProblem;
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <div><span className="eyebrow">녹화 환경</span><h1>설정</h1><p>내 PC와 플레이 방식에 맞게 녹화를 조정하세요.</p></div>
        {captureActive && <span className="restart-note"><RotateCcw size={15} /> 저장하면 캡처가 다시 시작되어 지금까지 모인 리플레이가 비워집니다</span>}
      </div>

      <nav className="settings-nav" aria-label="설정 섹션">
        {SECTIONS.map(([id, label]) => <button type="button" key={id} onClick={() => scrollTo(id)}>{label}</button>)}
      </nav>

      <div className="settings-layout">
        <div className="settings-content">
          <section className="quality-presets" aria-label="녹화 품질 프리셋">
            {QUALITY_PRESETS.map(preset => <button type="button" key={preset.id} aria-pressed={matchesPreset(draft, preset)} className={matchesPreset(draft, preset) ? 'selected' : ''} onClick={() => setDraft(current => ({ ...current, resolution: preset.resolution, fps: preset.fps, videoBitrateMbps: preset.videoBitrateMbps }))}><strong>{preset.name}</strong><span>{preset.description}</span></button>)}
          </section>
          <SettingSection id="settings-quality" icon={<Monitor size={19} />} title="영상 품질" description="게임 성능과 영상 선명도의 균형을 정합니다.">
            <SettingRow label="해상도" hint="원본은 선택한 화면 크기를 그대로 사용합니다.">
              <div className="segmented four">
                {([
                  ['720p', '720p'],
                  ['1080p', '1080p'],
                  ['1440p', '1440p'],
                  ['source', '원본'],
                ] as const).map(([value, label]) => (
                  <button type="button" key={value} aria-pressed={draft.resolution === value} className={draft.resolution === value ? 'active' : ''} onClick={() => patch('resolution', value)}>{label}</button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="프레임률" hint="빠른 게임에는 60 FPS를 권장합니다.">
              <div className="segmented">
                <button type="button" aria-pressed={draft.fps === 30} className={draft.fps === 30 ? 'active' : ''} onClick={() => patch('fps', 30)}>30 FPS</button>
                <button type="button" aria-pressed={draft.fps === 60} className={draft.fps === 60 ? 'active' : ''} onClick={() => patch('fps', 60)}>60 FPS</button>
              </div>
            </SettingRow>
            <RangeRow
              label="영상 비트레이트"
              value={draft.videoBitrateMbps}
              minimum={4}
              maximum={40}
              step={1}
              suffix="Mbps"
              onChange={(value) => patch('videoBitrateMbps', value)}
            />
          </SettingSection>

          <SettingSection id="settings-audio" icon={<Volume2 size={19} />} title="오디오" description="게임 소리와 음성을 하나의 동기화된 트랙으로 저장합니다.">
            <ToggleRow icon={<Volume2 size={17} />} label="시스템 오디오" hint="Windows에서 재생되는 게임 소리를 녹음합니다." checked={draft.systemAudio} onChange={(value) => patch('systemAudio', value)} />
            <ToggleRow icon={<Mic size={17} />} label="마이크" hint="선택한 입력 장치를 게임 소리와 믹싱합니다. 홈 화면에서 입력 레벨을 확인할 수 있어요." checked={draft.microphone} onChange={(value) => patch('microphone', value)} />
            {draft.microphone && (
              <>
                <SettingRow label="입력 장치" hint={microphones.length === 0 ? '마이크 권한을 허용하면 장치 이름이 표시됩니다.' : undefined}>
                  <select aria-label="마이크 입력 장치" value={draft.microphoneDeviceId} onChange={(event) => patch('microphoneDeviceId', event.target.value)}>
                    <option value="">Windows 기본 장치</option>
                    {microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                  </select>
                </SettingRow>
                <RangeRow label="마이크 게인" value={draft.microphoneGain} minimum={0} maximum={200} step={5} suffix="%" onChange={(value) => patch('microphoneGain', value)} />
              </>
            )}
          </SettingSection>

          <SettingSection id="settings-replay" icon={<RotateCcw size={19} />} title="즉시 리플레이와 단축키" description="메모리에 유지할 최근 구간과 게임 중에 누를 단축키를 정합니다. 켜 두었던 리플레이는 화면 잠금이나 절전에서 돌아오면 다시 켜집니다.">
            <RangeRow label="리플레이 길이" value={draft.replaySeconds} minimum={15} maximum={180} step={5} suffix="초" onChange={(value) => patch('replaySeconds', value)} />
            <SettingRow label="리플레이 저장 단축키" hint={saveFieldProblem ?? (!shortcutRegistration.saveReplay ? '다른 앱이 이미 사용 중일 수 있습니다. 다른 키를 지정해 보세요.' : '칸을 누른 뒤 원하는 키를 누르세요. 게임 중에도 동작합니다.')}>
              <HotkeyInput label="리플레이 저장 단축키" value={draft.hotkeys.saveReplay} problem={saveFieldProblem} onSuspend={onSuspendShortcuts} onChange={(value) => setDraft((current) => ({ ...current, hotkeys: { ...current.hotkeys, saveReplay: value } }))} valid={draft.hotkeys.saveReplay === settings.hotkeys.saveReplay ? shortcutRegistration.saveReplay : null} />
            </SettingRow>
            <SettingRow label="녹화 시작/종료 단축키" hint={recordFieldProblem ?? (!shortcutRegistration.toggleRecording ? '다른 앱이 이미 사용 중일 수 있습니다. 다른 키를 지정해 보세요.' : '문자·숫자 키는 Ctrl 또는 Alt와 함께 지정해야 합니다.')}>
              <HotkeyInput label="녹화 시작/종료 단축키" value={draft.hotkeys.toggleRecording} problem={recordFieldProblem} onSuspend={onSuspendShortcuts} onChange={(value) => setDraft((current) => ({ ...current, hotkeys: { ...current.hotkeys, toggleRecording: value } }))} valid={draft.hotkeys.toggleRecording === settings.hotkeys.toggleRecording ? shortcutRegistration.toggleRecording : null} />
            </SettingRow>
          </SettingSection>

          <SettingSection id="settings-storage" icon={<HardDrive size={19} />} title="저장공간" description="클립 위치와 자동 정리 한도를 관리합니다.">
            <ToggleRow icon={<HardDrive size={17} />} label="저장 한도 초과 시 자동 정리" hint="정리되면 알림으로 알려 드립니다. 끄면 클립을 직접 삭제할 때까지 보존합니다." checked={draft.autoCleanup} onChange={value => patch('autoCleanup', value)} />
            <SettingRow label="저장 폴더" hint="PulseClip이 만든 파일만 자동 정리 대상이 됩니다.">
              <button type="button" className="folder-picker" onClick={onChooseOutputFolder} disabled={recording || saving}><FolderOpen size={16} /><span>{draft.outputFolder}</span><em>변경</em></button>
            </SettingRow>
            <RangeRow label="최대 사용량" value={draft.storageLimitGb} minimum={1} maximum={500} step={1} suffix="GB" onChange={(value) => patch('storageLimitGb', value)} />
            <div className="privacy-note"><ShieldCheck size={17} /><p><strong>즐겨찾기는 자동 삭제하지 않습니다.</strong><br />한도를 넘으면 오래된 일반 클립부터 90% 수준까지 정리합니다. 직접 삭제한 클립은 Windows 휴지통으로 옮겨집니다.</p></div>
          </SettingSection>

          <SettingSection id="settings-behavior" icon={<Gamepad2 size={19} />} title="앱 동작" description="시작 방식과 게임 중 알림을 선택합니다.">
            <ToggleRow icon={<Zap size={17} />} label="실행 후 자동으로 리플레이 준비" hint="PulseClip을 켜면 마지막으로 선택한 소스를 바로 캡처합니다." checked={draft.autoStartBuffer} onChange={(value) => patch('autoStartBuffer', value)} />
            <ToggleRow icon={<Power size={17} />} label="Windows 시작 시 실행" hint="트레이에서 조용히 시작합니다." checked={draft.launchAtStartup} onChange={(value) => patch('launchAtStartup', value)} />
            <ToggleRow icon={<Volume2 size={17} />} label="저장 효과음" hint="게임 중 단축키 결과를 짧은 소리로 알려 줍니다. 시스템 오디오를 녹음 중이면 효과음도 영상에 담길 수 있습니다." checked={draft.playSounds} onChange={(value) => patch('playSounds', value)} />
            <ToggleRow icon={<Bell size={17} />} label="Windows 알림" hint="PulseClip 창을 보고 있지 않을 때 저장 결과와 문제를 알립니다. 전체 화면 게임 중에는 Windows 방해 금지 모드가 숨길 수 있습니다." checked={draft.showNotifications} onChange={(value) => patch('showNotifications', value)} />
            <ToggleRow icon={<Monitor size={17} />} label="마우스 커서 녹화" hint="캡처 환경이 지원할 때 영상에 마우스 포인터를 표시합니다." checked={draft.recordCursor} onChange={value => patch('recordCursor', value)} />
            <ToggleRow icon={<Power size={17} />} label="닫을 때 트레이로 최소화" hint="창을 닫아도 리플레이 준비 상태를 유지합니다." checked={draft.minimizeToTray} onChange={(value) => patch('minimizeToTray', value)} />
          </SettingSection>

          <SettingSection id="settings-about" icon={<Info size={19} />} title="정보" description={`PulseClip v${version} · 로컬 우선 Windows 게임 녹화 앱`}>
            <UpdatePanel />
          </SettingSection>
        </div>

        <aside className="settings-summary">
          <span className="summary-icon"><Gamepad2 size={24} /></span>
          <small>현재 구성</small>
          <h3>{draft.selectedSourceName || '캡처 소스 미선택'}</h3>
          <dl>
            <div><dt>화질</dt><dd>{draft.resolution === 'source' ? '원본' : draft.resolution} / {draft.fps} FPS</dd></div>
            <div><dt>리플레이</dt><dd>최근 {draft.replaySeconds}초</dd></div>
            <div><dt>오디오</dt><dd>{[draft.systemAudio && '게임', draft.microphone && '마이크'].filter(Boolean).join(' + ') || '없음'}</dd></div>
            <div><dt>단축키</dt><dd>{displayShortcut(draft.hotkeys.saveReplay)} · {displayShortcut(draft.hotkeys.toggleRecording)}</dd></div>
          </dl>
          <div className="storage-estimate"><small>예상 녹화 용량 / 시간</small><strong>약 {formatBytes((draft.videoBitrateMbps + (draft.systemAudio || draft.microphone ? 0.192 : 0)) * 1_000_000 / 8 * 3600)}</strong><small>리플레이 메모리 약 {formatBytes(draft.videoBitrateMbps * 1_000_000 / 8 * (draft.replaySeconds + 3))}</small></div>
          {shortcutError && <p className="inline-error" role="alert">{shortcutError}</p>}
          <button type="button" className="button primary save-settings" disabled={!dirty || saving || recording || Boolean(shortcutError)} onClick={() => onSave(draft)}><Save size={17} />{saving ? '작업 중…' : '변경사항 저장'}</button>
          {dirty && <button type="button" className="button ghost" disabled={saving} onClick={() => setDraft(settings)}>변경사항 되돌리기</button>}
          {recording && <p className="summary-warning">녹화를 종료한 뒤 설정을 변경할 수 있습니다.</p>}
          {!recording && dirty && captureActive && <p className="summary-warning">저장하면 지금까지 모인 리플레이가 비워집니다.</p>}
        </aside>
      </div>
    </div>
  );
}

function SettingSection({ id, icon, title, description, children }: { id: string; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section id={id} className="settings-section" aria-labelledby={`${id}-title`}><header><span>{icon}</span><div><h2 id={`${id}-title`}>{title}</h2><p>{description}</p></div></header><div className="settings-section-body">{children}</div></section>;
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><strong>{label}</strong>{hint && <small>{hint}</small>}</div><div className="setting-control">{children}</div></div>;
}

function ToggleRow({ icon, label, hint, checked, onChange }: { icon: React.ReactNode; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="toggle-row"><span className="toggle-row-icon">{icon}</span><div><strong>{label}</strong><small>{hint}</small></div><button type="button" role="switch" aria-label={label} aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button></div>;
}

function RangeRow({ label, value, minimum, maximum, step, suffix, onChange }: { label: string; value: number; minimum: number; maximum: number; step: number; suffix: string; onChange: (value: number) => void }) {
  const ratio = ((value - minimum) / (maximum - minimum)) * 100;
  return <div className="range-row"><div className="range-label"><strong>{label}</strong><span>{value} {suffix}</span></div><input type="range" aria-label={label} min={minimum} max={maximum} step={step} value={value} style={{ '--range-progress': `${ratio}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} /><div className="range-bounds"><span>{minimum} {suffix}</span><span>{maximum} {suffix}</span></div></div>;
}

/**
 * Records the physical key combination instead of asking people to type
 * Electron accelerator syntax. Global shortcuts are paused while the field
 * listens so pressing the current F8 does not save a replay instead.
 */
/** Main restores global shortcuts after 20 s on its own; renew well before that while listening. */
const SHORTCUT_SUSPEND_RENEW_MS = 10_000;

function HotkeyInput({ label, value, onChange, valid, problem, onSuspend }: { label: string; value: string; onChange: (value: string) => void; valid: boolean | null; problem: string | null; onSuspend: (suspended: boolean) => void }) {
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  useEffect(() => () => { if (listeningRef.current) onSuspend(false); }, [onSuspend]);
  // Otherwise the field still says "입력 대기" while F8 already fires the replay again.
  useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => onSuspend(true), SHORTCUT_SUSPEND_RENEW_MS);
    return () => window.clearInterval(timer);
  }, [listening, onSuspend]);
  const setMode = (next: boolean) => {
    if (listeningRef.current === next) return;
    listeningRef.current = next;
    setListening(next);
    onSuspend(next);
  };
  const invalid = Boolean(problem) || valid === false;
  const status = listening ? '입력 대기' : problem ? '사용 불가' : valid === null ? '저장 시 적용' : valid ? '등록됨' : '충돌';
  return (
    <label className={`hotkey-input ${invalid ? 'invalid' : ''} ${listening ? 'listening' : ''}`}>
      <Keyboard size={15} />
      <input
        aria-label={label}
        aria-invalid={invalid}
        aria-description="칸을 선택한 뒤 원하는 키 조합을 누르세요. Esc는 취소합니다."
        value={listening ? '' : displayShortcut(value)}
        placeholder={listening ? '원하는 키 조합을 누르세요…' : ''}
        maxLength={64}
        onFocus={() => setMode(true)}
        onBlur={() => setMode(false)}
        onKeyDown={(event) => {
          if (event.key === 'Tab') return;
          event.preventDefault();
          if (event.key === 'Escape') { event.currentTarget.blur(); return; }
          const accelerator = acceleratorFromKeyboard(event.nativeEvent);
          if (!accelerator) return;
          onChange(accelerator);
          event.currentTarget.blur();
        }}
        onChange={(event) => {
          // Fallback for pasted or assistive-technology input.
          const parsed = parseShortcut(event.target.value);
          onChange(parsed ? formatShortcut(parsed) : event.target.value);
        }}
      />
      <span role="status">{status}</span>
    </label>
  );
}
