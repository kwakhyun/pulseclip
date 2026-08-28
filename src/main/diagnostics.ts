import type {
  AppSettings,
  DiagnosticCheck,
  DiagnosticReport,
  DiagnosticStatus,
  DiskSpaceStatus,
  RendererDiagnosticSnapshot,
  ShortcutRegistration,
} from '../shared/types';

interface DiagnosticContext {
  appVersion: string;
  platform: string;
  architecture: string;
  osRelease: string;
  electronVersion: string;
  diskSpace: DiskSpaceStatus;
  renderer: RendererDiagnosticSnapshot;
  shortcuts: ShortcutRegistration;
  settings: Pick<AppSettings, 'systemAudio' | 'microphone'>;
  outputWritable: boolean;
  outputError?: string;
}

export function buildDiagnosticReport(context: DiagnosticContext): DiagnosticReport {
  const checks: DiagnosticCheck[] = [
    {
      id: 'output-folder',
      title: '저장 폴더 쓰기',
      status: context.outputWritable ? 'pass' : 'fail',
      summary: context.outputWritable
        ? '테스트 파일 생성과 디스크 동기화에 성공했습니다.'
        : '저장 폴더에 안전하게 쓸 수 없습니다.',
      detail: context.outputError,
    },
    diskCheck(context.diskSpace),
    {
      id: 'capture-source',
      title: '캡처 소스',
      status: context.renderer.captureSourceCount > 0
        ? context.renderer.selectedSourceAvailable ? 'pass' : 'warning'
        : 'fail',
      summary: context.renderer.captureSourceCount === 0
        ? '사용 가능한 화면이나 창을 찾지 못했습니다.'
        : context.renderer.selectedSourceAvailable
          ? `${context.renderer.captureSourceCount}개의 소스를 찾았고 선택한 소스가 준비되었습니다.`
          : `${context.renderer.captureSourceCount}개의 소스를 찾았지만 기존 선택 소스는 다시 선택해야 합니다.`,
    },
    {
      id: 'webcodecs',
      title: '영상 인코더',
      status: !context.renderer.webCodecsAvailable
        ? 'fail'
        : context.renderer.h264Supported ? 'pass' : 'warning',
      summary: !context.renderer.webCodecsAvailable
        ? '필수 WebCodecs 비디오 인코더를 사용할 수 없습니다.'
        : context.renderer.h264Supported
          ? '1080p H.264 실시간 인코딩 구성을 사용할 수 있습니다.'
          : 'H.264를 사용할 수 없어 호환 가능한 VP9 또는 VP8 코덱으로 전환할 수 있습니다.',
      detail: '실제 하드웨어 경로 선택 여부는 녹화 시작 후 런타임 텔레메트리로 확인합니다.',
    },
    {
      id: 'audio-codec',
      title: '오디오 인코더',
      status: !context.settings.systemAudio && !context.settings.microphone
        ? 'pass'
        : context.renderer.aacSupported ? 'pass' : 'warning',
      summary: !context.settings.systemAudio && !context.settings.microphone
        ? '현재 설정에서는 오디오 녹음을 사용하지 않습니다.'
        : context.renderer.aacSupported
          ? '48kHz 스테레오 AAC 구성을 사용할 수 있습니다.'
          : 'AAC 구성을 확인하지 못해 대체 코덱이 사용될 수 있습니다.',
    },
    {
      id: 'microphone',
      title: '마이크 장치',
      status: !context.settings.microphone || context.renderer.microphoneCount > 0
        ? 'pass'
        : 'warning',
      summary: !context.settings.microphone
        ? '마이크 녹음이 꺼져 있습니다.'
        : context.renderer.microphoneCount > 0
          ? `${context.renderer.microphoneCount}개의 입력 장치를 찾았습니다.`
          : '마이크 녹음이 켜져 있지만 입력 장치를 찾지 못했습니다.',
    },
    {
      id: 'hotkeys',
      title: '전역 단축키',
      status: context.shortcuts.saveReplay && context.shortcuts.toggleRecording
        ? 'pass'
        : 'warning',
      summary: context.shortcuts.saveReplay && context.shortcuts.toggleRecording
        ? '리플레이 저장과 전체 녹화 단축키가 모두 등록되었습니다.'
        : '일부 단축키를 다른 앱이 사용 중일 수 있습니다.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    overall: overallStatus(checks),
    checks,
    diskSpace: context.diskSpace,
    system: {
      appVersion: context.appVersion,
      platform: context.platform,
      architecture: context.architecture,
      osRelease: context.osRelease,
      electronVersion: context.electronVersion,
    },
  };
}

export function overallStatus(checks: Pick<DiagnosticCheck, 'status'>[]): DiagnosticStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'pass';
}

function diskCheck(disk: DiskSpaceStatus): DiagnosticCheck {
  const status: DiagnosticStatus = disk.health === 'healthy'
    ? 'pass'
    : disk.health === 'low'
      ? 'warning'
      : 'fail';
  return {
    id: 'disk-space',
    title: '디스크 안전 공간',
    status,
    summary: disk.summary,
  };
}
