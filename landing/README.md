# PulseClip landing page

PulseClip의 공개 배포용 한국어 랜딩 페이지입니다. 세 가지 디자인 시안의 장점을 하나의 전환 흐름으로 합쳤습니다.

- 양쪽에서 흐르는 전류형 히어로 인터랙션
- 실제 PulseClip 화면을 사용한 가벼운 3D 틸트 제품 스테이지
- 클릭과 실제 `F8` 키 입력에 반응하는 즉시 리플레이 데모
- 로컬 저장, 녹화 안전성, 사용 방법, FAQ, 최종 다운로드 CTA
- 프리렌더 HTML, canonical, Open Graph, JSON-LD, sitemap, robots, manifest

## Local development

```bash
npm install
npm run dev
```

## Production verification

```bash
npm run build
npm run test:sites
npm run preview
```

프로덕션 빌드는 `dist/client`에 정적 페이지를 만들고, Sites 호스팅에 필요한 `dist/server/index.js`와 `dist/.openai/hosting.json`도 함께 생성합니다.

## Launch dependency

다운로드 버튼은 `https://github.com/kwakhyun/pulseclip/releases/latest`에 연결되어 있습니다. 공개 전환 시 GitHub 저장소 공개 설정, 첫 Windows 릴리스 업로드, canonical 도메인의 실제 호스팅 연결이 필요합니다.
