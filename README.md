# PulseClip

![PulseClip icon](assets/brand/pulseclip-icon-master.png)

[기능 고도화 로드맵](docs/FEATURE_ROADMAP.md) · [아이콘 제작 및 산출물](assets/brand/PULSECLIP_ICON.md)

PulseClip은 Windows용 로컬 우선 게임 녹화 앱입니다. 화면 또는 게임 창을 한 번만 인코딩하면서 즉시 리플레이 버퍼와 일반 녹화를 함께 제공하고, 결과를 로컬 MP4 보관함에서 바로 재생·관리합니다.

## 핵심 기능

- 화면/창 선택과 실시간 미리보기
- H.264 우선 WebCodecs 인코딩과 AAC 시스템 오디오
- 15~180초 순환 리플레이 및 F8 즉시 저장
- F9 일반 녹화 시작/종료와 append-only fragmented MP4 저장
- 시스템 오디오와 선택적 마이크 믹싱
- 클립 검색, 필터, 즐겨찾기, 내장 플레이어, 파일 위치 열기
- 저장 공간 한도와 즐겨찾기 보호 자동 정리
- 녹화 전 디스크 여유 공간 검사와 임계치 도달 시 안전 종료
- 캡처 소스·시스템 오디오·마이크 연결 해제 자동 복구
- 저장 폴더, 코덱, 장치, 단축키를 확인하는 상태 점검 센터
- 중단된 `.part` 파일 복구, 원자적 완료 처리, 구조화 로그
- 전역 단축키, 시스템 트레이, 시작 프로그램 옵션
- 샌드박스 렌더러와 검증된 최소 IPC 브리지

## 빠른 시작

Windows 10 22H2 이상, Node.js 22 이상이 필요합니다.

```powershell
npm ci
npm run dev
```

검증과 패키징:

```powershell
npm run verify
npm run package
npm run dist
```

- `npm run package`: 설치하지 않고 실행 가능한 x64 앱을 `release/win-unpacked/`에 생성
- `npm run dist`: x64/arm64 NSIS 설치 프로그램을 `release/`에 생성
- 기본 저장 위치: Windows `동영상/PulseClip`
- 로그 위치: Electron `userData/logs/pulseclip.log`

## 구조

```text
src/main       파일, 트레이, 단축키, 권한, 보안 IPC
src/preload    샌드박스용 최소 타입 브리지
src/renderer   React UI와 단일 인코딩 캡처 엔진
src/shared     타입, IPC 계약, 설정 검증
docs           제품·아키텍처·보안·릴리스 문서
```

상세 내용은 [제품 기획](docs/PRODUCT.md), [아키텍처](docs/ARCHITECTURE.md), [보안 모델](docs/SECURITY.md), [릴리스 가이드](docs/RELEASE.md)를 참고하세요.

## 출시 전 운영 항목

소스와 패키지는 배포 가능한 프로덕션 기반을 갖추고 있지만 공개 상용 배포 전에는 조직의 코드 서명 인증서, 개인정보 처리방침/지원 채널, 자동 업데이트 피드, Intel·NVIDIA·AMD 실기기 장시간 매트릭스 테스트가 필요합니다. DRM 또는 보호된 콘텐츠의 캡처 우회는 지원하지 않습니다.

## 라이선스

PulseClip 소스는 MIT License로 제공됩니다. 번들되는 오픈 소스 구성요소는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 확인하세요.
