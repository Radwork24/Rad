import React from 'react';
import { RadLogoMark, SidebarToggleIcon } from './Icons';

interface AcceptingInviteData {
  id: string;
  fromUsername: string;
  title?: string;
  type: 'chat' | 'notebook' | 'document';
}

interface SharedInviteLoadingViewProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  acceptingInvite: AcceptingInviteData;
}

export const SharedInviteLoadingView: React.FC<SharedInviteLoadingViewProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  isRightSidebarOpen = false,
  onToggleRightSidebar,
  acceptingInvite,
}) => {
  const isNotebook = acceptingInvite.type === 'notebook';
  const isDoc = acceptingInvite.type === 'document';
  const typeLabel = isDoc ? 'Document' : isNotebook ? 'Notebook' : 'Chat';

  return (
    <main style={styles.mainWrapper}>
      {/* Keyframe animations */}
      <style>{`
        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.1), 0 0 60px rgba(255, 255, 255, 0.04);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 35px rgba(255, 255, 255, 0.22), 0 0 90px rgba(255, 255, 255, 0.1);
            transform: scale(1.03);
          }
        }
        @keyframes progressBeam {
          0% {
            left: -35%;
            width: 35%;
          }
          50% {
            left: 25%;
            width: 55%;
          }
          100% {
            left: 100%;
            width: 35%;
          }
        }
        @keyframes spinSlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Top Bar Navigation */}
      <header style={styles.topBar}>
        <div style={styles.topBarLeft}>
          {!isSidebarOpen && (
            <button
              onClick={onToggleSidebar}
              style={styles.sidebarOpenBtn}
              title="Open sidebar"
              aria-label="Open sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}
        </div>

        <div style={styles.topBarCenter}>
          <div style={styles.topCenterPill}>
            <span style={styles.greenPulseDot} />
            <span>Connecting Shared Workspace…</span>
          </div>
        </div>

        <div style={styles.topBarRight}>
          {!isRightSidebarOpen && onToggleRightSidebar && (
            <button
              onClick={onToggleRightSidebar}
              style={styles.sidebarOpenBtn}
              title="Open right sidebar"
              aria-label="Open right sidebar"
            >
              <SidebarToggleIcon size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Center Content: Glowing Loading Card */}
      <div style={styles.centerContainer}>
        <div style={styles.loadingCard}>
          {/* Animated Logo Container with Glow */}
          <div style={styles.logoRingContainer}>
            <div style={styles.logoPulsingRing}>
              <RadLogoMark size={36} />
            </div>
          </div>

          {/* Status Badge */}
          <div style={styles.statusBadge}>
            <span style={styles.badgeDot} />
            <span>Invite Accepted</span>
          </div>

          {/* Title & Description */}
          <h2 style={styles.cardHeading}>Opening Shared {typeLabel}</h2>
          <p style={styles.cardSubheading}>
            Connecting with <span style={styles.highlightUser}>@{acceptingInvite.fromUsername}</span>
          </p>

          {/* Shared Resource Name Chip */}
          {acceptingInvite.title && (
            <div style={styles.resourceChip}>
              <span style={styles.resourceTypeIcon}>
                {isDoc ? '📄' : isNotebook ? '📁' : '💬'}
              </span>
              <span style={styles.resourceTitle} title={acceptingInvite.title}>
                {acceptingInvite.title}
              </span>
            </div>
          )}

          {/* Glowing Animated Progress Bar */}
          <div style={styles.progressBarWrapper}>
            <div style={styles.progressBarTrack}>
              <div style={styles.progressBarBeam} />
            </div>
          </div>

          {/* Step Indicators */}
          <div style={styles.stepsContainer}>
            <div style={styles.stepRow}>
              <div style={styles.stepCheckDone}>✓</div>
              <span style={styles.stepLabelDone}>Collaboration invite verified</span>
            </div>
            <div style={styles.stepRow}>
              <div style={styles.stepSpinnerActive}>
                <div style={styles.miniSpinnerCircle} />
              </div>
              <span style={styles.stepLabelActive}>
                Loading conversation & shared notes from Workspace…
              </span>
            </div>
            <div style={styles.stepRow}>
              <div style={styles.stepPendingDot}>○</div>
              <span style={styles.stepLabelPending}>Opening shared view</span>
            </div>
          </div>

          <p style={styles.reassuranceText}>
            Please wait a moment while the shared contents are synced. This will display automatically.
          </p>
        </div>
      </div>
    </main>
  );
};

const styles: Record<string, React.CSSProperties> = {
  mainWrapper: {
    flex: 1,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#000000',
    color: '#ffffff',
    overflow: 'hidden',
    position: 'relative',
    userSelect: 'none',
  },
  topBar: {
    height: '52px',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    zIndex: 10,
    flexShrink: 0,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    minWidth: '40px',
  },
  topBarCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenterPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '20px',
    padding: '4px 12px',
    fontSize: '11.5px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  greenPulseDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    boxShadow: '0 0 8px #10b981',
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: '40px',
  },
  sidebarOpenBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.65)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s ease',
  },
  centerContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  loadingCard: {
    width: '100%',
    maxWidth: '460px',
    backgroundColor: 'rgba(10, 10, 12, 0.82)',
    backdropFilter: 'blur(30px)',
    border: '1.5px solid rgba(255, 255, 255, 0.16)',
    borderRadius: '20px',
    padding: '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85), 0 0 32px rgba(255, 255, 255, 0.04)',
  },
  logoRingContainer: {
    marginBottom: '18px',
  },
  logoPulsingRing: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255, 255, 255, 0.22)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'pulseGlow 2.4s ease-in-out infinite',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    border: '1px solid rgba(16, 185, 129, 0.35)',
    color: '#34d399',
    borderRadius: '20px',
    padding: '3px 10px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    marginBottom: '14px',
  },
  badgeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#34d399',
    boxShadow: '0 0 6px #34d399',
  },
  cardHeading: {
    fontSize: '20px',
    fontWeight: 650,
    color: '#ffffff',
    margin: '0 0 6px 0',
    letterSpacing: '-0.3px',
  },
  cardSubheading: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.55)',
    margin: '0 0 16px 0',
  },
  highlightUser: {
    color: '#ffffff',
    fontWeight: 600,
  },
  resourceChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '10px',
    padding: '7px 14px',
    maxWidth: '85%',
    marginBottom: '22px',
  },
  resourceTypeIcon: {
    fontSize: '13px',
  },
  resourceTitle: {
    fontSize: '12.5px',
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressBarWrapper: {
    width: '100%',
    marginBottom: '22px',
  },
  progressBarTrack: {
    width: '100%',
    height: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '3px',
    position: 'relative',
    overflow: 'hidden',
  },
  progressBarBeam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderRadius: '3px',
    boxShadow: '0 0 12px rgba(255, 255, 255, 0.9), 0 0 24px rgba(255, 255, 255, 0.6)',
    animation: 'progressBeam 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
  },
  stepsContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    padding: '12px 16px',
    marginBottom: '18px',
    textAlign: 'left',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  stepCheckDone: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#34d399',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    flexShrink: 0,
  },
  stepLabelDone: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  stepSpinnerActive: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  miniSpinnerCircle: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    border: '1.5px solid rgba(255, 255, 255, 0.2)',
    borderTopColor: '#ffffff',
    animation: 'spinSlow 0.9s linear infinite',
  },
  stepLabelActive: {
    fontSize: '12px',
    color: '#ffffff',
    fontWeight: 500,
  },
  stepPendingDot: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
    flexShrink: 0,
  },
  stepLabelPending: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.35)',
  },
  reassuranceText: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    margin: 0,
    lineHeight: 1.45,
  },
};

