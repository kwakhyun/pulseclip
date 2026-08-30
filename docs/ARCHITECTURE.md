# PulseClip 아키텍처

## 프로세스 경계

```text
Windows Desktop Capture + Loopback Audio
                    │
              sandboxed renderer
                    │
      MediaStream → WebCodecs (H.264/AAC)
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

## 미디어 파이프라인

`MediaStreamVideoTrackSource`와 `MediaStreamAudioTrackSource`가 캡처 트랙을 한 번만 인코딩한다. 인코딩 콜백에서 받은 패킷은 다음 두 소비자에 전달한다.

- 리플레이 링: 설정 길이 + 키프레임 여유분만 보관한다. 저장 시 목표 시점 이전의 가장 가까운 키프레임부터 타임스탬프를 0 기준으로 복제해 새 MP4로 리먹싱한다.
- 일반 녹화: 링의 최신 키프레임과 후속 패킷으로 파일을 즉시 시드한 뒤 새 패킷을 fragmented MP4에 추가하고 IPC 쓰기 스트림으로 디스크에 순차 기록한다. 짧은 녹화도 다음 키프레임을 기다리지 않으며 시작 프레임을 잃지 않는다.

이 구조는 화면을 두 번 인코딩하지 않으며, 일반 녹화 길이와 무관하게 메모리 사용량이 일정하다.

## 저장 구조

```text
Documents/PulseClip/
  PulseClip_2026-08-28_21-30-05_Replay.mp4
  PulseClip_2026-08-28_21-30-05_Replay.mp4.pulseclip.json
```

설정과 로그는 Electron `userData` 아래에 저장한다. 영상과 사이드카 메타데이터는 사용자가 선택한 폴더에 둔다. 활성 파일은 `.part` 확장자를 사용하고 완료 후 원자적으로 이름을 바꾼다.

## 보안 경계

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- 프로덕션 렌더러는 `file://`가 아니라 허용된 빌드 산출물만 제공하는 `pulseclip://app`에서 로드
- 경로 디코딩 실패, NUL 바이트, 상위 경로 이동과 앱 자산 루트 이탈을 프로토콜 경계에서 거부
- ASAR 무결성 검증과 `OnlyLoadAppFromAsar`를 활성화하고 Run-as-Node, `NODE_OPTIONS`, CLI inspector 퓨즈를 비활성화
- preload에서 기능별 최소 API만 노출
- 모든 IPC 발신 프레임과 인자 검증
- 외부 탐색과 임의 URL 로드 차단
- 미디어 프로토콜은 저장소에 등록된 clip ID만 허용
- 출력 경로는 설정에서 선택한 디렉터리 아래에서만 생성
- 캡처 요청 토큰은 한 번 사용하고 10초 후 만료

## 장애 처리

- 소스 트랙 종료, 인코더 오류, 저장공간 오류를 사용자 상태와 로그에 동시에 반영한다.
- 실패한 쓰기 세션은 닫고 `.part`를 보존한다.
- 다음 실행에서 비어 있지 않은 fragmented MP4를 복구 클립으로 등록한다.
- 저장 한도 정리는 활성 파일과 즐겨찾기를 건드리지 않는다.
