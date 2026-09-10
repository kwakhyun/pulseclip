export const GITHUB_URL = "https://github.com/kwakhyun/pulseclip";
export const SITE_URL = "https://kwakhyun.github.io/pulseclip/";
// Published installers are independent of the version being developed on main.
// Update only after these assets exist in the corresponding GitHub release.
export const RELEASE_VERSION = "0.1.4";
export const RELEASE_URL = `${GITHUB_URL}/releases/tag/v${RELEASE_VERSION}`;
export const DOWNLOAD_URL = `${GITHUB_URL}/releases/download/v${RELEASE_VERSION}/PulseClip-${RELEASE_VERSION}-Setup.exe`;
export const CHECKSUM_URL = `${GITHUB_URL}/releases/download/v${RELEASE_VERSION}/SHA256SUMS.txt`;
export const UNIVERSAL_SIZE = "약 223 MB";
export const installers = [
  { architecture: "x64", label: "Intel·AMD PC", size: "약 115 MB" },
  { architecture: "arm64", label: "Windows on Arm", size: "약 109 MB" },
].map(item => ({ ...item, url: `${GITHUB_URL}/releases/download/v${RELEASE_VERSION}/PulseClip-${RELEASE_VERSION}-${item.architecture}-Setup.exe` }));

export const description = "리플레이를 미리 켜두고 F8을 누르면 최근 플레이를 MP4로 저장하는 무료 Windows 게임 녹화 앱입니다. 계정 가입이나 클라우드 업로드가 필요 없습니다.";

export const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE_URL}#website`, url: SITE_URL, name: "PulseClip", inLanguage: "ko-KR" },
    {
      "@type": "SoftwareApplication", "@id": `${SITE_URL}#software`, name: "PulseClip",
      description, url: SITE_URL, downloadUrl: DOWNLOAD_URL,
      applicationCategory: "MultimediaApplication", operatingSystem: "Windows 10 22H2 이상, Windows 11",
      softwareVersion: RELEASE_VERSION, isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
      license: `${GITHUB_URL}/blob/main/LICENSE`, image: `${SITE_URL}assets/pulseclip-og.png`,
      featureList: ["F8 즉시 리플레이 저장", "15~180초 리플레이 길이 설정", "F9 일반 녹화", "로컬 MP4 구간 편집", "클립 이름 변경과 재생 속도 조절", "화질 프리셋", "시스템 오디오와 마이크 믹싱", "상태 점검과 저장 공간 보호"],
      sameAs: [GITHUB_URL],
    },
  ],
};
