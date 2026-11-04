import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  SidebarToggleIcon,
} from './Icons';

interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  dateAdded: string;
  duration: string;
  durationSec: number;
  audioUrl?: string;
  ambientVibe?: string;
  color?: string;
}

const LOFI_TRACKS: Track[] = [
  {
    id: 1,
    title: 'back home studying',
    artist: 'a girl and a cat',
    album: 'lofi study 2026',
    dateAdded: 'Jan 9, 2026',
    duration: '1:57',
    durationSec: 117,
    ambientVibe: 'soft lo-fi chill • rhythmic rain beats • deep concentration',
    color: '#3d2b1f',
    // High quality royalty-free chill lofi stream
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
  },
  {
    id: 2,
    title: 'Flowers',
    artist: 'In Love With a Ghost, Nori',
    album: "Let's Go",
    dateAdded: 'Jan 9, 2026',
    duration: '4:12',
    durationSec: 252,
    ambientVibe: 'warm electric piano • peaceful birds chirping • mellow breeze',
    color: '#28332b',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3',
  },
  {
    id: 3,
    title: 'Crackling Beat',
    artist: 'LoFi Waiter',
    album: 'Time Fragments',
    dateAdded: 'Jan 9, 2026',
    duration: '2:18',
    durationSec: 138,
    ambientVibe: 'vintage vinyl crackle • subtle tape hiss • sleepy nocturnal groove',
    color: '#342938',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=lofi-chill-medium-version-159456.mp3',
  },
  {
    id: 4,
    title: 'Motions',
    artist: 'Fujitsu',
    album: 'Corals',
    dateAdded: 'Jan 9, 2026',
    duration: '1:52',
    durationSec: 112,
    ambientVibe: 'slow acoustic guitar • cozy warm coffee shop vibes • focus pulse',
    color: '#212f38',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=tuesday-night-123447.mp3',
  },
  {
    id: 5,
    title: 'Enter the Coffee Shop',
    artist: 'LoFi Waiter',
    album: 'Coffee Sunrise',
    dateAdded: 'Jan 9, 2026',
    duration: '3:06',
    durationSec: 186,
    ambientVibe: 'warm Rhodes chords • distant ceramic cups • relaxed morning rhythm',
    color: '#382a20',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/16/audio_db6591201e.mp3?filename=spirit-blossom-15285.mp3',
  },
  {
    id: 6,
    title: "The Girl I Haven't Met",
    artist: 'Kudasaibeats',
    album: 'Falling',
    dateAdded: 'Jan 9, 2026',
    duration: '3:15',
    durationSec: 195,
    ambientVibe: 'mellow bassline • nostalgic tape loops • mindful flow state',
    color: '#2f2323',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2023/07/04/audio_349d97a61d.mp3?filename=good-night-lofi-cozy-chill-music-160166.mp3',
  },
  {
    id: 7,
    title: 'Campfire Chill',
    artist: 'Komorebi',
    album: 'Midnight Glow',
    dateAdded: 'Jan 10, 2026',
    duration: '2:44',
    durationSec: 164,
    ambientVibe: 'crackling fire embers • subtle wind breeze • tranquil coding aura',
    color: '#3b281c',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/26/audio_d0c6ff1e01.mp3?filename=whip-afro-dancehall-music-110235.mp3',
  },
  {
    id: 8,
    title: 'Tokyo Midnight Rain',
    artist: 'Lofi Forest',
    album: 'Tokyo Rain',
    dateAdded: 'Jan 10, 2026',
    duration: '2:38',
    durationSec: 158,
    ambientVibe: 'distant city rain • gentle jazz chords • peaceful late hours',
    color: '#1a2936',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c3527e30de.mp3?filename=rainy-day-in-tokyo-lofi-chill-10373.mp3',
  },
];

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
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(117);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);
  const [savedTracks, setSavedTracks] = useState<Set<number>>(new Set([1, 2, 5]));

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentTrack = LOFI_TRACKS[currentTrackIndex] || LOFI_TRACKS[0];

  // Initialize Audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        handleNext();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isRepeat, currentTrackIndex]);

  // Handle track changing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack.audioUrl) {
      audio.src = currentTrack.audioUrl;
      audio.load();
      if (isPlaying) {
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }
    }
    setCurrentTime(0);
    setDuration(currentTrack.durationSec);
  }, [currentTrackIndex]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (!audio.src && currentTrack.audioUrl) {
        audio.src = currentTrack.audioUrl;
      }
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  };

  const playTrack = (index: number) => {
    if (currentTrackIndex === index) {
      togglePlay();
    } else {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
      }, 50);
    }
  };

  const handleNext = () => {
    if (isShuffle) {
      const nextIdx = Math.floor(Math.random() * LOFI_TRACKS.length);
      playTrack(nextIdx);
    } else {
      playTrack((currentTrackIndex + 1) % LOFI_TRACKS.length);
    }
  };

  const handlePrev = () => {
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
    } else {
      const prevIdx = (currentTrackIndex - 1 + LOFI_TRACKS.length) % LOFI_TRACKS.length;
      playTrack(prevIdx);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
  };

  const toggleSaveTrack = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return LOFI_TRACKS;
    const q = searchQuery.toLowerCase();
    return LOFI_TRACKS.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div style={styles.container}>
      {/* Top Bar / Search Header */}
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button style={styles.circleNavBtn} onClick={handleNext} title="Next">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* Search Pill */}
          <div style={styles.searchContainer}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e8e" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              type="text"
              placeholder="What do you want to play?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={styles.clearSearchBtn}>✕</button>
            )}
          </div>
        </div>

        <div style={styles.topBarRight}>
          <div style={styles.tagBadge}>
            <span style={styles.livePulse} />
            <span>RAD 24/7 BEATS</span>
          </div>
        </div>
      </header>

      {/* Main Body Split: Content Area + Right Now-Playing Sidebar */}
      <div style={styles.mainLayout}>
        {/* Left / Center Main Scrollable Area */}
        <div style={styles.centerScrollable}>
          {/* Hero Section */}
          <section style={styles.heroSection}>
            {/* Styled Procedural Cover (No external images required) */}
            <div style={styles.albumCover}>
              <div style={styles.coverInner}>
                <div style={styles.vinylGrooves}>
                  <div style={styles.vinylCenter}>
                    <span style={styles.vinylDot} />
                  </div>
                </div>
                <div style={styles.coverBadge}>
                  <span style={styles.coverEmoji}>🎧</span>
                  <span style={styles.coverBrand}>RAD LOFI</span>
                </div>
              </div>
            </div>

            <div style={styles.heroMeta}>
              <span style={styles.playlistType}>Public Playlist</span>
              <h1 style={styles.playlistTitle}>
                Study Lofi 2026 📚🎧 Top 100
              </h1>
              <p style={styles.playlistDesc}>
                Study. Ambient lofi beats, gentle rain, and vinyl crackles to focus, relax, and code with Rad.
              </p>
              <div style={styles.playlistStats}>
                <span style={{ fontWeight: 600, color: '#ffffff' }}>Rad Lofi</span>
                <span style={styles.dotSeparator}>•</span>
                <span>192,726 saves</span>
                <span style={styles.dotSeparator}>•</span>
                <span>{LOFI_TRACKS.length} songs, 54 min</span>
              </div>
            </div>
          </section>

          {/* Action Row */}
          <div style={styles.actionRow}>
            {/* Big Play Button with Rad Accent */}
            <button onClick={togglePlay} style={styles.bigPlayBtn} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff" style={{ marginLeft: '3px' }}><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
            </button>

            {/* Shuffle */}
            <button
              onClick={() => setIsShuffle((prev) => !prev)}
              style={{ ...styles.iconActionBtn, color: isShuffle ? 'var(--accent-terracotta)' : '#8e8e8e' }}
              title="Shuffle"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
            </button>

            {/* Repeat */}
            <button
              onClick={() => setIsRepeat((prev) => !prev)}
              style={{ ...styles.iconActionBtn, color: isRepeat ? 'var(--accent-terracotta)' : '#8e8e8e' }}
              title="Repeat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
            </button>

            {/* Save All */}
            <button style={styles.iconActionBtn} title="Save to Your Library">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            </button>

            <span style={{ flex: 1 }} />

            <div style={styles.customOrderPill}>
              <span>Custom order</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
            </div>
          </div>

          {/* Tracklist Table */}
          <div style={styles.trackTable}>
            {/* Header */}
            <div style={styles.tableHeader}>
              <div style={{ width: '36px', textAlign: 'center' }}>#</div>
              <div style={{ flex: 1.4 }}>Title</div>
              <div style={{ flex: 1 }}>Album</div>
              <div style={{ flex: 0.9 }}>Date added</div>
              <div style={{ width: '48px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </div>
            </div>

            {/* Track Rows */}
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
                      backgroundColor: isCurrent ? 'rgba(255, 255, 255, 0.08)' : isHovered ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                    }}
                  >
                    {/* Number / Play Indicator */}
                    <div style={styles.cellNum}>
                      {isHovered ? (
                        <button style={styles.rowPlayBtn} title="Play">
                          {isCurrent && isPlaying ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          )}
                        </button>
                      ) : isCurrent && isPlaying ? (
                        <div style={styles.equalizerBars}>
                          <span style={{ ...styles.eqBar, animationDuration: '0.6s' }} />
                          <span style={{ ...styles.eqBar, animationDuration: '0.8s' }} />
                          <span style={{ ...styles.eqBar, animationDuration: '0.5s' }} />
                        </div>
                      ) : (
                        <span style={{ color: isCurrent ? 'var(--accent-terracotta)' : '#737373', fontSize: '13px' }}>
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    {/* Title & Artist */}
                    <div style={styles.cellTitle}>
                      <div style={{ ...styles.trackThumb, backgroundColor: track.color || '#212121' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ ...styles.trackTitleText, color: isCurrent ? 'var(--accent-terracotta)' : '#ffffff' }}>
                          {track.title}
                        </span>
                        <span style={styles.trackArtistText}>
                          {track.artist}
                        </span>
                      </div>
                    </div>

                    {/* Album */}
                    <div style={styles.cellAlbum}>
                      <span>{track.album}</span>
                    </div>

                    {/* Date */}
                    <div style={styles.cellDate}>
                      <span>{track.dateAdded}</span>
                    </div>

                    {/* Heart & Duration */}
                    <div style={styles.cellDuration}>
                      <button
                        onClick={(e) => toggleSaveTrack(track.id, e)}
                        style={{
                          ...styles.heartBtn,
                          opacity: isSaved || isHovered ? 1 : 0,
                          color: isSaved ? 'var(--accent-terracotta)' : '#8e8e8e',
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

        {/* Right Sidebar: Now Playing & Ambient Info */}
        <aside style={styles.nowPlayingPanel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>{currentTrack.artist}</span>
            <button style={styles.iconActionBtn} title="More">•••</button>
          </div>

          {/* Now Playing Banner Card */}
          <div style={styles.nowPlayingCard}>
            <div style={{ ...styles.nowPlayingCover, backgroundColor: currentTrack.color || '#212121' }}>
              <div style={styles.coverDiscVisual}>
                <div style={{ ...styles.rotatingDisc, animationPlayState: isPlaying ? 'running' : 'paused' }}>
                  <div style={styles.discHole} />
                </div>
              </div>
            </div>

            <div style={styles.nowPlayingInfoRow}>
              <div>
                <h3 style={styles.nowPlayingSong}>{currentTrack.title}</h3>
                <p style={styles.nowPlayingArtist}>{currentTrack.artist}</p>
              </div>
              <button
                onClick={(e) => toggleSaveTrack(currentTrack.id, e)}
                style={{
                  ...styles.heartBtn,
                  color: savedTracks.has(currentTrack.id) ? 'var(--accent-terracotta)' : '#8e8e8e',
                  fontSize: '18px',
                }}
              >
                {savedTracks.has(currentTrack.id) ? '♥' : '♡'}
              </button>
            </div>
          </div>

          {/* Lyrics / Ambient Notes Card (Exact replica of Spotify card) */}
          <div style={styles.lyricsCard}>
            <span style={styles.lyricsTag}>Ambient Vibe</span>
            <p style={styles.lyricsBody}>
              {currentTrack.ambientVibe}
            </p>
            <div style={styles.lyricsFade} />
          </div>

          {/* Related Focus Stations */}
          <div style={styles.relatedSection}>
            <span style={styles.relatedHeading}>Related Focus Stations</span>
            <div style={styles.relatedItem}>
              <div style={{ ...styles.relatedThumb, backgroundColor: '#2b2a1e' }}>☕</div>
              <div>
                <p style={styles.relatedName}>Midnight Coffee & Code</p>
                <p style={styles.relatedSub}>Rad Focus Beats</p>
              </div>
            </div>
            <div style={styles.relatedItem}>
              <div style={{ ...styles.relatedThumb, backgroundColor: '#1e282b' }}>🌧️</div>
              <div>
                <p style={styles.relatedName}>Deep Rainfall 432Hz</p>
                <p style={styles.relatedSub}>Atmospheric Noise</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom Sticky Player Bar */}
      <footer style={styles.playerBar}>
        {/* Left: Track Details */}
        <div style={styles.playerLeft}>
          <div style={{ ...styles.playerThumb, backgroundColor: currentTrack.color || '#212121' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
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
              color: savedTracks.has(currentTrack.id) ? 'var(--accent-terracotta)' : '#8e8e8e',
            }}
          >
            {savedTracks.has(currentTrack.id) ? '♥' : '♡'}
          </button>
        </div>

        {/* Center: Controls & Scrubber */}
        <div style={styles.playerCenter}>
          <div style={styles.controlButtons}>
            <button
              onClick={() => setIsShuffle((prev) => !prev)}
              style={{ ...styles.ctrlBtn, color: isShuffle ? 'var(--accent-terracotta)' : '#b4b4b4' }}
              title="Shuffle"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
            </button>
            <button onClick={handlePrev} style={styles.ctrlBtn} title="Previous">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="3" /></svg>
            </button>
            <button onClick={togglePlay} style={styles.playPauseBtn} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000" style={{ marginLeft: '2px' }}><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
            </button>
            <button onClick={handleNext} style={styles.ctrlBtn} title="Next">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="3" /></svg>
            </button>
            <button
              onClick={() => setIsRepeat((prev) => !prev)}
              style={{ ...styles.ctrlBtn, color: isRepeat ? 'var(--accent-terracotta)' : '#b4b4b4' }}
              title="Repeat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
            </button>
          </div>

          {/* Time Scrubber */}
          <div style={styles.scrubberRow}>
            <span style={styles.timeLabel}>{formatTime(currentTime)}</span>
            <div style={styles.sliderTrackWrapper}>
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                style={styles.sliderInput}
              />
              <div
                style={{
                  ...styles.sliderFill,
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                }}
              />
            </div>
            <span style={styles.timeLabel}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume & Options */}
        <div style={styles.playerRight}>
          <button onClick={() => setIsMuted((prev) => !prev)} style={styles.ctrlBtn} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted || volume === 0 ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
            )}
          </button>
          <div style={styles.volumeWrapper}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              style={styles.volumeSlider}
            />
          </div>
        </div>
      </footer>
    </div>
  );
};

/* Styles adhering strictly to Rad's pure OLED black aesthetic with terracotta brand accent */
const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    height: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: 'var(--font-sans)',
  },
  topBar: {
    height: '60px',
    backgroundColor: '#000000',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    gap: '16px',
    zIndex: 10,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  iconNavBtn: {
    background: 'none',
    border: 'none',
    color: '#b4b4b4',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyNav: {
    display: 'flex',
    gap: '8px',
  },
  circleNavBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: 'none',
    color: '#ffffff',
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
    maxWidth: '420px',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    height: '40px',
    borderRadius: '20px',
    backgroundColor: '#1f1f1f',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    padding: '0 36px 0 38px',
    fontSize: '13px',
    outline: 'none',
  },
  clearSearchBtn: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    color: '#8e8e8e',
    cursor: 'pointer',
    fontSize: '12px',
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  tagBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '16px',
    backgroundColor: 'rgba(217, 56, 30, 0.12)',
    border: '1px solid rgba(217, 56, 30, 0.3)',
    color: 'var(--accent-terracotta)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.8px',
  },
  livePulse: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-terracotta)',
    boxShadow: '0 0 8px var(--accent-terracotta)',
  },
  mainLayout: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  centerScrollable: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 32px 120px 32px',
    background: 'linear-gradient(180deg, #181512 0%, #0a0a0a 280px)',
  },
  heroSection: {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-end',
    marginBottom: '28px',
  },
  albumCover: {
    width: '192px',
    height: '192px',
    borderRadius: '8px',
    backgroundColor: '#1c1b18',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  coverInner: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #2e1d17 0%, #171615 100%)',
    borderRadius: '8px',
    position: 'relative',
    overflow: 'hidden',
  },
  vinylGrooves: {
    position: 'absolute',
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: 'inset 0 0 0 8px rgba(0,0,0,0.3), inset 0 0 0 16px rgba(255,255,255,0.02), inset 0 0 0 24px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylCenter: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-terracotta)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#000000',
  },
  coverBadge: {
    position: 'absolute',
    bottom: '12px',
    left: '12px',
    right: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(8px)',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  coverEmoji: {
    fontSize: '14px',
  },
  coverBrand: {
    fontSize: '11px',
    fontWeight: 650,
    letterSpacing: '0.6px',
    color: '#ffffff',
  },
  heroMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
  },
  playlistType: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: '#b4b4b4',
  },
  playlistTitle: {
    fontSize: '44px',
    fontWeight: 800,
    letterSpacing: '-1px',
    color: '#ffffff',
    lineHeight: 1.15,
  },
  playlistDesc: {
    fontSize: '13px',
    color: '#a0a0a0',
    lineHeight: 1.5,
  },
  playlistStats: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#b4b4b4',
    marginTop: '4px',
  },
  dotSeparator: {
    color: '#676767',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    marginBottom: '24px',
  },
  bigPlayBtn: {
    width: '54px',
    height: '54px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-terracotta)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(217, 56, 30, 0.4)',
    transition: 'transform 0.15s ease, background-color 0.15s ease',
  },
  iconActionBtn: {
    background: 'none',
    border: 'none',
    color: '#8e8e8e',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customOrderPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#b4b4b4',
    cursor: 'pointer',
  },
  trackTable: {
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#8e8e8e',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    marginBottom: '8px',
  },
  tableBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
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
    backgroundColor: 'var(--accent-terracotta)',
    borderRadius: '1px',
    animation: 'eqPulse 0.7s infinite alternate ease-in-out',
  },
  cellTitle: {
    flex: 1.4,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
  },
  trackThumb: {
    width: '38px',
    height: '38px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trackTitleText: {
    fontSize: '14px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  trackArtistText: {
    fontSize: '12px',
    color: '#8e8e8e',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cellAlbum: {
    flex: 1,
    fontSize: '13px',
    color: '#8e8e8e',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cellDate: {
    flex: 0.9,
    fontSize: '13px',
    color: '#8e8e8e',
  },
  cellDuration: {
    width: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    fontSize: '13px',
    color: '#8e8e8e',
  },
  heartBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontSize: '15px',
  },
  nowPlayingPanel: {
    width: '320px',
    backgroundColor: '#0d0d0d',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    overflowY: 'auto',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    fontSize: '15px',
    fontWeight: 650,
    color: '#ffffff',
  },
  nowPlayingCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  nowPlayingCover: {
    width: '100%',
    aspectRatio: '1',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
  },
  coverDiscVisual: {
    width: '80%',
    height: '80%',
    borderRadius: '50%',
    backgroundColor: '#141414',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotatingDisc: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-terracotta)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'spin 8s linear infinite',
  },
  discHole: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#0a0a0a',
  },
  nowPlayingInfoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nowPlayingSong: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
  },
  nowPlayingArtist: {
    fontSize: '13px',
    color: '#8e8e8e',
    marginTop: '2px',
  },
  lyricsCard: {
    backgroundColor: '#1b241e',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  lyricsTag: {
    fontSize: '11px',
    fontWeight: 650,
    textTransform: 'uppercase',
    color: '#4ade80',
    letterSpacing: '0.6px',
  },
  lyricsBody: {
    fontSize: '14px',
    color: '#d1d5db',
    lineHeight: 1.6,
    fontStyle: 'italic',
  },
  lyricsFade: {
    height: '4px',
  },
  relatedSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  relatedHeading: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
  },
  relatedItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    cursor: 'pointer',
  },
  relatedThumb: {
    width: '40px',
    height: '40px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
  },
  relatedName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#ffffff',
  },
  relatedSub: {
    fontSize: '11px',
    color: '#8e8e8e',
    marginTop: '2px',
  },
  playerBar: {
    height: '84px',
    backgroundColor: '#000000',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    zIndex: 20,
  },
  playerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '280px',
    minWidth: 0,
  },
  playerThumb: {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  playerTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  playerArtist: {
    fontSize: '11px',
    color: '#8e8e8e',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '2px',
  },
  playerCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    maxWidth: '640px',
  },
  controlButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  ctrlBtn: {
    background: 'none',
    border: 'none',
    color: '#b4b4b4',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
  },
  playPauseBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s ease',
  },
  scrubberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
  },
  timeLabel: {
    fontSize: '11px',
    color: '#8e8e8e',
    minWidth: '32px',
    textAlign: 'center',
  },
  sliderTrackWrapper: {
    position: 'relative',
    flex: 1,
    height: '4px',
    backgroundColor: '#383838',
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
    backgroundColor: 'var(--accent-terracotta)',
    borderRadius: '2px',
    pointerEvents: 'none',
  },
  playerRight: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    width: '280px',
  },
  volumeWrapper: {
    width: '90px',
    display: 'flex',
    alignItems: 'center',
  },
  volumeSlider: {
    width: '100%',
    height: '4px',
    accentColor: 'var(--accent-terracotta)',
    cursor: 'pointer',
  },
};

