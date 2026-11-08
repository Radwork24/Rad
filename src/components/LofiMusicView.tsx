import React, { useState, useMemo } from 'react';
import { SidebarToggleIcon } from './Icons';
import { useLofiMusic } from '../context/LofiMusicContext';

interface LofiMusicViewProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
}

export const LofiMusicView: React.FC<LofiMusicViewProps> = ({
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const {
    tracks,
    currentTrackIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffle,
    isRepeat,
    isFloating,
    savedTracks,
    togglePlay,
    playTrack,
    handleNext,
    handlePrev,
    handleSeek,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    toggleSaveTrack,
    setIsFloating,
    formatTime,
  } = useLofiMusic();

  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [tracks, searchQuery]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={styles.container}>
      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes eqPulse {
          0%   { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
      `}</style>

      {/* Top Bar */}
      <header style={styles.topBar}>
        <div style={styles.topBarLeft}>
          {!isSidebarOpen && (
            <button onClick={onToggleSidebar} style={styles.iconNavBtn} title="Toggle sidebar">
              <SidebarToggleIcon size={18} />
            </button>
          )}

          {/* History Nav */}
          <div style={styles.historyNav}>
            <button style={styles.circleNavBtn} onClick={handlePrev} title="Previous">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button style={styles.circleNavBtn} onClick={handleNext} title="Next">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div style={styles.searchContainer}>
            <svg
              style={styles.searchIcon}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="2.5"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search tracks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Float Window Button */}
        <div style={styles.topBarRight}>
          <button
            onClick={() => setIsFloating((p) => !p)}
            style={{ ...styles.floatBtn, ...(isFloating ? styles.floatBtnActive : {}) }}
            title={isFloating ? 'Close floating player' : 'Open in floating window'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <polyline points="9 9 15 9 15 15" />
              <line x1="9" y1="15" x2="15" y2="9" />
            </svg>
            <span style={{ marginLeft: '5px', fontSize: '11px' }}>
              {isFloating ? 'Close Float' : 'Float Player'}
            </span>
          </button>
        </div>
      </header>

      {/* Main scrollable area — no right sidebar */}
      <div style={styles.mainLayout}>
        <div style={styles.centerScrollable}>
          {/* Hero */}
          <section style={styles.heroSection}>
            {/* Vinyl Cover */}
            <div style={styles.albumCover}>
              <div style={styles.coverInner}>
                <div style={styles.vinylGrooves}>
                  <div style={styles.vinylCenter}>
                    <span style={styles.vinylDot} />
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.heroMeta}>
              <span style={styles.playlistType}>Playlist</span>
              <h1 style={styles.playlistTitle}>Lofi Music</h1>
              <p style={styles.playlistDesc}>
                Ambient lofi beats, gentle rain, and vinyl crackles to focus, relax, and code.
              </p>
            </div>
          </section>

          {/* Action Row */}
          <div style={styles.actionRow}>
            <button onClick={togglePlay} style={styles.bigPlayBtn} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#000000">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#000000" style={{ marginLeft: '3px' }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <button
              onClick={toggleShuffle}
              style={{
                ...styles.iconActionBtn,
                color: isShuffle ? '#ffffff' : 'rgba(255,255,255,0.3)',
                textShadow: isShuffle ? '0 0 10px rgba(255,255,255,0.9)' : 'none',
              }}
              title="Shuffle"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            </button>

            <button
              onClick={toggleRepeat}
              style={{
                ...styles.iconActionBtn,
                color: isRepeat ? '#ffffff' : 'rgba(255,255,255,0.3)',
                textShadow: isRepeat ? '0 0 10px rgba(255,255,255,0.9)' : 'none',
              }}
              title="Repeat"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>

            <span style={{ flex: 1 }} />

            {/* Float Player shortcut */}
            <button
              onClick={() => setIsFloating((p) => !p)}
              style={{
                ...styles.iconActionBtn,
                color: isFloating ? '#ffffff' : 'rgba(255,255,255,0.35)',
                textShadow: isFloating ? '0 0 10px rgba(255,255,255,0.8)' : 'none',
              }}
              title="Float player"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <polyline points="9 9 15 9 15 15" />
                <line x1="9" y1="15" x2="15" y2="9" />
              </svg>
            </button>
          </div>

          {/* Track Table */}
          <div style={styles.trackTable}>
            <div style={styles.tableHeader}>
              <div style={{ width: '36px', textAlign: 'center' }}>#</div>
              <div style={{ flex: 1.4 }}>Title</div>
              <div style={{ flex: 1 }}>Album</div>
              <div style={{ flex: 0.9 }}>Date added</div>
              <div style={{ width: '48px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>

            <div style={styles.tableBody}>
              {filteredTracks.map((track, idx) => {
                const isCurrent = currentTrackIndex === idx;
                const isHovered = hoveredRowId === track.id;
                const isSaved = savedTracks.has(track.id);

                return (
                  <div
                    key={track.id}
                    onClick={() => playTrack(idx)}
                    onMouseEnter={() => setHoveredRowId(track.id)}
                    onMouseLeave={() => setHoveredRowId(null)}
                    style={{
                      ...styles.tableRow,
                      backgroundColor: isCurrent
                        ? 'rgba(255, 255, 255, 0.07)'
                        : isHovered
                        ? 'rgba(255, 255, 255, 0.04)'
                        : 'transparent',
                      borderLeft: isCurrent ? '2px solid rgba(255,255,255,0.7)' : '2px solid transparent',
                    }}
                  >
                    <div style={styles.cellNum}>
                      {isHovered ? (
                        <button style={styles.rowPlayBtn} title="Play">
                          {isCurrent && isPlaying ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="4" width="4" height="16" />
                              <rect x="14" y="4" width="4" height="16" />
                            </svg>
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          )}
                        </button>
                      ) : isCurrent && isPlaying ? (
                        <div style={styles.equalizerBars}>
                          <span style={{ ...styles.eqBar, animationDuration: '0.6s' }} />
                          <span style={{ ...styles.eqBar, animationDuration: '0.8s' }} />
                          <span style={{ ...styles.eqBar, animationDuration: '0.5s' }} />
                        </div>
                      ) : (
                        <span style={{ color: isCurrent ? '#ffffff' : 'rgba(255,255,255,0.35)', fontSize: '13px' }}>
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    <div style={styles.cellTitle}>
                      <div
                        style={{
                          ...styles.trackThumb,
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{
                            ...styles.trackTitleText,
                            color: isCurrent ? '#ffffff' : 'rgba(255,255,255,0.88)',
                            textShadow: isCurrent ? '0 0 12px rgba(255,255,255,0.5)' : 'none',
                          }}
                        >
                          {track.title}
                        </span>
                        <span style={styles.trackArtistText}>{track.artist}</span>
                      </div>
                    </div>

                    <div style={styles.cellAlbum}>
                      <span>{track.album}</span>
                    </div>
                    <div style={styles.cellDate}>
                      <span>{track.dateAdded}</span>
                    </div>

                    <div style={styles.cellDuration}>
                      <button
                        onClick={(e) => toggleSaveTrack(track.id, e)}
                        style={{
                          ...styles.heartBtn,
                          opacity: isSaved || isHovered ? 1 : 0,
                          color: isSaved ? '#ffffff' : 'rgba(255,255,255,0.5)',
                          textShadow: isSaved ? '0 0 8px rgba(255,255,255,0.7)' : 'none',
                        }}
                      >
                        {isSaved ? '♥' : '♡'}
                      </button>
                      <span>{track.duration}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Player Bar */}
      <footer style={styles.playerBar}>
        {/* Left: Track info */}
        <div style={styles.playerLeft}>
          <div style={styles.playerThumb}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={styles.playerTitle}>{currentTrack.title}</p>
            <p style={styles.playerArtist}>{currentTrack.artist}</p>
          </div>
          <button
            onClick={(e) => toggleSaveTrack(currentTrack.id, e)}
            style={{
              ...styles.heartBtn,
              marginLeft: '8px',
              color: savedTracks.has(currentTrack.id) ? '#ffffff' : 'rgba(255,255,255,0.3)',
              textShadow: savedTracks.has(currentTrack.id) ? '0 0 8px rgba(255,255,255,0.7)' : 'none',
            }}
          >
            {savedTracks.has(currentTrack.id) ? '♥' : '♡'}
          </button>
        </div>

        {/* Center: Controls + Scrubber */}
        <div style={styles.playerCenter}>
          <div style={styles.controlButtons}>
            <button
              onClick={toggleShuffle}
              style={{
                ...styles.ctrlBtn,
                color: isShuffle ? '#ffffff' : 'rgba(255,255,255,0.4)',
                textShadow: isShuffle ? '0 0 8px rgba(255,255,255,0.8)' : 'none',
              }}
              title="Shuffle"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            </button>
            <button onClick={handlePrev} style={styles.ctrlBtn} title="Previous">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="3" />
              </svg>
            </button>
            <button onClick={togglePlay} style={styles.playPauseBtn} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#000000">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#000000" style={{ marginLeft: '2px' }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>
            <button onClick={handleNext} style={styles.ctrlBtn} title="Next">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="3" />
              </svg>
            </button>
            <button
              onClick={toggleRepeat}
              style={{
                ...styles.ctrlBtn,
                color: isRepeat ? '#ffffff' : 'rgba(255,255,255,0.4)',
                textShadow: isRepeat ? '0 0 8px rgba(255,255,255,0.8)' : 'none',
              }}
              title="Repeat"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>
          </div>

          <div style={styles.scrubberRow}>
            <span style={styles.timeLabel}>{formatTime(currentTime)}</span>
            <div style={styles.sliderTrackWrapper}>
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                style={styles.sliderInput}
              />
              <div style={{ ...styles.sliderFill, width: `${pct}%` }} />
            </div>
            <span style={styles.timeLabel}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume + Float btn */}
        <div style={styles.playerRight}>
          <button
            onClick={() => setIsFloating((p) => !p)}
            style={{
              ...styles.ctrlBtn,
              color: isFloating ? '#ffffff' : 'rgba(255,255,255,0.4)',
              textShadow: isFloating ? '0 0 8px rgba(255,255,255,0.8)' : 'none',
            }}
            title="Float player"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <polyline points="9 9 15 9 15 15" />
              <line x1="9" y1="15" x2="15" y2="9" />
            </svg>
          </button>

          <button onClick={toggleMute} style={styles.ctrlBtn} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted || volume === 0 ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
          <div style={styles.volumeWrapper}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={styles.volumeSlider}
            />
          </div>
        </div>
      </footer>
    </div>
  );
};

/* ─── Minimalist White + Transparent Styles ─────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    height: '100vh',
    backgroundColor: '#080808',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: 'var(--font-sans)',
  },
  topBar: {
    height: '56px',
    backgroundColor: 'transparent',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    gap: '14px',
    backdropFilter: 'blur(12px)',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  iconNavBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyNav: {
    display: 'flex',
    gap: '6px',
  },
  circleNavBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    maxWidth: '360px',
  },
  searchIcon: {
    position: 'absolute',
    left: '11px',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    height: '36px',
    borderRadius: '18px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    padding: '0 32px 0 34px',
    fontSize: '12.5px',
    outline: 'none',
  },
  clearSearchBtn: {
    position: 'absolute',
    right: '10px',
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    fontSize: '11px',
  },
  floatBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: '20px',
    color: 'rgba(255,255,255,0.65)',
    padding: '5px 12px',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    letterSpacing: '0.3px',
  },
  floatBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
    color: '#ffffff',
    boxShadow: '0 0 10px rgba(255,255,255,0.2)',
  },
  mainLayout: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  centerScrollable: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 36px 120px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 240px)',
  },
  heroSection: {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-end',
    marginBottom: '28px',
  },
  albumCover: {
    width: '160px',
    height: '160px',
    borderRadius: '10px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backdropFilter: 'blur(8px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
  coverInner: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'transparent',
  },
  vinylGrooves: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: 'inset 0 0 0 10px rgba(255,255,255,0.03), inset 0 0 0 20px rgba(255,255,255,0.02)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylCenter: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 12px rgba(255,255,255,0.2)',
  },
  vinylDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  heroMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  playlistType: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: 'rgba(255,255,255,0.4)',
  },
  playlistTitle: {
    fontSize: '48px',
    fontWeight: 800,
    letterSpacing: '-1.5px',
    color: '#ffffff',
    lineHeight: 1.1,
    textShadow: '0 0 32px rgba(255,255,255,0.15)',
  },
  playlistDesc: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.5,
    marginTop: '2px',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '18px',
    marginBottom: '24px',
  },
  bigPlayBtn: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(255,255,255,0.4)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  iconActionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  trackTable: {
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: '0.9px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
    marginBottom: '6px',
  },
  tableBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.12s ease',
  },
  cellNum: {
    width: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowPlayBtn: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  equalizerBars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    height: '14px',
  },
  eqBar: {
    width: '2.5px',
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: '1px',
    animation: 'eqPulse 0.7s infinite alternate ease-in-out',
    boxShadow: '0 0 4px rgba(255,255,255,0.6)',
  },
  cellTitle: {
    flex: 1.4,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
  },
  trackThumb: {
    width: '36px',
    height: '36px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trackTitleText: {
    fontSize: '13.5px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  trackArtistText: {
    fontSize: '11.5px',
    color: 'rgba(255,255,255,0.4)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '1px',
  },
  cellAlbum: {
    flex: 1,
    fontSize: '12.5px',
    color: 'rgba(255,255,255,0.4)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cellDate: {
    flex: 0.9,
    fontSize: '12.5px',
    color: 'rgba(255,255,255,0.4)',
  },
  cellDuration: {
    width: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    fontSize: '12.5px',
    color: 'rgba(255,255,255,0.4)',
  },
  heartBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontSize: '14px',
    transition: 'all 0.15s ease',
  },
  playerBar: {
    height: '80px',
    backgroundColor: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderTop: '1px solid rgba(255, 255, 255, 0.07)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 22px',
    zIndex: 20,
  },
  playerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '260px',
    minWidth: 0,
  },
  playerThumb: {
    width: '44px',
    height: '44px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  playerTitle: {
    fontSize: '12.5px',
    fontWeight: 600,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  playerArtist: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.4)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '2px',
  },
  playerCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px',
    flex: 1,
    maxWidth: '600px',
  },
  controlButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '18px',
  },
  ctrlBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.65)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    transition: 'all 0.15s ease',
  },
  playPauseBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 14px rgba(255,255,255,0.4)',
    transition: 'transform 0.1s ease',
  },
  scrubberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
  },
  timeLabel: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.35)',
    minWidth: '30px',
    textAlign: 'center',
  },
  sliderTrackWrapper: {
    position: 'relative',
    flex: 1,
    height: '3px',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: '2px',
    display: 'flex',
    alignItems: 'center',
  },
  sliderInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    zIndex: 2,
    margin: 0,
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: '2px',
    pointerEvents: 'none',
    boxShadow: '0 0 6px rgba(255,255,255,0.6)',
  },
  playerRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    width: '260px',
  },
  volumeWrapper: {
    width: '80px',
    display: 'flex',
    alignItems: 'center',
  },
  volumeSlider: {
    width: '100%',
    height: '3px',
    accentColor: '#ffffff',
    cursor: 'pointer',
  },
};
