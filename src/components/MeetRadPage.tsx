import React, { useState, useEffect, useRef } from 'react';
import radLogo from '../assets/logo.png';

export interface RadFeatureSlide {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  specs: { label: string; value: string }[];
  accentColor?: string;
}

interface MeetRadPageProps {
  onBack: () => void;
  onGetStarted?: () => void;
  currentUser?: { username?: string } | null;
}

const FEATURE_SLIDES: RadFeatureSlide[] = [
  {
    id: 'core-intelligence',
    title: 'Rad 1.1 Flash',
    subtitle: 'Next-Gen Multimodal AI Intelligence',
    badge: 'Flagship Core',
    specs: [
      {
        label: 'Neural Engine',
        value: '0ms Rapid Router delivering high-throughput streaming and deep context retention across complex sessions.',
      },
      {
        label: 'Mathematical Synthesis',
        value: 'Native KaTeX typesetting, algorithmic code execution, and multi-turn inductive reasoning.',
      },
      {
        label: 'Zero Cost & Limits',
        value: '100% Free Forever. Unlimited daily requests, zero rate-limit throttling, and zero subscription paywalls.',
      },
    ],
  },
  {
    id: 'document-ocr',
    title: 'Omnimodal Document Engine',
    subtitle: 'Universal File Extraction & Analysis',
    badge: 'Universal OCR',
    specs: [
      {
        label: 'Supported Formats',
        value: 'Deep parsing for multi-page PDFs, PowerPoint slides, Word DOCX, Excel spreadsheets, and CSV data tables.',
      },
      {
        label: 'Interactive Viewer',
        value: 'Floating omnidirectional document viewport with one-click page-to-chat snapshot capture.',
      },
      {
        label: 'Vision Understanding',
        value: 'Analyzes high-resolution circuit schematics, diagrams, handwritten equations, and whiteboards.',
      },
    ],
  },
  {
    id: 'collaborative-rooms',
    title: 'Collaborative Study Spaces',
    subtitle: 'Real-Time Synchronized Peer Knowledge',
    badge: 'Shared Thinking',
    specs: [
      {
        label: 'Live Collaboration',
        value: 'Invite friends into shared study rooms with live presence and synchronized AI conversation context.',
      },
      {
        label: 'Peer Calling',
        value: 'Integrated floating peer audio calling and private direct messaging beside the AI assistant.',
      },
      {
        label: 'Focus Atmosphere',
        value: 'Built-in streaming lofi music audio player and pure OLED black interface engineered for deep focus.',
      },
    ],
  },
];

export const MeetRadPage: React.FC<MeetRadPageProps> = ({
  onBack,
  onGetStarted,
  currentUser,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchStartY = useRef<number>(0);

  const currentSlide = FEATURE_SLIDES[activeIndex];

  const handleAction = () => {
    if (onGetStarted) {
      onGetStarted();
    } else {
      onBack();
    }
  };

  const switchSlide = (nextIndex: number) => {
    if (nextIndex === activeIndex || isTransitioning) return;
    if (nextIndex < 0 || nextIndex >= FEATURE_SLIDES.length) return;

    setIsTransitioning(true);
    setTimeout(() => {
      setActiveIndex(nextIndex);
      setIsTransitioning(false);
    }, 240);
  };

  const handleNext = () => {
    if (activeIndex < FEATURE_SLIDES.length - 1) {
      switchSlide(activeIndex + 1);
    } else {
      switchSlide(0);
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      switchSlide(activeIndex - 1);
    } else {
      switchSlide(FEATURE_SLIDES.length - 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, isTransitioning]);

  // Wheel scroll handler (fade up to next slide)
  const handleWheel = (e: React.WheelEvent) => {
    if (isTransitioning) return;
    if (Math.abs(e.deltaY) < 30) return;

    if (e.deltaY > 0) {
      handleNext();
    } else {
      handlePrev();
    }
  };

  // Mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isTransitioning) return;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(deltaY) > 40) {
      if (deltaY > 0) handleNext();
      else handlePrev();
    }
  };

  return (
    <div
      style={styles.pageWrapper}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Subtle Back Button in Top-Left */}
      <button onClick={onBack} style={styles.minimalBackBtn} title="Back">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Back</span>
      </button>

      {/* Minimal Top-Right Action Pill */}
      <button onClick={handleAction} style={styles.topActionBtn} title="Enter Rad">
        <span>{currentUser?.username ? 'Back to Chat' : 'Get Started'}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>

      {/* Main Stage — Strictly in the center of the page */}
      <div
        style={{
          ...styles.centerStage,
          opacity: isTransitioning ? 0 : 1,
          transform: isTransitioning ? 'translateY(16px)' : 'translateY(0)',
          transition: 'opacity 0.32s ease, transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Left Side: Canva Card with Glowing Rad Mark */}
        <div style={styles.canvaCard}>
          <div style={styles.canvaInner}>
            <div style={styles.canvaGlow} />
            <img
              src={radLogo}
              alt="Rad Logo"
              style={styles.canvaLogo}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
            <div style={styles.canvaInfoBadge}>
              <span style={styles.canvaBadgeText}>{currentSlide.badge}</span>
            </div>
          </div>
        </div>

        {/* Right Side: Clean Typography Lines */}
        <div style={styles.textSection}>
          <div style={styles.headerRow}>
            <h2 style={styles.featureTitle}>{currentSlide.title}</h2>
            <span style={styles.featureSubtitle}>{currentSlide.subtitle}</span>
          </div>

          <div style={styles.dividerLine} />

          <div style={styles.contentGroup}>
            {currentSlide.specs.map((item, idx) => (
              <div key={idx} style={styles.lineItem}>
                <span style={styles.lineLabel}>{item.label}</span>
                <p style={styles.lineValue}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Minimal Bottom Switcher Indicator */}
          <div style={styles.footerRow}>
            <span style={styles.counterText}>
              0{activeIndex + 1} / 0{FEATURE_SLIDES.length}
            </span>
            <div style={styles.switchBtns}>
              <button onClick={handlePrev} style={styles.switchArrow} title="Previous (↑ Arrow)">
                ↑
              </button>
              <button onClick={handleNext} style={styles.switchArrow} title="Next (↓ Arrow)">
                ↓
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000000',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    userSelect: 'none',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  minimalBackBtn: {
    position: 'absolute',
    top: '28px',
    left: '32px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '6px',
    transition: 'color 0.15s ease',
    zIndex: 10,
  },
  topActionBtn: {
    position: 'absolute',
    top: '28px',
    right: '32px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '7px 14px',
    borderRadius: '20px',
    transition: 'all 0.18s ease',
    zIndex: 10,
  },
  centerStage: {
    display: 'flex',
    alignItems: 'center',
    gap: '48px',
    maxWidth: '720px',
    width: '90%',
    boxSizing: 'border-box',
  },
  canvaCard: {
    width: '230px',
    height: '290px',
    backgroundColor: '#080808',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)',
  },
  canvaInner: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    position: 'relative',
  },
  canvaGlow: {
    position: 'absolute',
    width: '130px',
    height: '130px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    filter: 'blur(36px)',
    pointerEvents: 'none',
  },
  canvaLogo: {
    width: '64px',
    height: '64px',
    objectFit: 'contain',
    borderRadius: '12px',
    zIndex: 1,
    filter: 'drop-shadow(0 0 16px rgba(255, 255, 255, 0.25))',
  },
  canvaInfoBadge: {
    zIndex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  canvaBadgeText: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: 500,
    letterSpacing: '0.2px',
  },
  textSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  featureTitle: {
    fontSize: '22px',
    fontWeight: 650,
    color: '#ffffff',
    letterSpacing: '-0.4px',
    margin: 0,
  },
  featureSubtitle: {
    fontSize: '12.5px',
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: 400,
    letterSpacing: '-0.1px',
  },
  dividerLine: {
    height: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    margin: '18px 0',
    width: '100%',
  },
  contentGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  lineItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  lineLabel: {
    fontSize: '10.5px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.35)',
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
  },
  lineValue: {
    fontSize: '12.5px',
    color: 'rgba(255, 255, 255, 0.82)',
    lineHeight: 1.5,
    margin: 0,
    letterSpacing: '-0.1px',
  },
  footerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '22px',
    paddingTop: '14px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  counterText: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.3)',
    fontWeight: 550,
    letterSpacing: '1px',
  },
  switchBtns: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  switchArrow: {
    width: '26px',
    height: '26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: 'rgba(255, 255, 255, 0.55)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: 0,
    transition: 'all 0.15s ease',
  },
};
