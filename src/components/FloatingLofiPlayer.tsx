import React, { useState, useEffect, useRef } from 'react';
import { useLofiMusic } from '../context/LofiMusicContext';
import { MinimizeIcon, MaximizeIcon } from './Icons';

interface FloatingLofiPlayerProps {
  onOpenFullView?: () => void;
}

export const FloatingLofiPlayer: React.FC<FloatingLofiPlayerProps> = ({ onOpenFullView }) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffle,
    isRepeat,
    isFloatingMinimized,
    togglePlay,
    handleNext,
    handlePrev,
    handleSeek,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    setIsFloating,
    setIsFloatingMinimized,
    toggleFloatingMinimize,
    formatTime,
  } = useLofiMusic();

  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 370) : 100,
    y: typeof window !== 'undefined' ? Math.max(20, window.innerHeight - 230) : 100,
  });
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const w = isFloatingMinimized ? 320 : 350;
      const h = isFloatingMinimized ? 50 : 190;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - w, dragStart.current.px + e.clientX - dragStart.current.mx)),
        y: Math.max(10, Math.min(window.innerHeight - h, dragStart.current.py + e.clientY - dragStart.current.my)),
      });
    };
    const onUp = () => {
      setIsDragging(false);
      dragStart.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, isFloatingMinimized]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // -------------------------------------------------------------
  // MINIMIZED FLOATING PILL VIEW
  // -------------------------------------------------------------
  if (isFloatingMinimized) {
    return (
      <>
        <style>{`
          @keyframes miniEqPulse {
            0% { transform: scaleY(0.35); }
            50% { transform: scaleY(1); }
            100% { transform: scaleY(0.35); }
          }
        `}</style>
        <div
          style={{ ...styles.minimizedPill, left: pos.x, top: pos.y }}
          onMouseDown={handleMouseDown}
        >
          {/* Animated Equalizer / Music Icon */}
          <div
            style={styles.miniIconWrap}
            onClick={() => setIsFloatingMinimized(false)}
            title="Expand Lofi player"
          >
            {isPlaying ? (
              <div style={styles.miniEqBars}>
                <span style={{ ...styles.miniEqBar, animation: 'miniEqPulse 0.8s ease-in-out infinite' }} />
                <span style={{ ...styles.miniEqBar, animation: 'miniEqPulse 0.6s ease-in-out infinite 0.2s', height: '11px' }} />
                <span style={{ ...styles.miniEqBar, animation: 'miniEqPulse 0.9s ease-in-out infinite 0.4s', height: '7px' }} />
              </div>
            ) : (
              <span style={styles.miniTitleIcon}>♪</span>
            )}
          </div>

          {/* Track info click to expand */}
          <div
            style={styles.miniTrackInfo}
            onClick={() => setIsFloatingMinimized(false)}
            title={`Click to expand · ${currentTrack.title} (${currentTrack.artist})`}
          >
            <span style={styles.miniTrackTitle}>{currentTrack.title}</span>
            <span style={styles.miniTrackArtist}>{currentTrack.artist}</span>
          </div>

          {/* Action buttons with stopPropagation so drag/expand isn't accidentally triggered */}
          <div style={styles.miniActions} onMouseDown={(e) => e.stopPropagation()}>
            {/* Quick Play/Pause */}
            <button
              style={styles.miniPlayBtn}
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#000000">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#000000" style={{ marginLeft: '1px' }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            {/* Next Track */}
            <button
              style={styles.miniActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              title="Next Track"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="3" />
              </svg>
            </button>

            {/* Maximize / Restore */}
            <button
              style={styles.miniActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                setIsFloatingMinimized(false);
              }}
              title="Expand player"
            >
              <MaximizeIcon size={12} />
            </button>

            {/* Close */}
            <button
              style={styles.miniCloseBtn}
              onClick={(e) => {
                e.stopPropagation();
                setIsFloating(false);
              }}
              title="Close floating player"
            >
              ✕
            </button>
          </div>
        </div>
      </>
    );
  }

  // -------------------------------------------------------------
  // EXPANDED FLOATING PLAYER VIEW
  // -------------------------------------------------------------
  return (
    <div style={{ ...styles.wrapper, left: pos.x, top: pos.y }}>
      {/* Title Bar with Drag Handle */}
      <div style={styles.titleBar} onMouseDown={handleMouseDown}>
        <div style={styles.titleLeft}>
          <span style={styles.titleIcon}>♪</span>
          <span style={styles.titleText}>Lofi Music</span>
        </div>
        <div style={styles.titleActions}>
          {onOpenFullView && (
            <button
              style={styles.actionBtn}
              onClick={onOpenFullView}
              title="Open full Lofi Music tab"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}
          {/* Minimize Button */}
          <button
            style={styles.actionBtn}
            onClick={toggleFloatingMinimize}
            title="Minimize to floating pill"
          >
            <MinimizeIcon size={12} />
          </button>
          <button
            style={styles.closeBtn}
            onClick={() => setIsFloating(false)}
            title="Close floating player"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Track Info */}
      <div style={styles.trackRow}>
        <div style={styles.thumb}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div style={styles.trackMeta}>
          <span style={styles.trackTitle}>{currentTrack.title}</span>
          <span style={styles.trackArtist}>{currentTrack.artist}</span>
        </div>
      </div>

      {/* Scrubber */}
      <div style={styles.scrubRow}>
        <span style={styles.timeLabel}>{formatTime(currentTime)}</span>
        <div style={styles.scrubTrack}>
          <div style={{ ...styles.scrubFill, width: `${pct}%` }} />
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            style={styles.scrubInput}
          />
        </div>
        <span style={styles.timeLabel}>{formatTime(duration)}</span>
      </div>

      {/* Controls Row */}
      <div style={styles.controlsRow}>
        <button
          style={{
            ...styles.iconBtn,
            color: isShuffle ? '#ffffff' : 'rgba(255,255,255,0.4)',
            textShadow: isShuffle ? '0 0 8px rgba(255,255,255,0.8)' : 'none',
          }}
          onClick={toggleShuffle}
          title="Shuffle"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
            <polyline points="21 16 21 21 16 21" />
            <line x1="15" y1="15" x2="21" y2="21" />
            <line x1="4" y1="4" x2="9" y2="9" />
          </svg>
        </button>

        <button style={styles.iconBtn} onClick={handlePrev} title="Previous">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19 20 9 12 19 4 19 20" />
            <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="3" />
          </svg>
        </button>

        <button style={styles.playBtn} onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#000000">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#000000" style={{ marginLeft: '2px' }}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        <button style={styles.iconBtn} onClick={handleNext} title="Next">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 4 15 12 5 20 5 4" />
            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="3" />
          </svg>
        </button>

        <button
          style={{
            ...styles.iconBtn,
            color: isRepeat ? '#ffffff' : 'rgba(255,255,255,0.4)',
            textShadow: isRepeat ? '0 0 8px rgba(255,255,255,0.8)' : 'none',
          }}
          onClick={toggleRepeat}
          title="Repeat"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
      </div>

      {/* Volume Row */}
      <div style={styles.volumeRow}>
        <button style={styles.iconBtn} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted || volume === 0 ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          style={styles.volumeInput}
        />
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'fixed',
    width: '330px',
    backgroundColor: 'rgba(10, 10, 12, 0.78)',
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: '16px',
    padding: '12px 16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
    boxShadow: '0 0 32px rgba(255, 255, 255, 0.06), 0 20px 48px rgba(0, 0, 0, 0.75)',
    zIndex: 9999,
    userSelect: 'none',
  },
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'grab',
    paddingBottom: '2px',
  },
  titleLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  titleIcon: {
    fontSize: '12px',
    color: '#ffffff',
    textShadow: '0 0 8px rgba(255, 255, 255, 0.6)',
  },
  titleText: {
    fontSize: '11.5px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: '0.4px',
    textShadow: '0 0 10px rgba(255, 255, 255, 0.35)',
  },
  titleActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  actionBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.15s ease',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '2px 4px',
    lineHeight: 1,
    transition: 'color 0.15s ease',
  },
  trackRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  thumb: {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trackMeta: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
  },
  trackTitle: {
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  trackArtist: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.45)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '1px',
  },
  scrubRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  timeLabel: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.4)',
    minWidth: '28px',
    textAlign: 'center',
  },
  scrubTrack: {
    position: 'relative',
    flex: 1,
    height: '3px',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: '2px',
    display: 'flex',
    alignItems: 'center',
  },
  scrubFill: {
    position: 'absolute',
    left: 0,
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: '2px',
    boxShadow: '0 0 6px rgba(255, 255, 255, 0.65)',
    pointerEvents: 'none',
  },
  scrubInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    zIndex: 2,
    margin: 0,
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '2px 0',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.75)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    transition: 'all 0.15s ease',
  },
  playBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 14px rgba(255, 255, 255, 0.45)',
    transition: 'transform 0.1s ease',
  },
  volumeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  volumeInput: {
    flex: 1,
    height: '3px',
    accentColor: '#ffffff',
    cursor: 'pointer',
  },
  minimizedPill: {
    position: 'fixed',
    width: '320px',
    height: '42px',
    backgroundColor: 'rgba(10, 10, 12, 0.88)',
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    borderRadius: '999px',
    padding: '0 10px 0 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 0 24px rgba(255, 255, 255, 0.05), 0 16px 36px rgba(0, 0, 0, 0.85)',
    zIndex: 9999,
    userSelect: 'none',
    cursor: 'grab',
    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
  },
  miniIconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    flexShrink: 0,
    cursor: 'pointer',
  },
  miniTitleIcon: {
    fontSize: '11px',
    color: '#ffffff',
    textShadow: '0 0 6px rgba(255, 255, 255, 0.7)',
  },
  miniEqBars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    height: '11px',
  },
  miniEqBar: {
    width: '2.5px',
    height: '10px',
    backgroundColor: '#ffffff',
    borderRadius: '1px',
    transformOrigin: 'bottom',
    boxShadow: '0 0 6px rgba(255, 255, 255, 0.7)',
  },
  miniTrackInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  miniTrackTitle: {
    fontSize: '11.5px',
    fontWeight: 600,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '120px',
  },
  miniTrackArtist: {
    fontSize: '10.5px',
    color: 'rgba(255, 255, 255, 0.45)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  miniActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  miniPlayBtn: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#000000',
    boxShadow: '0 0 10px rgba(255, 255, 255, 0.45)',
    padding: 0,
  },
  miniActionBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.65)',
    cursor: 'pointer',
    padding: '3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'color 0.15s ease',
  },
  miniCloseBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '2px 4px',
    lineHeight: 1,
    transition: 'color 0.15s ease',
  },
};

