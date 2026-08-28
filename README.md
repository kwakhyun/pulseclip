# PulseClip

![PulseClip icon](assets/brand/pulseclip-icon-master.png)

[공식 웹사이트](https://kwakhyun.github.io/pulseclip/) · [Windows 다운로드](https://github.com/kwakhyun/pulseclip/releases/latest) · [기능 고도화 로드맵](docs/FEATURE_ROADMAP.md) · [아이콘 제작 및 산출물](assets/brand/PULSECLIP_ICON.md)

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

일반 사용자는 [최신 Windows 설치 파일](https://github.com/kwakhyun/pulseclip/releases/latest)을 내려받아 설치할 수 있습니다. `PulseClip-0.1.0-Setup.exe`는 x64와 arm64를 함께 포함하며, 용량을 줄이려면 아키텍처별 설치 파일을 선택하세요.

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
landing        SEO 프리렌더 랜딩 페이지와 GitHub Pages 빌드
```

상세 내용은 [제품 기획](docs/PRODUCT.md), [아키텍처](docs/ARCHITECTURE.md), [보안 모델](docs/SECURITY.md), [릴리스 가이드](docs/RELEASE.md)를 참고하세요.

## 공개 베타 안내

`v0.1.0`은 공개 베타이며 아직 Authenticode 코드 서명이 없습니다. Windows SmartScreen이 게시자를 확인할 수 없다는 경고를 표시할 수 있으므로 Release에 첨부된 `SHA256SUMS.txt`로 무결성을 확인하세요. 신뢰된 코드 서명, 자동 업데이트 피드, Intel·NVIDIA·AMD 실기기 장시간 매트릭스 테스트는 다음 출시 고도화 항목입니다. DRM 또는 보호된 콘텐츠의 캡처 우회는 지원하지 않습니다.

일반 문제는 [GitHub Issues](https://github.com/kwakhyun/pulseclip/issues)에, 보안 문제는 저장소의 비공개 취약점 신고 기능으로 알려주세요.

## 라이선스

PulseClip 소스는 MIT License로 제공됩니다. 번들되는 오픈 소스 구성요소는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 확인하세요.
