import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CaretDown,
  CheckCircle,
  ClockCounterClockwise,
  CloudSlash,
  GameController,
  Gauge,
  GithubLogo,
  HardDrive,
  Heartbeat,
  Key,
  List,
  LockKey,
  MonitorPlay,
  ShieldCheck,
  Sparkle,
  Waveform,
  WindowsLogo,
  X,
} from "@phosphor-icons/react";

const GITHUB_URL = "https://github.com/kwakhyun/pulseclip";
const DOWNLOAD_URL = `${GITHUB_URL}/releases/latest`;
const ASSET_BASE = "./assets/";

const proofItems = [
  {
    icon: Sparkle,
    title: "완전 무료",
    description: "계정·광고·구독 없이",
    tone: "mint",
  },
  {
    icon: ShieldCheck,
    title: "로컬 저장",
    description: "영상은 내 PC 안에만",
    tone: "mint",
  },
  {
    icon: Key,
    title: "F8 즉시 저장",
    description: "최근 순간을 바로 클립으로",
    tone: "blue",
  },
];

const reliabilityItems = [
  {
    icon: Heartbeat,
    title: "녹화 전 상태 점검",
    description: "코덱, 오디오, 저장공간, 단축키 충돌을 시작 전에 확인합니다.",
  },
  {
    icon: Gauge,
    title: "디스크 안전 가드",
    description: "남은 공간을 확인하고 임계치에 닿기 전에 녹화를 안전하게 마칩니다.",
  },
  {
    icon: ClockCounterClockwise,
    title: "중단 파일 복구",
    description: "예기치 않은 종료 뒤에도 남은 .part 파일의 복구를 다음 실행에서 시도합니다.",
  },
];

const steps = [
  {
    number: "01",
    icon: MonitorPlay,
    title: "게임 화면을 선택하세요",
    description: "전체 화면이나 원하는 게임 창을 고르고 화질과 오디오를 확인합니다.",
  },
  {
    number: "02",
    icon: Waveform,
    title: "리플레이를 준비하세요",
    description: "15~180초 중 원하는 길이를 정하면 최근 구간만 순환 보관합니다.",
  },
  {
    number: "03",
    icon: HardDrive,
    title: "F8로 순간을 남기세요",
    description: "결정적인 순간에 F8. 기본 45초가 MP4 클립으로 로컬 보관함에 저장됩니다.",
  },
];

const faqs = [
  {
    question: "PulseClip은 정말 무료인가요?",
    answer:
      "네. PulseClip은 계정, 광고, 구독 없이 사용할 수 있는 MIT 라이선스 오픈소스 프로젝트입니다.",
  },
  {
    question: "즉시 리플레이는 어떻게 작동하나요?",
    answer:
      "리플레이 준비를 켜면 최근 15~180초의 인코딩 데이터만 메모리에서 순환 보관합니다. 기본 설정에서는 F8을 누르는 순간 최근 45초를 MP4로 저장합니다.",
  },
  {
    question: "녹화 파일이 서버로 업로드되나요?",
    answer:
      "아니요. 기본 설정에서 외부 서버로 네트워크 요청을 보내지 않으며, 영상과 오디오는 사용자가 지정한 로컬 폴더에만 저장됩니다.",
  },
  {
    question: "어떤 Windows 버전을 지원하나요?",
    answer:
      "Windows 10 22H2 이상과 Windows 11을 대상으로 하며, x64와 arm64 설치 패키지를 지원하도록 구성되어 있습니다.",
  },
  {
    question: "게임 성능 부담은 어떻게 줄였나요?",
    answer:
      "일반 녹화와 즉시 리플레이가 하나의 인코딩 파이프라인을 공유하고, 가능한 환경에서는 H.264 하드웨어 인코딩을 우선 사용합니다. 실제 성능은 게임과 PC 구성에 따라 달라질 수 있습니다.",
  },
  {
    question: "DRM이나 보호된 콘텐츠도 녹화할 수 있나요?",
    answer:
      "아니요. PulseClip은 보호 기능을 우회하지 않으며 Windows 또는 콘텐츠 제공자가 차단한 프레임은 녹화하지 않습니다.",
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
      target="_blank"
      rel="noreferrer"
      aria-label="PulseClip Windows 설치 파일 다운로드 페이지 열기"
    >
      <WindowsLogo size={compact ? 18 : 22} weight="fill" aria-hidden="true" />
      <span>{compact ? "무료 다운로드" : "Windows용 무료 다운로드"}</span>
      {!compact && <ArrowRight size={18} weight="bold" aria-hidden="true" />}
    </a>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand compact />
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

  const handleProductMove = (event) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--tilt-x", `${-2 + y * -3}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${-4 + x * 6}deg`);
    event.currentTarget.style.setProperty("--glow-x", `${50 + x * 16}%`);
  };

  const resetProduct = (event) => {
    event.currentTarget.style.setProperty("--tilt-x", "-2deg");
    event.currentTarget.style.setProperty("--tilt-y", "-4deg");
    event.currentTarget.style.setProperty("--glow-x", "50%");
  };

  return (
    <section className="hero" id="top" onPointerMove={handleHeroMove} aria-labelledby="hero-title">
      <div className="hero-current" aria-hidden="true">
        <img className="hero-wave hero-wave--front" src={`${ASSET_BASE}generated/hero-wave.png`} alt="" />
        <img className="hero-wave hero-wave--back" src={`${ASSET_BASE}generated/hero-wave.png`} alt="" />
      </div>

      <div className="hero-copy" data-reveal>
        <p className="eyebrow"><GameController size={15} weight="fill" /> GAME CAPTURE STUDIO</p>
        <h1 id="hero-title">
          게임은 계속.
          <span>기록은 이미 완료.</span>
        </h1>
        <p className="hero-description">
          녹화를 켜지 못한 결정적인 순간까지, F8 한 번으로 최근 플레이를 저장하세요.
          <br />계정도 업로드도 필요 없는 무료 Windows 게임 녹화 앱입니다.
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
          <span><CheckCircle size={16} weight="fill" /> 무계정</span>
          <span><CheckCircle size={16} weight="fill" /> 무광고</span>
          <span><CheckCircle size={16} weight="fill" /> MIT 오픈소스</span>
        </div>
      </div>

      <div
        className="product-stage"
        onPointerMove={handleProductMove}
        onPointerLeave={resetProduct}
        data-reveal
      >
        <figure className="product-window">
          <img
            src={`${ASSET_BASE}pulseclip-app-home.jpg`}
            alt="PulseClip 홈 화면. 게임 화면 미리보기와 전체 녹화, 리플레이 준비, 최근 45초 저장 기능을 보여줍니다."
            width="1442"
            height="901"
            fetchPriority="high"
          />
        </figure>
        <div className="floating-proof floating-proof--local">
          <ShieldCheck size={20} weight="fill" aria-hidden="true" />
          <span><small>로컬 우선</small><strong>내 PC에만 저장</strong></span>
        </div>
        <div className="floating-proof floating-proof--ready">
          <Waveform size={20} weight="bold" aria-hidden="true" />
          <span><small>리플레이 버퍼</small><strong>준비 완료</strong></span>
        </div>
      </div>
    </section>
  );
}

function ProofStrip() {
  return (
    <section className="proof-strip" aria-label="PulseClip의 핵심 가치" data-reveal>
      <div className="content-shell proof-strip__inner">
        {proofItems.map(({ icon: Icon, title, description, tone }) => (
          <article className="proof-item" key={title}>
            <span className={`proof-icon proof-icon--${tone}`}><Icon size={25} weight="duotone" /></span>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReplaySection({ isSaved, onReplay }) {
  return (
    <section className="feature-section replay-section" id="features" aria-labelledby="replay-title">
      <div className="content-shell split-layout">
        <div className="section-copy" data-reveal>
          <p className="eyebrow">INSTANT REPLAY</p>
          <h2 id="replay-title"><span>45초</span> 전으로 돌아가는 가장 빠른 키.</h2>
          <p>
            리플레이 준비를 켜두면 최근 구간만 가볍게 순환 보관합니다.
            결정적인 순간이 지나간 뒤에도 F8 한 번이면 기본 45초가 바로 클립이 됩니다.
          </p>
          <ul className="check-list">
            <li><CheckCircle size={18} weight="fill" /> 15~180초 리플레이 길이 설정</li>
            <li><CheckCircle size={18} weight="fill" /> H.264 하드웨어 인코딩 우선</li>
            <li><CheckCircle size={18} weight="fill" /> 일반 녹화와 단일 인코딩 파이프라인 공유</li>
          </ul>
          <button className="text-action" type="button" onClick={onReplay}>
            <Key size={19} weight="duotone" /> F8 저장을 직접 눌러보세요 <ArrowRight size={17} weight="bold" />
          </button>
        </div>

        <div className="visual-column" data-reveal>
          <button
            className={`replay-visual${isSaved ? " is-saved" : ""}`}
            type="button"
            onClick={onReplay}
            aria-label="F8 즉시 리플레이 저장 데모 실행"
            aria-pressed={isSaved}
          >
            <img src={`${ASSET_BASE}generated/f8-replay.png`} alt="" width="760" height="520" />
            <span className="replay-visual__hint">
              <Key size={17} weight="fill" /> 클릭하거나 키보드의 F8을 눌러보세요
            </span>
          </button>
          <p className={`save-status${isSaved ? " is-visible" : ""}`} aria-live="polite">
            <CheckCircle size={18} weight="fill" /> 최근 45초 클립을 저장했습니다
          </p>
        </div>
      </div>
    </section>
  );
}

function PrivacySection() {
  return (
    <section className="feature-section privacy-section" aria-labelledby="privacy-title">
      <div className="content-shell split-layout split-layout--reverse">
        <div className="visual-column vault-visual" data-reveal>
          <img
            src={`${ASSET_BASE}generated/local-vault.png`}
            alt="로컬 PC 저장을 상징하는 보안 저장소 일러스트"
            width="760"
            height="520"
            loading="lazy"
          />
        </div>
        <div className="section-copy" data-reveal>
          <p className="eyebrow eyebrow--mint">SAFE RECORDING</p>
          <h2 id="privacy-title">영상은 <span>내 PC 밖으로</span> 나가지 않습니다.</h2>
          <p>
            캡처 영상, 게임 소리, 마이크는 사용자가 지정한 로컬 폴더에만 저장됩니다.
            기본 설정에서는 외부 서버로 전송하지 않습니다.
          </p>
          <ul className="check-list check-list--mint">
            <li><LockKey size={18} weight="fill" /> 기본 저장 위치: 동영상/PulseClip</li>
            <li><CloudSlash size={18} weight="fill" /> 클라우드 업로드와 계정 로그인 없음</li>
            <li><HardDrive size={18} weight="fill" /> 저장 한도와 즐겨찾기 보호 자동 정리</li>
          </ul>
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
      <div className="content-shell">
        <header className="section-heading" data-reveal>
          <p className="eyebrow">RELIABLE CAPTURE</p>
          <h2 id="reliability-title">녹화 버튼을 누르기 전에,<br />실패할 이유부터 점검합니다.</h2>
          <p>좋은 녹화 앱은 화려한 기능보다 먼저 클립을 잃지 않아야 합니다.</p>
        </header>
        <div className="reliability-grid">
          {reliabilityItems.map(({ icon: Icon, title, description }, index) => (
            <article className="reliability-card" data-reveal key={title}>
              <span className="card-index">0{index + 1}</span>
              <Icon size={29} weight="duotone" aria-hidden="true" />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="how-section" id="how-it-works" aria-labelledby="how-title">
      <div className="content-shell">
        <header className="section-heading section-heading--center" data-reveal>
          <p className="eyebrow">HOW IT WORKS</p>
          <h2 id="how-title">세 단계면, 다음 명장면을 놓치지 않습니다.</h2>
          <p>복잡한 방송 설정 없이 게임 화면과 저장할 순간에만 집중하세요.</p>
        </header>
        <ol className="steps-list">
          {steps.map(({ number, icon: Icon, title, description }) => (
            <li data-reveal key={number}>
              <span className="step-number">{number}</span>
              <span className="step-icon"><Icon size={28} weight="duotone" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
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
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title">다운로드 전에<br />궁금한 것들.</h2>
          <p>더 자세한 구현과 보안 정책은 GitHub에서 모두 확인할 수 있습니다.</p>
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
        <p className="eyebrow">PULSECLIP FOR WINDOWS</p>
        <h2 id="final-cta-title">게임은 계속하세요.<br /><span>기록은 PulseClip이 준비할게요.</span></h2>
        <p>무료 · 로컬 저장 · F8 즉시 리플레이</p>
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
        <p>계정과 클라우드 없이, 게임의 결정적인 순간을 내 PC에 남기는 무료 녹화 앱.</p>
        <nav aria-label="보조 탐색">
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License</a>
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
        <span><strong>최근 45초 저장 완료</strong><small>내 클립 보관함에 안전하게 저장됐어요.</small></span>
      </div>
    </>
  );
}
