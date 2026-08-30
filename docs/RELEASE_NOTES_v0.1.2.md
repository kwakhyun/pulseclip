# PulseClip v0.1.2 — Electron Security Update

`v0.1.2`는 패키징된 데스크톱 앱의 코드 로딩 경계와 Electron 런타임 보안을 강화한 패치 릴리스입니다.

## 주요 변경

- 프로덕션 UI를 권한이 큰 `file://` 대신 격리된 `pulseclip://app` 프로토콜에서 로드
- 앱 자산 요청의 잘못된 인코딩, NUL 바이트, 슬래시·역슬래시 경로 순회와 빌드 루트 이탈 차단
- 패키징된 `app.asar`의 Windows 무결성 검증과 ASAR 전용 앱 코드 로딩 활성화
- `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, CLI inspector 진입점 비활성화
- 더 이상 필요하지 않은 `file://` 추가 권한 비활성화
- 패키징 직후 실행 파일의 Electron 보안 퓨즈 9개를 읽어 검증하는 스크립트와 CI 게이트 추가
- 렌더러 로드 성공·실패 구조화 로그를 추가해 프로토콜 장애 진단성 향상

## 검증

- 데스크톱 타입 검사, 38개 단위 테스트, 프로덕션 빌드, x64 Windows 패키징
- 패키징된 x64·Arm64 실행 파일의 Electron 보안 퓨즈 9개 기대값 검증
- 격리된 사용자 프로필에서 `pulseclip://app/index.html` 렌더러 로드 스모크 테스트
- 데스크톱 프로덕션 의존성 감사: 알려진 취약점 0건

## 설치 파일

- `PulseClip-0.1.2-Setup.exe`: x64·Arm64 통합 설치 파일
- `PulseClip-0.1.2-x64-Setup.exe`: 일반 Intel/AMD Windows PC
- `PulseClip-0.1.2-arm64-Setup.exe`: Windows on Arm PC

이번 공개 베타는 아직 Authenticode로 서명되지 않았습니다. Windows SmartScreen 경고가 나타날 수 있으므로 함께 제공되는 `SHA256SUMS.txt`로 무결성을 확인해 주세요. 자동 업데이트는 신뢰된 코드 서명과 HTTPS 업데이트 피드가 준비될 때까지 비활성화되어 있습니다.
