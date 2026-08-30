# PulseClip v0.1.3 — Startup Reliability Update

`v0.1.3`은 앱 시작 순서와 IPC 입력 경계를 강화하고, 초기화 실패 시 복구 가능한 사용자 화면을 제공하는 패치 릴리스입니다.

## 주요 변경

- `pulseclip://` 프로토콜 등록 완료를 기다린 뒤 메인 창을 생성하도록 초기화 순서 수정
- 권한·IPC 핸들러 등록을 마친 뒤 렌더러를 로드해 초기 bootstrap 호출 경쟁 조건 제거
- 초기화 실패 로그를 디스크에 반영한 뒤 앱을 종료하도록 치명적 오류 처리 보강
- 클립·쓰기 세션 ID를 정규 UUID로 검증하고, IPC 불리언 인자의 문자열·숫자 강제 변환 제거
- 초기 bootstrap 실패 시 무한 로딩 대신 오류 원인, 다시 시도, 종료 동작 제공
- 클립 목록 갱신, 리플레이 종료, 파일 위치·외부 플레이어 열기의 비동기 오류를 사용자에게 표시
- 렌더러 bootstrap 완료 로그를 추가해 패키지 시작 상태를 진단 가능하게 개선

## 검증

- 데스크톱 타입 검사, 44개 단위 테스트, 프로덕션 빌드, x64 Windows 패키징
- 패키징된 실행 파일의 Electron 보안 퓨즈 9개 기대값 검증
- 격리된 사용자 프로필에서 전용 프로토콜 로드, IPC bootstrap 완료, 앱 초기화 스모크 테스트
- 데스크톱 프로덕션 의존성 감사: 알려진 취약점 0건

## 설치 파일

- `PulseClip-0.1.3-Setup.exe`: x64·Arm64 통합 설치 파일
- `PulseClip-0.1.3-x64-Setup.exe`: 일반 Intel/AMD Windows PC
- `PulseClip-0.1.3-arm64-Setup.exe`: Windows on Arm PC

이번 공개 베타는 아직 Authenticode로 서명되지 않았습니다. Windows SmartScreen 경고가 나타날 수 있으므로 함께 제공되는 `SHA256SUMS.txt`로 무결성을 확인해 주세요. 자동 업데이트는 신뢰된 코드 서명과 HTTPS 업데이트 피드가 준비될 때까지 비활성화되어 있습니다.
