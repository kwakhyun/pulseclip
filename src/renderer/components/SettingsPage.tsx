import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Keyboard,
  Mic,
  Monitor,
  Power,
  RotateCcw,
  Save,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import type {
  AppSettings,
  AudioInputDevice,
  ShortcutRegistration,
} from '../../shared/types';

interface SettingsPageProps {
  settings: AppSettings;
  microphones: AudioInputDevice[];
  shortcutRegistration: ShortcutRegistration;
  saving: boolean;
  captureActive: boolean;
  recording: boolean;
  onSave: (settings: AppSettings) => void;
  onChooseOutputFolder: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function SettingsPage({
  settings,
  microphones,
  shortcutRegistration,
  saving,
  captureActive,
  recording,
  onSave,
  onChooseOutputFolder,
  onDirtyChange,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  useEffect(() => setDraft(settings), [settings]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <div><span className="eyebrow">PERSONALIZE</span><h1>설정</h1><p>내 PC와 플레이 방식에 맞게 녹화를 조정하세요.</p></div>
        {captureActive && <span className="restart-note"><RotateCcw size={15} /> 저장하면 캡처가 한 번 재시작됩니다</span>}
      </div>

      <div className="settings-layout">
        <div className="settings-content">
          <SettingSection icon={<Monitor size={19} />} title="영상 품질" description="게임 성능과 영상 선명도의 균형을 정합니다.">
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

          <SettingSection icon={<Volume2 size={19} />} title="오디오" description="게임 소리와 음성을 하나의 동기화된 트랙으로 저장합니다.">
            <ToggleRow icon={<Volume2 size={17} />} label="시스템 오디오" hint="Windows에서 재생되는 게임 소리를 녹음합니다." checked={draft.systemAudio} onChange={(value) => patch('systemAudio', value)} />
            <ToggleRow icon={<Mic size={17} />} label="마이크" hint="선택한 입력 장치를 게임 소리와 믹싱합니다." checked={draft.microphone} onChange={(value) => patch('microphone', value)} />
            {draft.microphone && (
              <>
                <SettingRow label="입력 장치" hint={microphones.length === 0 ? '마이크 권한을 허용하면 장치 이름이 표시됩니다.' : undefined}>
                  <select value={draft.microphoneDeviceId} onChange={(event) => patch('microphoneDeviceId', event.target.value)}>
                    <option value="">Windows 기본 장치</option>
                    {microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                  </select>
                </SettingRow>
                <RangeRow label="마이크 게인" value={draft.microphoneGain} minimum={0} maximum={200} step={5} suffix="%" onChange={(value) => patch('microphoneGain', value)} />
              </>
            )}
          </SettingSection>

          <SettingSection icon={<RotateCcw size={19} />} title="즉시 리플레이" description="메모리에 유지할 최근 구간과 저장 단축키를 정합니다.">
            <RangeRow label="리플레이 길이" value={draft.replaySeconds} minimum={15} maximum={180} step={5} suffix="초" onChange={(value) => patch('replaySeconds', value)} />
            <SettingRow label="리플레이 저장 단축키" hint={!shortcutRegistration.saveReplay ? '현재 다른 앱에서 사용 중일 수 있습니다.' : '게임이 포커스된 상태에서도 동작합니다.'}>
              <HotkeyInput value={draft.hotkeys.saveReplay} onChange={(value) => setDraft((current) => ({ ...current, hotkeys: { ...current.hotkeys, saveReplay: value } }))} valid={draft.hotkeys.saveReplay === settings.hotkeys.saveReplay ? shortcutRegistration.saveReplay : null} />
            </SettingRow>
            <SettingRow label="녹화 시작/종료 단축키" hint={!shortcutRegistration.toggleRecording ? '현재 다른 앱에서 사용 중일 수 있습니다.' : undefined}>
              <HotkeyInput value={draft.hotkeys.toggleRecording} onChange={(value) => setDraft((current) => ({ ...current, hotkeys: { ...current.hotkeys, toggleRecording: value } }))} valid={draft.hotkeys.toggleRecording === settings.hotkeys.toggleRecording ? shortcutRegistration.toggleRecording : null} />
            </SettingRow>
          </SettingSection>

          <SettingSection icon={<HardDrive size={19} />} title="저장공간" description="클립 위치와 자동 정리 한도를 관리합니다.">
            <SettingRow label="저장 폴더" hint="PulseClip이 만든 파일만 자동 정리 대상이 됩니다.">
              <button type="button" className="folder-picker" onClick={onChooseOutputFolder} disabled={recording}><FolderOpen size={16} /><span>{draft.outputFolder}</span><em>변경</em></button>
            </SettingRow>
            <RangeRow label="최대 사용량" value={draft.storageLimitGb} minimum={1} maximum={500} step={1} suffix="GB" onChange={(value) => patch('storageLimitGb', value)} />
            <div className="privacy-note"><ShieldCheck size={17} /><p><strong>즐겨찾기는 자동 삭제하지 않습니다.</strong><br />한도를 넘으면 오래된 일반 클립부터 90% 수준까지 정리합니다.</p></div>
          </SettingSection>

          <SettingSection icon={<Gamepad2 size={19} />} title="앱 동작" description="시작과 알림 방식을 선택합니다.">
            <ToggleRow icon={<Power size={17} />} label="Windows 시작 시 실행" hint="트레이에 조용히 시작합니다." checked={draft.launchAtStartup} onChange={(value) => patch('launchAtStartup', value)} />
            <ToggleRow icon={<RotateCcw size={17} />} label="실행 후 자동으로 리플레이 준비" hint="마지막으로 선택한 소스를 바로 캡처합니다." checked={draft.autoStartBuffer} onChange={(value) => patch('autoStartBuffer', value)} />
            <ToggleRow icon={<Bell size={17} />} label="저장 완료 알림" hint="게임 위에 Windows 알림을 표시합니다." checked={draft.showNotifications} onChange={(value) => patch('showNotifications', value)} />
            <ToggleRow icon={<Power size={17} />} label="닫을 때 트레이로 최소화" hint="녹화 준비 상태를 유지할 수 있습니다." checked={draft.minimizeToTray} onChange={(value) => patch('minimizeToTray', value)} />
          </SettingSection>
        </div>

        <aside className="settings-summary">
          <span className="summary-icon"><Gamepad2 size={24} /></span>
          <small>현재 프로필</small>
          <h3>{draft.selectedSourceName || '캡처 소스 미선택'}</h3>
          <dl>
            <div><dt>화질</dt><dd>{draft.resolution === 'source' ? '원본' : draft.resolution} / {draft.fps} FPS</dd></div>
            <div><dt>리플레이</dt><dd>최근 {draft.replaySeconds}초</dd></div>
            <div><dt>오디오</dt><dd>{draft.systemAudio ? '게임' : ''}{draft.systemAudio && draft.microphone ? ' + ' : ''}{draft.microphone ? '마이크' : !draft.systemAudio ? '없음' : ''}</dd></div>
          </dl>
          <button type="button" className="button primary save-settings" disabled={!dirty || saving || recording} onClick={() => onSave(draft)}><Save size={17} />{saving ? '저장 중…' : '변경사항 저장'}</button>
          {recording && <p className="summary-warning">녹화를 종료한 뒤 설정을 변경할 수 있습니다.</p>}
        </aside>
      </div>
    </div>
  );
}

function SettingSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="settings-section"><header><span>{icon}</span><div><h2>{title}</h2><p>{description}</p></div></header><div className="settings-section-body">{children}</div></section>;
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

function HotkeyInput({ value, onChange, valid }: { value: string; onChange: (value: string) => void; valid: boolean | null }) {
  return <label className={`hotkey-input ${valid === false ? 'invalid' : ''}`}><Keyboard size={15} /><input aria-label="전역 단축키" aria-invalid={valid === false} value={value} maxLength={64} onChange={(event) => onChange(event.target.value)} /><span role="status">{valid === null ? '저장 시 적용' : valid ? '등록됨' : '충돌'}</span></label>;
}
