import React, { useState, useEffect } from 'react';
import type { ActiveCallState } from '../services/callService';
import {
  endVoiceCall,
  answerVoiceCall,
  rejectVoiceCall,
  toggleLocalMute,
} from '../services/callService';
import {
  PhoneIcon,
  PhoneOffIcon,
  MicrophoneIcon,
  MicOffIcon,
} from './Icons';

interface FloatingCallWidgetProps {
  call: ActiveCallState | null;
  onCallEnded: () => void;
}

export const FloatingCallWidget: React.FC<FloatingCallWidgetProps> = ({
  call,
  onCallEnded,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [durationSec, setDurationSec] = useState(0);

  // Timer for connected call duration
  useEffect(() => {
    let interval: number | null = null;
    if (call?.status === 'connected') {
      const start = call.startTime || Date.now();
      const updateTimer = () => {
        setDurationSec(Math.floor((Date.now() - start) / 1000));
      };
      updateTimer();
      interval = window.setInterval(updateTimer, 1000);
    } else {
      setDurationSec(0);
    }
    return () => {
      if (interval !== null) clearInterval(interval);
    };
  }, [call?.status, call?.startTime]);

  // Reset mute state when call changes
  useEffect(() => {
    setIsMuted(false);
    setIsMinimized(false);
  }, [call?.callId]);

  if (!call) return null;

  const otherUser = call.isIncoming ? call.caller : call.receiver;
  const initial = otherUser ? otherUser.charAt(0).toUpperCase() : '?';

  const formatDuration = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    toggleLocalMute(nextMuted);
  };

  const handleEndCall = async () => {
    await endVoiceCall();
    onCallEnded();
  };

  const handleAnswerCall = async () => {
    try {
      await answerVoiceCall(call.callId, () => {});
    } catch (err: any) {
      alert(err?.message || 'Could not answer call. Please check microphone permissions.');
      onCallEnded();
    }
  };

  const handleRejectCall = async () => {
    await rejectVoiceCall(call.callId);
    onCallEnded();
  };

  // 1. Incoming Call Dialog Popup
  if (call.isIncoming && call.status === 'ringing') {
    return (
      <div style={styles.incomingModalBackdrop}>
        <div style={styles.incomingCard}>
          <div style={styles.incomingAvatarWrapper}>
            <div style={styles.incomingAvatar}>{initial}</div>
            <div style={styles.incomingPulseRing} />
          </div>

          <div style={styles.incomingInfo}>
            <h3 style={styles.incomingTitle}>{otherUser}</h3>
            <p style={styles.incomingSubtitle}>Incoming Voice Call...</p>
          </div>

          <div style={styles.incomingActions}>
            <button
              onClick={handleRejectCall}
              style={styles.declineBtn}
              title="Decline Call"
            >
              <PhoneOffIcon size={18} />
              <span>Decline</span>
            </button>

            <button
              onClick={handleAnswerCall}
              style={styles.acceptBtn}
              title="Accept Call"
            >
              <PhoneIcon size={18} />
              <span>Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active Outgoing or Connected Call Floating Bar
  return (
    <div
      style={{
        ...styles.dockContainer,
        ...(isMinimized ? styles.dockContainerMinimized : {}),
      }}
    >
      {/* Minimized Compact Bar */}
      {isMinimized ? (
        <div style={styles.minimizedContent}>
          <div style={styles.avatarMini}>{initial}</div>
          <span style={styles.minimizedText}>
            {call.status === 'connected' ? formatDuration(durationSec) : 'Calling...'}
          </span>
          <button
            onClick={() => setIsMinimized(false)}
            style={styles.iconMiniBtn}
            title="Expand Call Dock"
          >
            ↗
          </button>
          <button
            onClick={handleEndCall}
            style={styles.endCallMiniBtn}
            title="End Call"
          >
            <PhoneOffIcon size={14} />
          </button>
        </div>
      ) : (
        /* Full Floating Call Dock */
        <div style={styles.fullDockContent}>
          {/* Header Row */}
          <div style={styles.dockHeader}>
            <div style={styles.peerInfoRow}>
              <div style={styles.peerAvatarCircle}>
                {initial}
                {call.status === 'connected' && (
                  <span style={styles.onlineCallBadge} />
                )}
              </div>
              <div style={styles.peerDetails}>
                <span style={styles.peerName}>@{otherUser}</span>
                <span style={styles.callStatusText}>
                  {call.status === 'connected'
                    ? `Connected • ${formatDuration(durationSec)}`
                    : call.status === 'ringing'
                    ? 'Calling... (Ringing)'
                    : 'Call ending...'}
                </span>
              </div>
            </div>

            {/* Minimize button */}
            <button
              onClick={() => setIsMinimized(true)}
              style={styles.minimizeBtn}
              title="Minimize call bar"
            >
              —
            </button>
          </div>

          {/* Live Waveform Indicator (active when connected) */}
          {call.status === 'connected' && (
            <div style={styles.waveformContainer}>
              <div style={{ ...styles.waveBar, animationDelay: '0.1s' }} />
              <div style={{ ...styles.waveBar, animationDelay: '0.3s' }} />
              <div style={{ ...styles.waveBar, animationDelay: '0.2s' }} />
              <div style={{ ...styles.waveBar, animationDelay: '0.4s' }} />
              <div style={{ ...styles.waveBar, animationDelay: '0.15s' }} />
              <div style={{ ...styles.waveBar, animationDelay: '0.35s' }} />
            </div>
          )}

          {/* Call Control Buttons */}
          <div style={styles.controlsRow}>
            <button
              onClick={handleToggleMute}
              style={{
                ...styles.controlBtn,
                ...(isMuted ? styles.controlBtnMuted : {}),
              }}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOffIcon size={18} /> : <MicrophoneIcon size={18} />}
              <span>{isMuted ? 'Muted' : 'Mute'}</span>
            </button>

            <button
              onClick={handleEndCall}
              style={styles.endCallBtn}
              title="Hang up"
            >
              <PhoneOffIcon size={18} />
              <span>End Call</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  /* Incoming Call Modal */
  incomingModalBackdrop: {
    position: 'fixed',
    top: '24px',
    right: '24px',
    zIndex: 9999,
    animation: 'slideDown 0.3s ease',
  },
  incomingCard: {
    width: '320px',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '16px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.9), 0 0 20px rgba(16, 185, 129, 0.2)',
  },
  incomingAvatarWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingAvatar: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: '#000000',
    border: '2px solid rgba(255, 255, 255, 0.4)',
    color: '#ffffff',
    fontSize: '22px',
    fontWeight: 650,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  incomingPulseRing: {
    position: 'absolute',
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    border: '2px solid rgba(16, 185, 129, 0.6)',
    animation: 'pulse 1.4s infinite ease-out',
    zIndex: 1,
  },
  incomingInfo: {
    textAlign: 'center',
  },
  incomingTitle: {
    fontSize: '17px',
    fontWeight: 600,
    color: '#ffffff',
    margin: 0,
  },
  incomingSubtitle: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: '3px',
  },
  incomingActions: {
    display: 'flex',
    gap: '12px',
    width: '100%',
    marginTop: '4px',
  },
  declineBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: '10px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    transition: 'opacity 0.2s',
  },
  acceptBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: '10px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    transition: 'opacity 0.2s',
  },

  /* Floating Dock (Bottom Right) */
  dockContainer: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 9998,
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255, 255, 255, 0.22)',
    borderRadius: '14px',
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.85), 0 0 16px rgba(59, 130, 246, 0.15)',
    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
    overflow: 'hidden',
    width: '280px',
  },
  dockContainerMinimized: {
    width: 'auto',
    borderRadius: '30px',
  },
  fullDockContent: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  dockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peerInfoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  peerAvatarCircle: {
    position: 'relative',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255, 255, 255, 0.35)',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineCallBadge: {
    position: 'absolute',
    bottom: '0',
    right: '0',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    border: '1.5px solid #000000',
  },
  peerDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  peerName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
  },
  callStatusText: {
    fontSize: '11.5px',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  minimizeBtn: {
    color: 'rgba(255, 255, 255, 0.6)',
    padding: '4px 6px',
    borderRadius: '4px',
    fontSize: '13px',
    lineHeight: 1,
    cursor: 'pointer',
  },

  /* Waveform */
  waveformContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: '24px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  waveBar: {
    width: '3px',
    height: '14px',
    backgroundColor: '#3b82f6',
    borderRadius: '2px',
    animation: 'soundWave 1.1s ease-in-out infinite alternate',
  },

  /* Controls */
  controlsRow: {
    display: 'flex',
    gap: '8px',
  },
  controlBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 10px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  controlBtnMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: '#ef4444',
    color: '#ef4444',
  },
  endCallBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 10px',
    borderRadius: '8px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    transition: 'background-color 0.2s',
  },

  /* Minimized state */
  minimizedContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 12px 6px 6px',
  },
  avatarMini: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255, 255, 255, 0.4)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimizedText: {
    fontSize: '12.5px',
    fontWeight: 550,
    color: '#10b981',
  },
  iconMiniBtn: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '13px',
    padding: '2px 4px',
    cursor: 'pointer',
  },
  endCallMiniBtn: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: 'none',
  },
};
