import { ArrowRight, ArrowUpRight, WindowsLogo } from "@phosphor-icons/react";
import { CHECKSUM_URL, DOWNLOAD_URL, installers, RELEASE_URL, RELEASE_VERSION, UNIVERSAL_SIZE } from "./release.js";

export function DownloadButton({ className = "", compact = false }) {
  return <a className={`button button--primary ${className}`.trim()} href={DOWNLOAD_URL}>
    <WindowsLogo size={compact ? 18 : 22} weight="fill" aria-hidden="true" />
    <span>{compact ? `v${RELEASE_VERSION} 다운로드` : "Windows용 무료 다운로드"}</span>
    {!compact && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
  </a>;
}

export function DownloadDetails({ full = false }) {
  return <div className={`download-details${full ? " download-details--full" : ""}`}>
    <p>v{RELEASE_VERSION} 공개 베타 · x64 / Arm64 통합 설치 · {UNIVERSAL_SIZE}</p>
    <p className="download-signing">아직 코드 서명이 없어 Windows SmartScreen 경고가 나타날 수 있습니다.</p>
    <a className="text-link" href={RELEASE_URL}>릴리스 안내와 파일 확인 <ArrowUpRight size={14} aria-hidden="true" /></a>
    {full && <>
      <div className="installer-options" aria-label="아키텍처별 설치 파일">
        {installers.map(item => <a key={item.architecture} href={item.url}>
          <span><strong>{item.architecture === "arm64" ? "Arm64" : "x64"} 설치 파일</strong><small>{item.label}</small></span>
          <span>{item.size}<ArrowRight size={17} aria-hidden="true" /></span>
        </a>)}
      </div>
      <p>PC 종류를 모르겠다면 위의 통합 설치 파일을 선택하세요. <a href={CHECKSUM_URL}>SHA256 체크섬</a></p>
    </>}
  </div>;
}
