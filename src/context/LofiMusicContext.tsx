import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';

export interface Track {
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

export const LOFI_TRACKS: Track[] = [
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

interface LofiMusicContextType {
  tracks: Track[];
  currentTrackIndex: number;
  currentTrack: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  isRepeat: boolean;
  isFloating: boolean;
  isFloatingMinimized: boolean;
  savedTracks: Set<number>;
  togglePlay: () => void;
  playTrack: (index: number) => void;
  handleNext: () => void;
  handlePrev: () => void;
  handleSeek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleSaveTrack: (id: number, e?: React.MouseEvent) => void;
  setIsFloating: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFloatingMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  toggleFloatingMinimize: () => void;
  formatTime: (seconds: number) => string;
}

const LofiMusicContext = createContext<LofiMusicContextType | null>(null);

export const LofiMusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(117);
  const [volume, setVolumeState] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [savedTracks, setSavedTracks] = useState<Set<number>>(new Set([1, 2, 5]));

  const toggleFloatingMinimize = useCallback(() => {
    setIsFloatingMinimized((prev) => !prev);
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const currentTrack = LOFI_TRACKS[currentTrackIndex] || LOFI_TRACKS[0];

  const formatTime = useCallback((seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, []);

  // Initialize Singleton Audio
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
  }, [isRepeat, isShuffle, currentTrackIndex]);

  // Load new track audio when track index changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack.audioUrl) {
      audio.src = currentTrack.audioUrl;
      audio.load();
      if (isPlayingRef.current) {
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }
    }
    setCurrentTime(0);
    setDuration(currentTrack.durationSec);
  }, [currentTrackIndex]);

  // Sync volume & mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = useCallback(() => {
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
  }, [isPlaying, currentTrack]);

  const playTrack = useCallback((index: number) => {
    if (currentTrackIndex === index) {
      togglePlay();
    } else {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
      }, 50);
    }
  }, [currentTrackIndex, togglePlay]);

  const handleNext = useCallback(() => {
    if (isShuffle) {
      const nextIdx = Math.floor(Math.random() * LOFI_TRACKS.length);
      playTrack(nextIdx);
    } else {
      playTrack((currentTrackIndex + 1) % LOFI_TRACKS.length);
    }
  }, [isShuffle, currentTrackIndex, playTrack]);

  const handlePrev = useCallback(() => {
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
    } else {
      const prevIdx = (currentTrackIndex - 1 + LOFI_TRACKS.length) % LOFI_TRACKS.length;
      playTrack(prevIdx);
    }
  }, [currentTime, currentTrackIndex, playTrack]);

  const handleSeek = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
  }, []);

  const setVolume = useCallback((val: number) => {
    setVolumeState(val);
    if (isMuted) setIsMuted(false);
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => !prev);
  }, []);

  const toggleRepeat = useCallback(() => {
    setIsRepeat((prev) => !prev);
  }, []);

  const toggleSaveTrack = useCallback((id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSavedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      tracks: LOFI_TRACKS,
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
      isFloatingMinimized,
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
      setIsFloatingMinimized,
      toggleFloatingMinimize,
      formatTime,
    }),
    [
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
      isFloatingMinimized,
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
      toggleFloatingMinimize,
      formatTime,
    ]
  );

  return <LofiMusicContext.Provider value={value}>{children}</LofiMusicContext.Provider>;
};

export const useLofiMusic = (): LofiMusicContextType => {
  const context = useContext(LofiMusicContext);
  if (!context) {
    throw new Error('useLofiMusic must be used within a LofiMusicProvider');
  }
  return context;
};

