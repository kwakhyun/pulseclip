import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CaretDown,
  CheckCircle,
  ClockCounterClockwise,
  CloudSlash,
  Gauge,
  GithubLogo,
  HardDrive,
  Heartbeat,
  Key,
  List,
  LockKey,
  WindowsLogo,
  X,
} from "@phosphor-icons/react";

const GITHUB_URL = "https://github.com/kwakhyun/pulseclip";
const RELEASE_VERSION = "0.1.2";
const DOWNLOAD_URL = `${GITHUB_URL}/releases/download/v${RELEASE_VERSION}/PulseClip-${RELEASE_VERSION}-Setup.exe`;
const ASSET_BASE = "./assets/";

const proofItems = [
  {
    label: "이용료",
    value: "무료",
  },
  {
    label: "저장 형식",
    value: "로컬 MP4",
  },
  {
    label: "리플레이 길이",
    value: "15–180초",
  },
  {
    label: "저장 단축키",
    value: "F8",
  },
];

const reliabilityItems = [
  {
    icon: Heartbeat,
    title: "녹화 전 상태 점검",
    description: "녹화를 시작하기 전에 코덱, 오디오, 저장 공간, 단축키 충돌을 확인합니다.",
    status: "확인됨",
  },
  {
    icon: Gauge,
    title: "저장 공간 보호",
    description: "저장 공간이 부족해지기 전에 녹화를 안전하게 종료합니다.",
    status: "작동 중",
  },
  {
    icon: ClockCounterClockwise,
    title: "중단 파일 복구",
    description: "녹화가 예기치 않게 중단되면 다음 실행 때 남은 .part 파일의 복구를 시도합니다.",
    status: "복구 가능",
  },
];

const steps = [
  {
    number: "01",
    title: "화면과 오디오 확인",
    description: "녹화할 화면이나 게임 창을 선택하고, 화질과 게임·마이크 소리를 확인합니다.",
  },
  {
    number: "02",
    title: "리플레이 켜기",
    description: "저장할 길이를 15~180초 사이에서 정하면 최근 구간을 메모리에 임시로 보관합니다.",
  },
  {
    number: "03",
    title: "명장면이 지나간 뒤 F8 누르기",
    description: "바로 전 45초가 MP4 클립으로 변환되어 동영상/PulseClip 폴더에 저장됩니다.",
  },
];

const faqs = [
  {
    question: "PulseClip은 정말 무료인가요?",
    answer:
      "PulseClip은 계정, 광고, 구독 없이 쓸 수 있는 무료 오픈소스 앱입니다. 소스 코드는 MIT 라이선스로 공개되어 있습니다.",
  },
  {
    question: "즉시 리플레이는 어떻게 작동하나요?",
    answer:
      "리플레이를 켜면 최근 15~180초 분량의 영상을 메모리에 임시로 보관합니다. 기본 설정에서는 F8을 누를 때 바로 전 45초가 MP4로 저장됩니다.",
  },
  {
    question: "녹화 파일이 서버로 업로드되나요?",
    answer:
      "아니요. 녹화한 영상과 오디오는 사용자가 지정한 로컬 폴더에만 저장되며, PulseClip은 파일을 외부 서버로 전송하지 않습니다.",
  },
  {
    question: "어떤 Windows 버전을 지원하나요?",
    answer:
      "Windows 10 22H2 이상과 Windows 11을 지원합니다. x64와 Arm64용 설치 파일을 제공합니다.",
  },
  {
    question: "게임 성능에 미치는 영향은 어느 정도인가요?",
    answer:
      "일반 녹화와 즉시 리플레이가 하나의 인코딩 과정을 공유하며, 지원되는 PC에서는 H.264 하드웨어 인코딩을 우선 사용합니다. 성능 차이는 게임과 PC 사양에 따라 달라질 수 있습니다.",
  },
  {
    question: "DRM으로 보호된 콘텐츠도 녹화할 수 있나요?",
    answer:
      "아니요. PulseClip은 보호 기능을 우회하지 않습니다. Windows나 콘텐츠 제공자가 차단한 화면은 녹화할 수 없습니다.",
  },
];

function Brand({ compact = false }) {
  return (
    <a className={`brand${compact ? " brand--compact" : ""}`} href="#top" aria-label="PulseClip 홈">
      <img src={`${ASSET_BASE}pulseclip-icon.png`} alt="" width="44" height="44" />
      <span>
        <strong>PulseClip</strong>
        {!compact && <small>PLAY. SAVE. SHARE.</small>}
      </span>
    </a>
  );
}

function DownloadButton({ className = "", compact = false }) {
  return (
    <a
      className={`button button--primary ${className}`.trim()}
      href={DOWNLOAD_URL}
      aria-label="PulseClip Windows 통합 설치 파일 바로 다운로드"
    >
      <WindowsLogo size={compact ? 18 : 22} weight="fill" aria-hidden="true" />
      <span>{compact ? `v${RELEASE_VERSION} 다운로드` : "Windows용 무료 다운로드"}</span>
      {!compact && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
    </a>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    const handleEscape = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand compact />
        {menuOpen && <button className="nav-backdrop" type="button" aria-label="메뉴 닫기" onClick={closeMenu} />}
        <nav id="mobile-navigation" className={`site-nav${menuOpen ? " is-open" : ""}`} aria-label="주요 탐색">
          <a href="#features" onClick={closeMenu}>기능</a>
          <a href="#how-it-works" onClick={closeMenu}>사용 방법</a>
          <a href="#faq" onClick={closeMenu}>FAQ</a>
          <a className="nav-github" href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
          </a>
          <DownloadButton compact className="nav-download" />
        </nav>
        <button
          className="menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={22} weight="bold" /> : <List size={22} weight="bold" />}
        </button>
      </div>
    </header>
  );
}

function Hero() {
  const handleHeroMove = (event) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--wave-x", `${x * 30}px`);
    event.currentTarget.style.setProperty("--wave-y", `${y * 14}px`);
    event.currentTarget.style.setProperty("--wave-x-back", `${x * -19.5}px`);
    event.currentTarget.style.setProperty("--wave-y-back", `${y * -9.1}px`);
  };

  return (
    <section className="hero" id="top" onPointerMove={handleHeroMove} aria-labelledby="hero-title">
      <div className="hero-current" aria-hidden="true">
        <img className="hero-wave hero-wave--front" src={`${ASSET_BASE}generated/hero-wave.png`} alt="" />
        <img className="hero-wave hero-wave--back" src={`${ASSET_BASE}generated/hero-wave.png`} alt="" />
      </div>

      <div className="hero-copy" data-reveal>
        <p className="product-meta"><span>Windows 10/11</span><span>v{RELEASE_VERSION} 공개 베타</span></p>
        <h1 id="hero-title">
          플레이에 집중하세요.
          <span>명장면은 F8로 남기세요.</span>
        </h1>
        <p className="hero-description">
          PulseClip은 무료 Windows 게임 녹화 앱입니다. 리플레이를 켜두고 명장면이 지나간 뒤 F8을 누르면,
          <br />바로 전 45초가 내 PC에 MP4 파일로 저장됩니다. 계정 가입이나 클라우드 업로드는 필요 없습니다.
        </p>

        <div className="hero-actions">
          <DownloadButton />
          <a className="button button--secondary" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <GithubLogo size={21} weight="fill" aria-hidden="true" />
            소스 코드 보기
            <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
          </a>
        </div>

        <div className="hero-trust" aria-label="PulseClip 핵심 특징">
          <span>무료</span>
          <span>계정 불필요</span>
          <span>클라우드 업로드 없음</span>
          <span>MIT 오픈소스</span>
        </div>
      </div>

      <div className="product-stage" data-reveal>
        <figure className="product-window">
          <img
            src={`${ASSET_BASE}pulseclip-app-home.jpg`}
            alt="PulseClip 홈 화면. 게임 화면 미리보기와 전체 녹화, 리플레이 준비, 최근 45초 저장 기능을 보여줍니다."
            width="1442"
            height="901"
            fetchPriority="high"
          />
        </figure>
      </div>
    </section>
  );
}

function ProofStrip() {
  return (
    <section className="proof-strip" aria-label="PulseClip 주요 사양" data-reveal>
      <dl className="content-shell proof-strip__inner">
        {proofItems.map(({ label, value }) => (
          <div className="proof-item" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ReplaySection({ isSaved, onReplay }) {
  return (
    <section className="feature-section replay-section" id="features" aria-labelledby="replay-title">
      <div className="content-shell split-layout">
        <div className="section-copy" data-reveal>
          <p className="section-label">즉시 리플레이</p>
          <h2 id="replay-title">F8을 누르면 <span>바로 전 45초가 저장됩니다.</span></h2>
          <p>
            리플레이를 켜두면 최근 구간만 메모리에 임시로 보관합니다.
            장면이 지나간 뒤 F8을 눌러도 바로 전 45초를 MP4 클립으로 저장할 수 있습니다.
          </p>
          <dl className="feature-specs">
            <div><dt>리플레이 길이</dt><dd>15–180초</dd></div>
            <div><dt>기본 코덱</dt><dd>H.264</dd></div>
            <div><dt>인코딩 횟수</dt><dd>1회</dd></div>
          </dl>
        </div>

        <div className="visual-column" data-reveal>
          <button
            className={`replay-visual${isSaved ? " is-saved" : ""}`}
            type="button"
            onClick={onReplay}
            aria-label="F8 즉시 리플레이 동작 미리보기"
            aria-pressed={isSaved}
          >
            <img src={`${ASSET_BASE}generated/f8-replay.png`} alt="" width="760" height="520" />
            <span className="replay-visual__hint">
              <Key size={17} weight="fill" /> 클릭하거나 F8을 눌러보세요
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

function PrivacySection() {
  return (
    <section className="feature-section privacy-section" aria-labelledby="privacy-title">
      <div className="content-shell split-layout split-layout--reverse">
        <div className="local-proof" data-reveal aria-label="PulseClip 로컬 저장 예시">
          <header>
            <span><HardDrive size={18} weight="duotone" /> 저장 위치</span>
            <strong>동영상\PulseClip</strong>
          </header>
          <div className="local-proof__file">
            <span>최근 클립</span>
            <strong>today_22-30-15.mp4</strong>
            <small>00:00:45 · 1080p · 로컬 파일</small>
          </div>
          <dl>
            <div><dt>계정</dt><dd>필요 없음</dd></div>
            <div><dt>외부 전송</dt><dd>없음</dd></div>
            <div><dt>자동 정리</dt><dd>용량 기준</dd></div>
          </dl>
          <p><CloudSlash size={18} weight="duotone" /> 클립을 외부 서버로 전송하지 않습니다.</p>
        </div>
        <div className="section-copy" data-reveal>
          <p className="section-label section-label--mint">저장 위치</p>
          <h2 id="privacy-title">녹화 파일은 <span>내 PC에만</span> 저장됩니다.</h2>
          <p>
            녹화 영상과 게임·마이크 소리는 사용자가 지정한 로컬 폴더에 저장됩니다.
            PulseClip은 파일을 외부 서버로 전송하지 않습니다.
          </p>
          <div className="privacy-facts">
            <p><LockKey size={20} weight="duotone" /><span><strong>로그인 없이 바로 사용</strong><small>계정을 만들거나 구독할 필요가 없습니다.</small></span></p>
            <p><CloudSlash size={20} weight="duotone" /><span><strong>외부 업로드 없음</strong><small>녹화 파일은 지정한 폴더에만 저장됩니다.</small></span></p>
          </div>
          <a className="text-link" href={`${GITHUB_URL}/blob/main/docs/SECURITY.md`} target="_blank" rel="noreferrer">
            보안과 개인정보 원칙 보기 <ArrowUpRight size={15} weight="bold" />
          </a>
        </div>
      </div>
    </section>
  );
}

function ReliabilitySection() {
  return (
    <section className="reliability-section" aria-labelledby="reliability-title">
      <div className="content-shell reliability-layout">
        <header className="section-heading" data-reveal>
          <p className="section-label">녹화 전 점검</p>
          <h2 id="reliability-title">녹화 전에<br />문제를 미리 확인합니다.</h2>
          <p>코덱, 오디오, 저장 공간, 단축키 충돌을 먼저 확인합니다. 문제가 있으면 녹화를 시작하기 전에 해결 방법을 안내합니다.</p>
        </header>
        <div className="diagnostic-panel" data-reveal>
          <header>
            <div><span>녹화 준비 상태</span><strong>녹화 가능</strong></div>
            <span className="diagnostic-summary"><CheckCircle size={17} weight="fill" /> 3개 항목 정상</span>
          </header>
          <ul>
            {reliabilityItems.map(({ icon: Icon, title, description, status }) => (
              <li key={title}>
                <Icon size={23} weight="duotone" aria-hidden="true" />
                <span><strong>{title}</strong><small>{description}</small></span>
                <em>{status}</em>
              </li>
            ))}
          </ul>
          <footer>문제가 발견되면 녹화를 시작하지 않고, 확인이 필요한 설정을 바로 보여줍니다.</footer>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="how-section" id="how-it-works" aria-labelledby="how-title">
      <div className="content-shell how-layout">
        <header className="section-heading" data-reveal>
          <p className="section-label">사용 흐름</p>
          <h2 id="how-title">한 번 설정해 두면,<br />F8로 바로 저장할 수 있습니다.</h2>
          <p>복잡한 방송용 설정은 필요 없습니다. 화면과 오디오를 확인한 뒤 리플레이를 켜두세요.</p>
        </header>
        <ol className="steps-list">
          {steps.map(({ number, title, description }) => (
            <li data-reveal key={number}>
              <span className="step-number">{number}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
              {number === "03" && <kbd>F8</kbd>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-title">
      <div className="content-shell faq-layout">
        <header className="section-heading" data-reveal>
          <p className="section-label">설치 전 확인</p>
          <h2 id="faq-title">설치 전에<br />확인하세요.</h2>
          <p>지원 환경과 저장 방식, 성능, 보안 정책을 미리 확인해 보세요. 자세한 내용은 GitHub에 공개되어 있습니다.</p>
          <a className="text-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub 저장소 보기 <ArrowUpRight size={15} weight="bold" />
          </a>
        </header>
        <div className="faq-list">
          {faqs.map(({ question, answer }, index) => (
            <details data-reveal key={question} open={index === 0}>
              <summary>
                <span>{question}</span>
                <CaretDown size={19} weight="bold" aria-hidden="true" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="final-cta" aria-labelledby="final-cta-title">
      <div className="final-cta__current" aria-hidden="true">
        <img src={`${ASSET_BASE}generated/hero-wave.png`} alt="" />
      </div>
      <div className="content-shell final-cta__content" data-reveal>
        <img className="cta-icon" src={`${ASSET_BASE}pulseclip-icon.png`} alt="" width="70" height="70" loading="lazy" />
        <p className="release-line">Windows 10/11 · v{RELEASE_VERSION}</p>
        <h2 id="final-cta-title">명장면을 놓쳤다면,<br /><span>F8을 누르세요.</span></h2>
        <p>바로 전 45초를 MP4로 내 PC에 저장합니다.</p>
        <div className="hero-actions">
          <DownloadButton />
          <a className="button button--secondary" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <GithubLogo size={21} weight="fill" /> GitHub에서 보기
          </a>
        </div>
        <small>Windows 10 22H2 이상 · Windows 11 · x64 / arm64</small>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="content-shell footer-inner">
        <Brand />
        <p>계정이나 클라우드 없이 게임의 결정적인 순간을 내 PC에 저장하는 무료 녹화 앱입니다.</p>
        <nav aria-label="보조 탐색">
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License</a>
          <a href={`${GITHUB_URL}/blob/main/PRIVACY.md`} target="_blank" rel="noreferrer">개인정보 처리방침</a>
          <a href={`${GITHUB_URL}/blob/main/docs/SECURITY.md`} target="_blank" rel="noreferrer">보안</a>
          <a href={`${GITHUB_URL}/blob/main/THIRD_PARTY_NOTICES.md`} target="_blank" rel="noreferrer">오픈소스 고지</a>
        </nav>
        <small>© 2026 PulseClip</small>
      </div>
    </footer>
  );
}

export function App() {
  const [isSaved, setIsSaved] = useState(false);
  const replayTimerRef = useRef(null);

  const triggerReplay = useCallback(() => {
    window.clearTimeout(replayTimerRef.current);
    setIsSaved(false);
    window.requestAnimationFrame(() => setIsSaved(true));
    replayTimerRef.current = window.setTimeout(() => setIsSaved(false), 3200);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "F8") {
        event.preventDefault();
        triggerReplay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(replayTimerRef.current);
    };
  }, [triggerReplay]);

  useEffect(() => {
    const items = document.querySelectorAll("[data-reveal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <Header />
      <main id="main-content">
        <Hero />
        <ProofStrip />
        <ReplaySection isSaved={isSaved} onReplay={triggerReplay} />
        <PrivacySection />
        <ReliabilitySection />
        <HowItWorks />
        <FaqSection />
        <FinalCta />
      </main>
      <Footer />
      <div className={`demo-toast${isSaved ? " is-visible" : ""}`} role="status" aria-live="polite">
        <CheckCircle size={23} weight="fill" />
        <span><strong>F8 동작을 확인했습니다</strong><small>실제 앱에서는 바로 전 45초가 내 PC에 저장됩니다.</small></span>
      </div>
    </>
  );
}
