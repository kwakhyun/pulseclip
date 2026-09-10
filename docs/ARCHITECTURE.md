# PulseClip 아키텍처

## 프로세스 경계

```text
Windows Desktop Capture + Loopback Audio
                    │
              sandboxed renderer
                    │
      MediaStream → WebCodecs (우선 H.264/AAC, 호환 폴백)
                    │
        ┌───────────┴────────────┐
        │                        │
encoded replay ring       packet remux writer
        │                        │
instant replay remux      append-only fMP4 stream
        └───────────┬────────────┘
                    │ typed, validated IPC
               Electron main
                    │
        atomic files + metadata + quota
```

렌더러는 화면과 오디오 권한 및 WebCodecs만 사용한다. Node 통합은 비활성화하고 샌드박스를 켠다. 파일시스템, 전역 단축키, 창 제어, 트레이, 설정 저장은 메인 프로세스만 수행한다.

프로덕션 시작 순서는 전용 프로토콜 등록 완료 → 메인 창 생성 → 권한·IPC 핸들러 등록 → 렌더러 로드 순으로 직렬화한다. 렌더러는 IPC가 준비된 뒤에만 bootstrap을 요청하며, 완료 여부를 구조화 로그에 남긴다.

## 미디어 파이프라인

`MediaStreamVideoTrackSource`와 `MediaStreamAudioTrackSource`가 캡처 트랙을 한 번만 인코딩한다. 영상은 H.264(AVC)를 우선하고 VP9, VP8 순으로 폴백하며, 오디오는 AAC를 우선하고 Opus로 폴백한다. 인코딩 콜백에서 받은 패킷은 다음 두 소비자에 전달한다.

- 리플레이 링: 설정 길이 + 키프레임 여유분만 보관한다. 저장 시 목표 시점 이전의 가장 가까운 키프레임부터 타임스탬프를 0 기준으로 복제해 새 MP4로 리먹싱한다.
- 일반 녹화: 링의 최신 키프레임과 후속 패킷으로 파일을 즉시 시드한 뒤 새 패킷을 fragmented MP4에 추가하고 IPC 쓰기 스트림으로 디스크에 순차 기록한다. 짧은 녹화도 다음 키프레임을 기다리지 않으며 시작 프레임을 잃지 않는다.

이 구조는 화면을 두 번 인코딩하지 않으며, 일반 녹화 길이와 무관하게 메모리 사용량이 일정하다.

## 저장 구조

```text
Videos/PulseClip/
  PulseClip_2026-08-28_21-30-05_Replay.mp4
  PulseClip_2026-08-28_21-30-05_Replay.mp4.pulseclip.json
```

설정과 로그는 Electron `userData` 아래에 저장한다. 영상과 사이드카 메타데이터의 기본 위치는 Windows `동영상/PulseClip`이며, 사용자가 설정에서 다른 폴더를 선택할 수 있다. 활성 파일은 `.part` 확장자를 사용하고 완료 후 원자적으로 이름을 바꾼다.

## 보안 경계

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- 프로덕션 렌더러는 `file://`가 아니라 허용된 빌드 산출물만 제공하는 `pulseclip://app`에서 로드
- 경로 디코딩 실패, NUL 바이트, 상위 경로 이동과 앱 자산 루트 이탈을 프로토콜 경계에서 거부
- ASAR 무결성 검증과 `OnlyLoadAppFromAsar`를 활성화하고 Run-as-Node, `NODE_OPTIONS`, CLI inspector 퓨즈를 비활성화
- preload에서 기능별 최소 API만 노출
- 모든 IPC 발신 프레임과 인자 검증
- 클립·쓰기 세션 ID는 정규 UUID만 허용하고 불리언 입력은 문자열·숫자로 강제 변환하지 않음
- 외부 탐색과 임의 URL 로드 차단
- 미디어 프로토콜은 저장소에 등록된 clip ID만 허용
- 출력 경로는 설정에서 선택한 디렉터리 아래에서만 생성
- 캡처 요청 토큰은 한 번 사용하고 10초 후 만료

## 장애 처리

- 소스 트랙 종료, 인코더 오류, 저장공간 오류를 사용자 상태와 로그에 동시에 반영한다.
- 실패한 쓰기 세션은 닫고 `.part`를 보존한다.
- 다음 실행에서 비어 있지 않은 fragmented MP4를 복구 클립으로 등록한다.
- 저장 한도 정리는 활성 파일과 즐겨찾기를 건드리지 않는다.

## v0.1.4 구조와 동시성

- `shared/async-queue.ts`: 실패 후에도 다음 작업을 처리하는 직렬 실행 큐. 설정과 사이드카 변경의 갱신 유실을 방지한다.
- `main/write-session-manager.ts`: `.part`를 배타적으로 예약하고 부분 쓰기를 반복 처리한다. 중복 완료 요청은 같은 작업을 기다린다. 파일 저장 중 저장 폴더 변경은 차단한다.
- `renderer/capture/LivePacketWriter.ts`: 일반 녹화 패킷 큐. 대기 데이터가 64 MiB를 넘으면 오류를 알리고 녹화를 종료한다.
- `renderer/capture/IpcAppendSink.ts`: 모든 출력 청크를 8 MiB 이하로 나누어 순서대로 IPC에 전달한다.
- `main/media-response.ts`: GET/HEAD 및 단일 바이트 범위를 검증하고 필요한 파일 구간을 64 KiB 버퍼로 스트리밍한다. 유효한 부분 요청은 206, 잘못된 범위는 416으로 응답한다.
- `renderer/capture/trim-clip.ts`: 동일 출처의 `pulseclip://app/media/<clip-id>`를 필요한 범위만 읽어 MP4 구간 편집. 원본 ID를 잠금 처리하고 편집 취소 시 임시 출력을 제거한다. 영상 또는 오디오가 지원되지 않으면 트랙을 조용히 버리지 않고 편집을 실패시킨다.
- `renderer/hooks/useClipEditor.ts`: 진행률, 취소, 종료 전 정리. `hooks/useDialogFocus.ts`는 중첩 대화상자와 배경 키보드 포커스를 관리한다.
- `renderer/components`: 소스 선택, 초기 설정, 확인, 플레이어 대화상자를 독립 파일로 분리했다. 클립 카드, 지연 영상 로딩, 목록 정렬도 분리했다.
- `renderer/styles`: 기본 화면·보관함·설정·진단·대화상자·접근성·공통 추가 제어로 나눴다. `styles.css`는 진입점이다.
- `main/update-service.ts`: 사용자가 요청할 때 공식 GitHub 안정 릴리스를 조회한다. 네트워크 제한 시간과 중복 요청 병합·5분 캐시를 적용하며 실행 파일 자동 설치는 하지 않는다.

미디어 프레임률은 `MediaStreamVideoTrackSource` 한 곳에서만 조정한다. 변환 단계에서 중복 조정하면 비동기 패딩 프레임이 GOP 경계를 넘어 역순으로 들어갈 수 있어 제거했다. 시작 중 종료, 저장 중 종료와 반복 종료는 진행 중 Promise를 기다려 처리한다.

## 검증

`npm run verify`는 타입·미사용 코드 검사, 단위 테스트, 프로덕션 번들 검증을 수행한다. 이후 `npm run test:desktop`으로 실제 Electron과 동일 출처 미디어 프로토콜·IPC·WebCodecs·MP4 편집을 확인한다. 테스트는 격리된 임시 저장소와 합성 영상/오디오를 사용하며 사용자 화면·마이크·설정·녹화 파일에 접근하지 않는다.
