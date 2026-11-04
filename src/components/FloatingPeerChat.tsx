import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquareIcon,
  MinimizeIcon,
  MaximizeIcon,
  ArrowUpIcon,
  VideoIcon,
  VideoOffIcon,
  PhoneOffIcon,
  MicrophoneIcon,
  MicOffIcon,
} from './Icons';
import {
  subscribeToPeerMessages,
  sendPeerMessage,
  type PeerMessage,
} from '../services/peerChatService';
import {
  startVideoCall,
  answerVideoCall,
  endVoiceCall,
  rejectVoiceCall,
  toggleLocalMute,
  toggleLocalVideo,
  subscribeToIncomingCalls,
  subscribeToVideoStreams,
  attachVideoElements,
  type ActiveCallState,
} from '../services/callService';
import type { UserProfile } from '../services/userService';

interface FloatingPeerChatProps {
  chatId: string;
  currentUsername: string;
  collaboratorUsername: string;
  collaboratorProfile?: UserProfile;
  bottomOffset?: number;
}

type VideoCallStatus = 'idle' | 'ringing_out' | 'ringing_in' | 'connected' | 'ended';

export const FloatingPeerChat: React.FC<FloatingPeerChatProps> = ({
  chatId,
  currentUsername,
  collaboratorUsername,
  collaboratorProfile,
  bottomOffset = 24,
}) => {
  const [isMinimized, setIsMinimized] = useState(true);
  const [messages, setMessages] = useState<PeerMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(Date.now());
  const [isDismissed, setIsDismissed] = useState(false);

  // Video call state
  const [videoStatus, setVideoStatus] = useState<VideoCallStatus>('idle');
  const [incomingVideoCall, setIncomingVideoCall] = useState<ActiveCallState | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isVideoExpanded, setIsVideoExpanded] = useState(false);

  const callStartTimeRef = useRef<number>(0);
  const callDurationIntervalRef = useRef<number | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isInCall =
    videoStatus === 'ringing_out' || videoStatus === 'ringing_in' || videoStatus === 'connected';

  // Subscribe to peer messages
  useEffect(() => {
    if (!chatId) return;
    setIsDismissed(false);
    const unsubscribe = subscribeToPeerMessages(chatId, (newMsgs) => {
      setMessages(newMsgs);
    });
    return () => unsubscribe();
  }, [chatId]);

  // Subscribe to incoming video calls FROM this collaborator
  useEffect(() => {
    if (!currentUsername) return;
    const unsubscribe = subscribeToIncomingCalls(currentUsername, (call) => {
      const callerKey = call.caller.toLowerCase().trim();
      const collabKey = collaboratorUsername.toLowerCase().trim();
      // Only accept video calls initiated by this collaborator
      if (callerKey === collabKey && (call.isVideo || call.callId.startsWith('vcall_'))) {
        setIncomingVideoCall(call);
        setVideoStatus('ringing_in');
        // Unminimize so the user sees the incoming video call immediately
        setIsMinimized(false);
      }
    });
    return () => unsubscribe();
  }, [currentUsername, collaboratorUsername]);

  // Stream subscriber: auto-wire local and remote streams to video tags
  useEffect(() => {
    if (!isInCall) return;

    // Give DOM a frame to mount <video> elements
    const timer = setTimeout(() => {
      attachVideoElements(localVideoRef.current, remoteVideoRef.current);
    }, 50);

    const unsubscribe = subscribeToVideoStreams((localStream, remoteStream) => {
      if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.play().catch(() => {});
      }
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [isInCall, videoStatus]);

  // Auto-scroll and mark read when expanded
  useEffect(() => {
    if (!isMinimized) {
      setLastReadTimestamp(Date.now());
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMinimized, messages.length]);

  // Call duration timer
  useEffect(() => {
    if (videoStatus === 'connected') {
      callStartTimeRef.current = Date.now();
      callDurationIntervalRef.current = window.setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
      }, 1000);
    } else {
      setCallDuration(0);
      if (callDurationIntervalRef.current !== null) {
        clearInterval(callDurationIntervalRef.current);
        callDurationIntervalRef.current = null;
      }
    }
    return () => {
      if (callDurationIntervalRef.current !== null) {
        clearInterval(callDurationIntervalRef.current);
      }
    };
  }, [videoStatus]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const unreadCount = isMinimized
    ? messages.filter(
        (m) =>
          m.sender.toLowerCase().trim() !== currentUsername.toLowerCase().trim() &&
          m.createdAt > lastReadTimestamp
      ).length
    : 0;

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isSending) return;
    setInputText('');
    setIsSending(true);
    try {
      await sendPeerMessage(chatId, currentUsername, text);
      setLastReadTimestamp(Date.now());
      scrollToBottom();
    } catch (err) {
      console.error('Failed to send peer message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleCallStateChange = useCallback((callState: ActiveCallState | null) => {
    if (!callState || callState.status === 'ended' || callState.status === 'declined') {
      setVideoStatus('idle');
      setIncomingVideoCall(null);
      setIsMuted(false);
      setIsCameraOff(false);
    } else if (callState.status === 'connected') {
      setVideoStatus('connected');
    }
  }, []);

  const handleStartVideoCall = async () => {
    if (videoStatus !== 'idle') return;
    setVideoStatus('ringing_out');
    setIsMinimized(false);
    try {
      await startVideoCall(
        currentUsername,
        collaboratorUsername,
        handleCallStateChange,
        localVideoRef.current,
        remoteVideoRef.current
      );
    } catch (err: any) {
      alert(err?.message || 'Could not start video call.');
      setVideoStatus('idle');
    }
  };

  const handleAnswerVideoCall = async () => {
    if (!incomingVideoCall) return;
    try {
      await answerVideoCall(
        incomingVideoCall.callId,
        handleCallStateChange,
        localVideoRef.current,
        remoteVideoRef.current
      );
      setVideoStatus('connected');
      setIncomingVideoCall(null);
    } catch (err: any) {
      alert(err?.message || 'Could not answer video call.');
      setVideoStatus('idle');
    }
  };

  const handleEndVideoCall = async () => {
    if (videoStatus === 'ringing_in' && incomingVideoCall) {
      await rejectVoiceCall(incomingVideoCall.callId);
    } else {
      await endVoiceCall();
    }
    setVideoStatus('idle');
    setIncomingVideoCall(null);
    setIsMuted(false);
    setIsCameraOff(false);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    toggleLocalMute(next);
  };

  const handleToggleCamera = () => {
    const next = !isCameraOff;
    setIsCameraOff(next);
    toggleLocalVideo(next);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (isDismissed) return null;

  const initialLetter = (collaboratorUsername || 'C').charAt(0).toUpperCase();

  // ==========================================================
  // 1. MINIMIZED PILL
  // ==========================================================
  if (isMinimized) {
    return (
      <div
        style={{ ...styles.minimizedPill, bottom: `${bottomOffset}px` }}
        onClick={() => setIsMinimized(false)}
        title={`Click to open chat with @${collaboratorUsername}`}
      >
        <span style={styles.onlineDot} />
        <div style={styles.avatarCircle}>{initialLetter}</div>
        <div style={styles.pillTextContainer}>
          <span style={styles.pillLabel}>Chat with</span>
          <span style={styles.pillUsername}>@{collaboratorUsername}</span>
        </div>

        {/* Incoming video call badge */}
        {videoStatus === 'ringing_in' && (
          <span style={styles.incomingCallBadge}>📹 Incoming Call…</span>
        )}

        {/* Active connected call badge */}
        {videoStatus === 'connected' && (
          <span style={styles.activeCallBadge}>📹 {formatDuration(callDuration)}</span>
        )}

        {/* Unread messages badge */}
        {unreadCount > 0 && videoStatus === 'idle' && (
          <span style={styles.unreadBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(false);
          }}
          style={styles.pillActionBtn}
          title="Open chat"
        >
          <MaximizeIcon size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsDismissed(true);
          }}
          style={styles.pillActionBtn}
          title="Close"
        >
          ✕
        </button>
      </div>
    );
  }

  // ==========================================================
  // 2. EXPANDED WIDGET (chat + optional video call panel)
  // ==========================================================
  const totalHeight = isInCall ? (isVideoExpanded ? '640px' : '520px') : '460px';
  const videoPanelHeight = isVideoExpanded ? '280px' : '185px';

  return (
    <div
      style={{
        ...styles.chatBoxContainer,
        bottom: `${bottomOffset}px`,
        height: totalHeight,
        width: isInCall && isVideoExpanded ? '380px' : '340px',
      }}
    >
      {/* ── Header ── */}
      <div style={styles.chatHeader}>
        <div style={styles.headerUserGroup}>
          <div style={styles.headerAvatar}>
            {initialLetter}
            <span style={styles.headerOnlineDot} />
          </div>
          <div style={styles.headerMeta}>
            <div style={styles.headerNameRow}>
              <span style={styles.headerUsername}>@{collaboratorUsername}</span>
              {collaboratorProfile?.branch && (
                <span style={styles.branchTag}>{collaboratorProfile.branch}</span>
              )}
            </div>
            <span style={styles.headerSubtitle}>
              {videoStatus === 'connected'
                ? `📹 In Call • ${formatDuration(callDuration)}`
                : videoStatus === 'ringing_out'
                ? '📹 Calling peer…'
                : videoStatus === 'ringing_in'
                ? '📹 Incoming Video Call'
                : 'Study Companion'}
            </span>
          </div>
        </div>

        <div style={styles.headerActions}>
          {/* Video call launch button (when idle) */}
          {videoStatus === 'idle' && (
            <button
              onClick={handleStartVideoCall}
              style={styles.videoCallLaunchBtn}
              title={`Start video call with @${collaboratorUsername}`}
            >
              <VideoIcon size={14} />
              <span>Video</span>
            </button>
          )}

          {/* Expand/shrink video view button (when in call) */}
          {isInCall && (
            <button
              onClick={() => setIsVideoExpanded(!isVideoExpanded)}
              style={styles.headerActionBtn}
              title={isVideoExpanded ? 'Shrink video' : 'Enlarge video'}
            >
              <MaximizeIcon size={13} />
            </button>
          )}

          <button
            onClick={() => setIsMinimized(true)}
            style={styles.headerActionBtn}
            title="Minimize"
          >
            <MinimizeIcon size={14} />
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            style={styles.headerActionBtn}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Video Call Panel ── */}
      {isInCall && (
        <div style={{ ...styles.videoPanelContainer, height: videoPanelHeight }}>
          {/* Remote video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={styles.remoteVideo}
          />

          {/* Local self-preview (PiP) */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              ...styles.localVideo,
              opacity: isCameraOff ? 0.25 : 1,
            }}
          />

          {/* Camera off badge on local video */}
          {isCameraOff && (
            <div style={styles.localCamOffOverlay}>
              <VideoOffIcon size={13} />
            </div>
          )}

          {/* Ringing overlay */}
          {videoStatus !== 'connected' && (
            <div style={styles.callStatusOverlay}>
              <div style={styles.callStatusAvatarPulse}>
                <div style={styles.callStatusAvatar}>{initialLetter}</div>
              </div>
              <div style={styles.callStatusName}>@{collaboratorUsername}</div>
              <div style={styles.callStatusLabel}>
                {videoStatus === 'ringing_out' ? 'Calling…' : 'Incoming Video Call…'}
              </div>
            </div>
          )}

          {/* Incoming call answer / decline row */}
          {videoStatus === 'ringing_in' && (
            <div style={styles.incomingCallActions}>
              <button
                onClick={handleAnswerVideoCall}
                style={styles.answerBtn}
                title="Answer video call"
              >
                <VideoIcon size={16} />
                <span>Answer</span>
              </button>
              <button
                onClick={handleEndVideoCall}
                style={styles.declineBtn}
                title="Decline"
              >
                <PhoneOffIcon size={16} />
                <span>Decline</span>
              </button>
            </div>
          )}

          {/* In-call controls */}
          {(videoStatus === 'connected' || videoStatus === 'ringing_out') && (
            <div style={styles.callControlsRow}>
              {/* Mute Mic */}
              <button
                onClick={handleToggleMute}
                style={{
                  ...styles.callControlBtn,
                  backgroundColor: isMuted ? '#ef4444' : 'rgba(0,0,0,0.65)',
                }}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOffIcon size={15} /> : <MicrophoneIcon size={15} />}
              </button>

              {/* Toggle Camera */}
              <button
                onClick={handleToggleCamera}
                style={{
                  ...styles.callControlBtn,
                  backgroundColor: isCameraOff ? '#ef4444' : 'rgba(0,0,0,0.65)',
                }}
                title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isCameraOff ? <VideoOffIcon size={15} /> : <VideoIcon size={15} />}
              </button>

              {/* End Call */}
              <button
                onClick={handleEndVideoCall}
                style={styles.endCallBtn}
                title={videoStatus === 'ringing_out' ? 'Cancel Call' : 'End Call'}
              >
                <PhoneOffIcon size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Messages Area ── */}
      <div style={styles.messagesArea}>
        {messages.length === 0 ? (
          <div style={styles.emptyNotice}>
            <div style={styles.emptyIconWrap}>
              <MessageSquareIcon size={22} />
            </div>
            <h4 style={styles.emptyTitle}>Chat with @{collaboratorUsername}</h4>
            <p style={styles.emptyDesc}>
              Collaborate and discuss notebook items or video call right here.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender.toLowerCase().trim() === currentUsername.toLowerCase().trim();
            return (
              <div
                key={msg.id}
                style={{
                  ...styles.messageRow,
                  justifyContent: isMe ? 'flex-end' : 'flex-start',
                }}
              >
                {!isMe && <div style={styles.msgAvatarMini}>{initialLetter}</div>}
                <div
                  style={{
                    ...styles.messageBubble,
                    backgroundColor: isMe ? 'var(--accent-terracotta, #c97d4e)' : '#1c1b18',
                    color: isMe ? '#ffffff' : '#f5f2eb',
                    border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    borderBottomRightRadius: isMe ? '4px' : '14px',
                    borderBottomLeftRadius: isMe ? '14px' : '4px',
                  }}
                >
                  {!isMe && <span style={styles.msgSenderName}>@{msg.sender}</span>}
                  <div style={styles.msgText}>{msg.content}</div>
                  <div
                    style={{
                      ...styles.msgTime,
                      color: isMe ? 'rgba(255,255,255,0.7)' : '#807b73',
                    }}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar ── */}
      <form onSubmit={handleSendMessage} style={styles.inputBar}>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Message @${collaboratorUsername}…`}
          style={styles.messageInput}
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          style={{
            ...styles.sendBtn,
            opacity: !inputText.trim() || isSending ? 0.4 : 1,
            cursor: !inputText.trim() || isSending ? 'default' : 'pointer',
          }}
          title="Send message (Enter)"
        >
          <ArrowUpIcon size={15} />
        </button>
      </form>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  /* Minimized Pill */
  minimizedPill: {
    position: 'fixed',
    right: '24px',
    zIndex: 99990,
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255,255,255,0.22)',
    borderRadius: '26px',
    padding: '7px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 12px 36px rgba(0,0,0,0.85), 0 0 16px rgba(201,125,78,0.18)',
    userSelect: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  onlineDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#22c55e',
    boxShadow: '0 0 8px #22c55e',
    flexShrink: 0,
  },
  avatarCircle: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.2)',
    flexShrink: 0,
  },
  pillTextContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '12.5px',
    color: '#ffffff',
  },
  pillLabel: { color: 'rgba(255,255,255,0.65)', fontWeight: 400 },
  pillUsername: { fontWeight: 600, color: '#f5f2eb' },
  unreadBadge: {
    backgroundColor: 'var(--accent-terracotta, #c97d4e)',
    color: '#ffffff',
    fontSize: '10.5px',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: '10px',
  },
  incomingCallBadge: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    border: '1px solid rgba(34,197,94,0.5)',
    color: '#4ade80',
    fontSize: '10.5px',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: '10px',
    animation: 'pulse 1.5s infinite',
  },
  activeCallBadge: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    border: '1px solid rgba(59,130,246,0.5)',
    color: '#60a5fa',
    fontSize: '10.5px',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: '10px',
  },
  pillActionBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.55)',
    cursor: 'pointer',
    padding: '2px 4px',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  },

  /* Expanded Chat Window */
  chatBoxContainer: {
    position: 'fixed',
    right: '24px',
    maxHeight: 'calc(100vh - 100px)',
    backgroundColor: '#000000',
    border: '1.5px solid rgba(255,255,255,0.18)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 18px 48px rgba(0,0,0,0.95), 0 0 24px rgba(201,125,78,0.2)',
    zIndex: 99990,
    overflow: 'hidden',
    backdropFilter: 'blur(16px)',
    transition: 'height 0.25s ease, width 0.25s ease',
  },

  /* Header */
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: '#0a0a0a',
    flexShrink: 0,
  },
  headerUserGroup: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 },
  headerAvatar: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.15)',
  },
  headerOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#22c55e',
    border: '1.5px solid #000000',
  },
  headerMeta: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  headerNameRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  headerUsername: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f5f2eb',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  branchTag: {
    fontSize: '9.5px',
    color: '#a39e94',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: '1px 5px',
    borderRadius: '4px',
  },
  headerSubtitle: { fontSize: '10.5px', color: '#8c877d' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
  headerActionBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer',
    padding: '4px 5px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
  },
  videoCallLaunchBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: 'rgba(34,197,94,0.15)',
    border: '1px solid rgba(34,197,94,0.4)',
    color: '#4ade80',
    fontSize: '11px',
    fontWeight: 600,
    padding: '4px 9px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  /* Video Panel */
  videoPanelContainer: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#0c0c0c',
    flexShrink: 0,
    overflow: 'hidden',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    transition: 'height 0.25s ease',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    backgroundColor: '#0c0c0c',
    display: 'block',
  },
  localVideo: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    width: '80px',
    height: '60px',
    borderRadius: '8px',
    objectFit: 'cover',
    border: '1.5px solid rgba(255,255,255,0.3)',
    backgroundColor: '#181818',
    transition: 'opacity 0.2s ease',
    zIndex: 5,
  },
  localCamOffOverlay: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    width: '80px',
    height: '60px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#ffffff',
    zIndex: 6,
  },
  callStatusOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.78)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    zIndex: 4,
  },
  callStatusAvatarPulse: {
    padding: '6px',
    borderRadius: '50%',
    border: '1.5px dashed rgba(34,197,94,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callStatusAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid rgba(255,255,255,0.25)',
  },
  callStatusName: { fontSize: '13px', fontWeight: 600, color: '#f5f2eb' },
  callStatusLabel: { fontSize: '11px', color: 'rgba(255,255,255,0.65)' },
  incomingCallActions: {
    position: 'absolute',
    bottom: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    zIndex: 10,
  },
  answerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#16a34a',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    padding: '7px 15px',
    borderRadius: '20px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(22,163,74,0.4)',
  },
  declineBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#dc2626',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    padding: '7px 15px',
    borderRadius: '20px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(220,38,38,0.4)',
  },
  callControlsRow: {
    position: 'absolute',
    bottom: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: '4px 10px',
    borderRadius: '24px',
    backdropFilter: 'blur(8px)',
  },
  callControlBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  endCallBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: '#dc2626',
    border: 'none',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(220,38,38,0.4)',
  },

  /* Messages Area */
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    backgroundColor: '#000000',
  },
  emptyNotice: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '20px 14px',
    color: 'rgba(255,255,255,0.4)',
  },
  emptyIconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-terracotta, #c97d4e)',
    marginBottom: '10px',
  },
  emptyTitle: { fontSize: '13.5px', fontWeight: 600, color: '#f5f2eb', margin: '0 0 5px 0' },
  emptyDesc: { fontSize: '11.5px', color: '#8c877d', lineHeight: 1.45, margin: 0 },
  messageRow: { display: 'flex', alignItems: 'flex-end', gap: '6px' },
  msgAvatarMini: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '9px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: '2px',
  },
  messageBubble: {
    maxWidth: '78%',
    padding: '7px 11px',
    borderRadius: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    wordBreak: 'break-word',
  },
  msgSenderName: { fontSize: '9.5px', color: 'var(--accent-terracotta, #c97d4e)', fontWeight: 600 },
  msgText: { fontSize: '12.5px', lineHeight: 1.4 },
  msgTime: { fontSize: '9px', alignSelf: 'flex-end', marginTop: '1px' },

  /* Input Bar */
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 12px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: '#0a0a0a',
    flexShrink: 0,
  },
  messageInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px',
    padding: '7px 13px',
    fontSize: '12px',
    color: '#f5f2eb',
    outline: 'none',
  },
  sendBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-terracotta, #c97d4e)',
    border: 'none',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s ease',
  },
};
