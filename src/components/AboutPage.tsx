import React, { useState, useEffect, useRef } from 'react';

export interface Developer {
  id: string;
  name: string;
  role: string;
  specialization: string;
  contribution: string;
  image?: string;
}

interface AboutPageProps {
  onBack: () => void;
  currentUser?: { username?: string } | null;
}

const DEVELOPERS: Developer[] = [
  {
    id: 'mohit-gurjar',
    name: 'Mohit Gurjar',
    role: 'Creator & Lead Architect',
    specialization: 'Multimodal AI Inference, Real-Time WebRTC Architecture & Distributed Streaming Systems.',
    contribution: 'Engineered Rad from ground up — built the 0ms Rapid Router, omnidirectional document viewer with live page snapshots, and multi-user study rooms.',
  },
  {
    id: 'abhay-singh',
    name: 'Abhay Singh',
    role: 'Core AI & Systems Engineer',
    specialization: 'High-Resolution Document OCR, LaTeX / KaTeX Mathematical Notation & Sliding-Window Memory Pipeline.',
    contribution: 'Constructed universal multi-format document parsing (PDF, DOCX, PPTX, CSV), LaTeX formula synthesis, and intelligent interactive chunking.',
  },
];

export const AboutPage: React.FC<AboutPageProps> = ({ onBack }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchStartY = useRef<number>(0);

  const currentDev = DEVELOPERS[activeIndex];

  const switchDeveloper = (nextIndex: number) => {
    if (nextIndex === activeIndex || isTransitioning) return;
    if (nextIndex < 0 || nextIndex >= DEVELOPERS.length) return;

    setIsTransitioning(true);
    setTimeout(() => {
      setActiveIndex(nextIndex);
      setIsTransitioning(false);
    }, 240);
  };

  const handleNext = () => {
    if (activeIndex < DEVELOPERS.length - 1) {
      switchDeveloper(activeIndex + 1);
    } else {
      switchDeveloper(0);
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      switchDeveloper(activeIndex - 1);
    } else {
      switchDeveloper(DEVELOPERS.length - 1);
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

  // Wheel scroll handler (fade up to next developer)
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
      <button onClick={onBack} style={styles.minimalBackBtn} title="Back to Login">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Back</span>
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
        {/* Left Side: Canva Image Frame (Compact & Minimal) */}
        <div style={styles.canvaCard}>
          {currentDev.image ? (
            <img src={currentDev.image} alt={currentDev.name} style={styles.canvaImg} />
          ) : (
            <div style={styles.canvaPlaceholder}>
              <div style={styles.canvaGlow} />
              <span style={styles.canvaMonogram}>{currentDev.name.charAt(0)}</span>
              <span style={styles.canvaSubLabel}>{currentDev.name}</span>
            </div>
          )}
        </div>

        {/* Right Side: Clean Typography Lines */}
        <div style={styles.textSection}>
          <div style={styles.headerRow}>
            <h2 style={styles.devName}>{currentDev.name}</h2>
            <span style={styles.devRole}>{currentDev.role}</span>
          </div>

          <div style={styles.dividerLine} />

          <div style={styles.contentGroup}>
            <div style={styles.lineItem}>
              <span style={styles.lineLabel}>Specialization</span>
              <p style={styles.lineValue}>{currentDev.specialization}</p>
            </div>

            <div style={styles.lineItem}>
              <span style={styles.lineLabel}>Contribution</span>
              <p style={styles.lineValue}>{currentDev.contribution}</p>
            </div>
          </div>

          {/* Minimal Bottom Switcher Indicator */}
          <div style={styles.footerRow}>
            <span style={styles.counterText}>
              0{activeIndex + 1} / 0{DEVELOPERS.length}
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
  canvaImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  canvaPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    position: 'relative',
  },
  canvaGlow: {
    position: 'absolute',
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    filter: 'blur(32px)',
    pointerEvents: 'none',
  },
  canvaMonogram: {
    fontSize: '48px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-1px',
    zIndex: 1,
  },
  canvaSubLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.35)',
    fontWeight: 500,
    zIndex: 1,
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
  devName: {
    fontSize: '22px',
    fontWeight: 650,
    color: '#ffffff',
    letterSpacing: '-0.4px',
    margin: 0,
  },
  devRole: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: 450,
  },
  dividerLine: {
    height: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    margin: '18px 0',
    width: '100%',
  },
  contentGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  lineItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  lineLabel: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
    color: 'rgba(255, 255, 255, 0.38)',
  },
  lineValue: {
    fontSize: '13px',
    lineHeight: 1.55,
    color: 'rgba(255, 255, 255, 0.78)',
    margin: 0,
    fontWeight: 400,
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
    fontWeight: 500,
    letterSpacing: '0.4px',
  },
  switchBtns: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  switchArrow: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    color: 'rgba(255, 255, 255, 0.55)',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '11px',
    transition: 'all 0.15s ease',
  },
};
