import React from 'react';
import { SidebarToggleIcon } from './Icons';

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
      {/* Keyframe animation for subtle progress beam */}
      <style>{`
        @keyframes progressBeam {
          0% {
            left: -30%;
            width: 30%;
          }
          50% {
            left: 30%;
            width: 50%;
          }
          100% {
            left: 100%;
            width: 30%;
          }
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

      {/* Center Content: Minimalist Horizontal Rectangle Card */}
      <div style={styles.centerContainer}>
        <div style={styles.loadingCard}>
          {/* Header row: Context and Resource */}
          <div style={styles.cardHeaderRow}>
            <div style={styles.titleGroup}>
              <span style={styles.pulseDot} />
              <span style={styles.cardHeading}>Opening Shared {typeLabel}</span>
              <span style={styles.highlightUser}>with @{acceptingInvite.fromUsername}</span>
            </div>

            {acceptingInvite.title && (
              <span style={styles.resourceName} title={acceptingInvite.title}>
                "{acceptingInvite.title}"
              </span>
            )}
          </div>

          {/* Minimalist Hairline Progress Beam */}
          <div style={styles.progressBarTrack}>
            <div style={styles.progressBarBeam} />
          </div>

          {/* Primary Synchronizing Notice */}
          <p style={styles.syncMessage}>
            Please wait a moment while the shared contents are synced.....
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
    maxWidth: '520px',
    backgroundColor: '#0a0a0c',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '14px',
    padding: '22px 26px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.08)',
  },
  cardHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  pulseDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    boxShadow: '0 0 8px rgba(16, 185, 129, 0.7)',
    flexShrink: 0,
  },
  cardHeading: {
    fontSize: '13.5px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '-0.2px',
  },
  highlightUser: {
    fontSize: '12.5px',
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: 450,
  },
  resourceName: {
    fontSize: '11.5px',
    color: 'rgba(255, 255, 255, 0.4)',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressBarTrack: {
    width: '100%',
    height: '2px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '2px',
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarBeam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.9) 50%, transparent 100%)',
    animation: 'progressBeam 1.8s ease-in-out infinite',
  },
  syncMessage: {
    fontSize: '12.5px',
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 1.5,
    margin: 0,
    letterSpacing: '-0.1px',
  },
};
