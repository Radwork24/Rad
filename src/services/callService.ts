import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface ActiveCallState {
  callId: string;
  caller: string;
  receiver: string;
  isIncoming: boolean;
  status: 'ringing' | 'connected' | 'ended' | 'declined';
  startTime?: number;
  isVideo?: boolean;
}

export type CallListener = (call: ActiveCallState | null) => void;
export type IncomingCallListener = (call: ActiveCallState) => void;
export type VideoStreamsListener = (
  localStream: MediaStream | null,
  remoteStream: MediaStream | null
) => void;

// ─── ICE / STUN + TURN config ────────────────────────────────────────────────
// Free STUN servers (Google) + open TURN relay (metered.ca free tier)
// TURN is critical: without it, calls fail when users are behind symmetric NAT
// (mobile networks, corporate firewalls, etc.)
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    // Open TURN relay — no signup required, works globally
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

// ─── getUserMedia constraints ─────────────────────────────────────────────────
// echoCancellation + noiseSuppression + autoGainControl are mandatory.
// These are set on BOTH caller and receiver to prevent the feedback loop
// where the speaker output is re-captured by the microphone.
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  facingMode: 'user',
  frameRate: { ideal: 30, max: 60 },
};

// ─── Module-level state ───────────────────────────────────────────────────────
let currentPeerConnection: RTCPeerConnection | null = null;
let currentLocalStream: MediaStream | null = null;
let currentRemoteStream: MediaStream | null = null;

// A single <audio> element for voice-only calls and voice track in video calls.
// CRITICAL: this is the ONLY element playing remote audio.
// The remote <video> element is kept muted to prevent double-audio echo.
let remoteAudioElement: HTMLAudioElement | null = null;

let localVideoElement: HTMLVideoElement | null = null;
let remoteVideoElement: HTMLVideoElement | null = null;
let videoStreamSubscribers: VideoStreamsListener[] = [];
let activeCallId: string | null = null;
let unsubscribeCallDoc: (() => void) | null = null;
let unsubscribeCandidates: (() => void) | null = null;

// ICE candidate queue: holds candidates that arrive before remote description is set
let pendingIceCandidates: RTCIceCandidateInit[] = [];

// ─── Ringtone / Web Audio API ─────────────────────────────────────────────────
let ringtoneInterval: number | null = null;
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

export function playOutgoingTone(): void {
  stopRingtone();
  try {
    const ctx = getAudioContext();
    const playBeep = () => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(425, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1.2);
      } catch (err) {
        console.warn('Tone beep failed:', err);
      }
    };
    playBeep();
    ringtoneInterval = window.setInterval(playBeep, 3500);
  } catch (e) {
    console.warn('Could not start outgoing tone:', e);
  }
}

export function playIncomingChime(): void {
  stopRingtone();
  try {
    const ctx = getAudioContext();
    const playChime = () => {
      try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc2.frequency.setValueAtTime(880.0, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.2);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 1.8);
      } catch (err) {
        console.warn('Chime failed:', err);
      }
    };
    playChime();
    ringtoneInterval = window.setInterval(playChime, 2500);
  } catch (e) {
    console.warn('Could not start incoming chime:', e);
  }
}

export function stopRingtone(): void {
  if (ringtoneInterval !== null) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}

// ─── Remote audio element ─────────────────────────────────────────────────────
/**
 * Returns a persistent hidden <audio> element that plays the remote peer's voice.
 * This is the SINGLE point of audio output for all call types.
 * The remote <video> element is always set to muted to prevent double-audio echo.
 */
function getRemoteAudioElement(): HTMLAudioElement {
  if (!remoteAudioElement) {
    remoteAudioElement = document.createElement('audio');
    remoteAudioElement.autoplay = true;
    remoteAudioElement.id = 'rad-remote-voice-audio';
    remoteAudioElement.style.display = 'none';
    // Never muted — this is the intended audio output channel
    remoteAudioElement.muted = false;
    document.body.appendChild(remoteAudioElement);
  }
  return remoteAudioElement;
}

/**
 * Wires remote stream audio to the hidden <audio> element (never to <video>).
 * Keeps <video> muted to prevent double-playback echo.
 */
function playRemoteAudio(remoteStream: MediaStream): void {
  const audioEl = getRemoteAudioElement();
  audioEl.srcObject = remoteStream;
  audioEl.play().catch((e) => console.warn('[Call] Remote audio autoplay blocked:', e));
}

// ─── ICE candidate queue ──────────────────────────────────────────────────────
/**
 * Flush queued ICE candidates to the peer connection once remote description is set.
 * This solves the race condition where candidates arrive before setRemoteDescription().
 */
async function flushPendingCandidates(pc: RTCPeerConnection): Promise<void> {
  if (pendingIceCandidates.length === 0) return;
  console.log(`[Call] Flushing ${pendingIceCandidates.length} queued ICE candidates`);
  for (const candidateInit of pendingIceCandidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (e) {
      console.warn('[Call] Error adding queued ICE candidate:', e);
    }
  }
  pendingIceCandidates = [];
}

/**
 * Safely add an ICE candidate — queues it if remote description not yet set.
 */
async function safeAddIceCandidate(
  pc: RTCPeerConnection,
  candidateData: RTCIceCandidateInit
): Promise<void> {
  if (!pc.remoteDescription) {
    // Queue it — will be flushed after setRemoteDescription()
    pendingIceCandidates.push(candidateData);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidateData));
  } catch (e) {
    console.warn('[Call] Error adding ICE candidate:', e);
  }
}

// ─── Local stream acquisition ─────────────────────────────────────────────────
async function getLocalStream(withVideo: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: withVideo ? VIDEO_CONSTRAINTS : false,
    });
  } catch (err) {
    if (withVideo) {
      // Video failed (camera busy/denied) — fall back to audio only
      console.warn('[Call] Camera unavailable, falling back to audio-only:', err);
      return await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: false,
      });
    }
    console.error('[Call] Microphone access denied:', err);
    throw new Error('Microphone permission is required to make a call.');
  }
}

// ─── Peer connection factory ──────────────────────────────────────────────────
function createPeerConnection(): RTCPeerConnection {
  const pc = new RTCPeerConnection(ICE_SERVERS);

  pc.onconnectionstatechange = () => {
    console.log(`[Call] Connection state: ${pc.connectionState}`);
  };
  pc.oniceconnectionstatechange = () => {
    console.log(`[Call] ICE connection state: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === 'failed') {
      console.warn('[Call] ICE failed — attempting ICE restart');
      pc.restartIce();
    }
  };
  pc.onicegatheringstatechange = () => {
    console.log(`[Call] ICE gathering state: ${pc.iceGatheringState}`);
  };

  return pc;
}

// ─── startVoiceCall ───────────────────────────────────────────────────────────
/**
 * Initiates an outgoing WebRTC voice call.
 */
export async function startVoiceCall(
  callerUsername: string,
  receiverUsername: string,
  onStateChange: CallListener
): Promise<string> {
  await endVoiceCall();
  pendingIceCandidates = [];

  const localStream = await getLocalStream(false);
  currentLocalStream = localStream;

  const peerConnection = createPeerConnection();
  currentPeerConnection = peerConnection;

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  // Remote audio: route to hidden <audio> element ONLY (never to a video element)
  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    playRemoteAudio(remoteStream);
  };

  const safeCaller = callerUsername.toLowerCase().trim();
  const safeReceiver = receiverUsername.toLowerCase().trim();
  const callId = `call_${safeCaller}_${safeReceiver}_${Date.now()}`;
  activeCallId = callId;

  const callDocRef = doc(db, 'calls', callId);
  const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
  const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(callerCandidatesCol, event.candidate.toJSON()).catch((e) =>
        console.warn('[Call] Error saving caller candidate:', e)
      );
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  await setDoc(callDocRef, {
    callId,
    caller: safeCaller,
    receiver: safeReceiver,
    callerDisplay: callerUsername,
    receiverDisplay: receiverUsername,
    status: 'ringing',
    offer: { type: offer.type, sdp: offer.sdp },
    createdAt: Date.now(),
  });

  playOutgoingTone();

  onStateChange({
    callId,
    caller: callerUsername,
    receiver: receiverUsername,
    isIncoming: false,
    status: 'ringing',
  });

  // Listen for answer or status change
  unsubscribeCallDoc = onSnapshot(callDocRef, async (snapshot) => {
    const data = snapshot.data();
    if (!data) return;

    if (data.status === 'declined' || data.status === 'ended') {
      stopRingtone();
      onStateChange({ callId, caller: callerUsername, receiver: receiverUsername, isIncoming: false, status: data.status });
      cleanupCallResources();
      return;
    }

    if (!peerConnection.currentRemoteDescription && data.answer) {
      stopRingtone();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      await flushPendingCandidates(peerConnection);
      onStateChange({ callId, caller: callerUsername, receiver: receiverUsername, isIncoming: false, status: 'connected', startTime: Date.now() });
    }
  });

  // Listen for receiver's ICE candidates
  unsubscribeCandidates = onSnapshot(receiverCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        await safeAddIceCandidate(peerConnection, change.doc.data() as RTCIceCandidateInit);
      }
    });
  });

  return callId;
}

// ─── answerVoiceCall ──────────────────────────────────────────────────────────
/**
 * Answers an incoming voice call.
 */
export async function answerVoiceCall(
  callId: string,
  onStateChange: CallListener
): Promise<void> {
  stopRingtone();
  pendingIceCandidates = [];

  const callDocRef = doc(db, 'calls', callId);
  const callSnapshot = await getDoc(callDocRef);
  if (!callSnapshot.exists()) throw new Error('Call does not exist or was ended.');

  const callData = callSnapshot.data();
  activeCallId = callId;

  const localStream = await getLocalStream(false);
  currentLocalStream = localStream;

  const peerConnection = createPeerConnection();
  currentPeerConnection = peerConnection;

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    playRemoteAudio(remoteStream);
  };

  const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
  const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(receiverCandidatesCol, event.candidate.toJSON()).catch((e) =>
        console.warn('[Call] Error adding answer candidate:', e)
      );
    }
  };

  // Set remote description FIRST, then generate answer
  await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
  await flushPendingCandidates(peerConnection);

  const answerDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answerDescription);

  await updateDoc(callDocRef, {
    answer: { type: answerDescription.type, sdp: answerDescription.sdp },
    status: 'connected',
    connectedAt: Date.now(),
  });

  onStateChange({
    callId,
    caller: callData.callerDisplay || callData.caller,
    receiver: callData.receiverDisplay || callData.receiver,
    isIncoming: true,
    status: 'connected',
    startTime: Date.now(),
  });

  unsubscribeCallDoc = onSnapshot(callDocRef, (snapshot) => {
    const data = snapshot.data();
    if (!data) return;
    if (data.status === 'ended' || data.status === 'declined') {
      onStateChange({ callId, caller: data.caller, receiver: data.receiver, isIncoming: true, status: data.status });
      cleanupCallResources();
    }
  });

  // Listen for caller's ICE candidates
  unsubscribeCandidates = onSnapshot(callerCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        await safeAddIceCandidate(peerConnection, change.doc.data() as RTCIceCandidateInit);
      }
    });
  });
}

// ─── rejectVoiceCall ──────────────────────────────────────────────────────────
export async function rejectVoiceCall(callId: string): Promise<void> {
  stopRingtone();
  try {
    await updateDoc(doc(db, 'calls', callId), { status: 'declined', endedAt: Date.now() });
  } catch (e) {
    console.warn('[Call] Error declining call:', e);
  }
  cleanupCallResources();
}

// ─── endVoiceCall ─────────────────────────────────────────────────────────────
export async function endVoiceCall(): Promise<void> {
  stopRingtone();
  if (activeCallId) {
    try {
      await updateDoc(doc(db, 'calls', activeCallId), { status: 'ended', endedAt: Date.now() });
    } catch (e) {
      console.warn('[Call] Error marking call ended:', e);
    }
  }
  cleanupCallResources();
}

// ─── toggleLocalMute ─────────────────────────────────────────────────────────
export function toggleLocalMute(isMuted: boolean): void {
  if (currentLocalStream) {
    currentLocalStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    console.log(`[Call] Mic ${isMuted ? 'muted' : 'unmuted'}`);
  }
}

// ─── toggleLocalVideo ─────────────────────────────────────────────────────────
export function toggleLocalVideo(isCameraOff: boolean): void {
  if (currentLocalStream) {
    currentLocalStream.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOff;
    });
    console.log(`[Call] Camera ${isCameraOff ? 'off' : 'on'}`);
  }
}

// ─── Video subscriber helpers ─────────────────────────────────────────────────
function notifyVideoSubscribers(): void {
  videoStreamSubscribers.forEach((cb) => {
    try { cb(currentLocalStream, currentRemoteStream); } catch (e) {
      console.warn('[Call] Video subscriber error:', e);
    }
  });
}

export function attachVideoElements(
  localEl: HTMLVideoElement | null,
  remoteEl: HTMLVideoElement | null
): void {
  localVideoElement = localEl;
  remoteVideoElement = remoteEl;

  if (localVideoElement && currentLocalStream) {
    // Local preview: always muted to prevent hearing your own voice
    localVideoElement.muted = true;
    localVideoElement.srcObject = currentLocalStream;
    localVideoElement.play().catch(() => {});
  }
  if (remoteVideoElement && currentRemoteStream) {
    // Remote video: MUTED — audio comes from remoteAudioElement only (prevents double-audio echo)
    remoteVideoElement.muted = true;
    remoteVideoElement.srcObject = currentRemoteStream;
    remoteVideoElement.play().catch(() => {});
  }
}

export function subscribeToVideoStreams(callback: VideoStreamsListener): () => void {
  videoStreamSubscribers.push(callback);
  try { callback(currentLocalStream, currentRemoteStream); } catch (e) {
    console.warn('[Call] Initial video callback error:', e);
  }
  return () => {
    videoStreamSubscribers = videoStreamSubscribers.filter((cb) => cb !== callback);
  };
}

// ─── startVideoCall ───────────────────────────────────────────────────────────
export async function startVideoCall(
  callerUsername: string,
  receiverUsername: string,
  onStateChange: CallListener,
  localEl?: HTMLVideoElement | null,
  remoteEl?: HTMLVideoElement | null
): Promise<string> {
  if (localEl !== undefined) localVideoElement = localEl;
  if (remoteEl !== undefined) remoteVideoElement = remoteEl;
  await endVoiceCall();
  pendingIceCandidates = [];

  const localStream = await getLocalStream(true);
  currentLocalStream = localStream;

  if (localVideoElement) {
    localVideoElement.muted = true; // Local preview — never hear yourself
    localVideoElement.srcObject = localStream;
    localVideoElement.play().catch(() => {});
  }
  notifyVideoSubscribers();

  const peerConnection = createPeerConnection();
  currentPeerConnection = peerConnection;

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    currentRemoteStream = remoteStream;

    if (remoteVideoElement) {
      // MUTED: audio comes from the hidden <audio> element, NOT this <video> element.
      // This is the primary fix for echo — dual audio output caused the feedback loop.
      remoteVideoElement.muted = true;
      remoteVideoElement.srcObject = remoteStream;
      remoteVideoElement.play().catch(() => {});
    }

    // Route audio to the dedicated <audio> element (single source, no echo)
    playRemoteAudio(remoteStream);
    notifyVideoSubscribers();
  };

  const safeCaller = callerUsername.toLowerCase().trim();
  const safeReceiver = receiverUsername.toLowerCase().trim();
  const callId = `vcall_${safeCaller}_${safeReceiver}_${Date.now()}`;
  activeCallId = callId;

  const callDocRef = doc(db, 'calls', callId);
  const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
  const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(callerCandidatesCol, event.candidate.toJSON()).catch((e) =>
        console.warn('[Call] Error saving caller candidate:', e)
      );
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  await setDoc(callDocRef, {
    callId,
    caller: safeCaller,
    receiver: safeReceiver,
    callerDisplay: callerUsername,
    receiverDisplay: receiverUsername,
    status: 'ringing',
    isVideo: true,
    offer: { type: offer.type, sdp: offer.sdp },
    createdAt: Date.now(),
  });

  playOutgoingTone();

  onStateChange({
    callId,
    caller: callerUsername,
    receiver: receiverUsername,
    isIncoming: false,
    status: 'ringing',
    isVideo: true,
  });

  unsubscribeCallDoc = onSnapshot(callDocRef, async (snapshot) => {
    const data = snapshot.data();
    if (!data) return;

    if (data.status === 'declined' || data.status === 'ended') {
      stopRingtone();
      onStateChange({ callId, caller: callerUsername, receiver: receiverUsername, isIncoming: false, status: data.status, isVideo: true });
      cleanupCallResources();
      return;
    }

    if (!peerConnection.currentRemoteDescription && data.answer) {
      stopRingtone();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      await flushPendingCandidates(peerConnection);
      onStateChange({ callId, caller: callerUsername, receiver: receiverUsername, isIncoming: false, status: 'connected', startTime: Date.now(), isVideo: true });
    }
  });

  unsubscribeCandidates = onSnapshot(receiverCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        await safeAddIceCandidate(peerConnection, change.doc.data() as RTCIceCandidateInit);
      }
    });
  });

  return callId;
}

// ─── answerVideoCall ──────────────────────────────────────────────────────────
export async function answerVideoCall(
  callId: string,
  onStateChange: CallListener,
  localEl?: HTMLVideoElement | null,
  remoteEl?: HTMLVideoElement | null
): Promise<void> {
  if (localEl !== undefined) localVideoElement = localEl;
  if (remoteEl !== undefined) remoteVideoElement = remoteEl;
  stopRingtone();
  pendingIceCandidates = [];

  const callDocRef = doc(db, 'calls', callId);
  const callSnapshot = await getDoc(callDocRef);
  if (!callSnapshot.exists()) throw new Error('Call does not exist or was ended.');

  const callData = callSnapshot.data();
  activeCallId = callId;

  const localStream = await getLocalStream(true);
  currentLocalStream = localStream;

  if (localVideoElement) {
    localVideoElement.muted = true; // Local preview — always muted
    localVideoElement.srcObject = localStream;
    localVideoElement.play().catch(() => {});
  }
  notifyVideoSubscribers();

  const peerConnection = createPeerConnection();
  currentPeerConnection = peerConnection;

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    currentRemoteStream = remoteStream;

    if (remoteVideoElement) {
      // MUTED: prevents double-audio echo (audio comes from hidden <audio> element only)
      remoteVideoElement.muted = true;
      remoteVideoElement.srcObject = remoteStream;
      remoteVideoElement.play().catch(() => {});
    }

    playRemoteAudio(remoteStream);
    notifyVideoSubscribers();
  };

  const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
  const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(receiverCandidatesCol, event.candidate.toJSON()).catch((e) =>
        console.warn('[Call] Error adding answer candidate:', e)
      );
    }
  };

  // Remote description MUST be set before adding ICE candidates
  await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
  await flushPendingCandidates(peerConnection);

  const answerDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answerDescription);

  await updateDoc(callDocRef, {
    answer: { type: answerDescription.type, sdp: answerDescription.sdp },
    status: 'connected',
    connectedAt: Date.now(),
    isVideo: true,
  });

  onStateChange({
    callId,
    caller: callData.callerDisplay || callData.caller,
    receiver: callData.receiverDisplay || callData.receiver,
    isIncoming: true,
    status: 'connected',
    startTime: Date.now(),
    isVideo: true,
  });

  unsubscribeCallDoc = onSnapshot(callDocRef, (snapshot) => {
    const data = snapshot.data();
    if (!data) return;
    if (data.status === 'ended' || data.status === 'declined') {
      onStateChange({ callId, caller: data.caller, receiver: data.receiver, isIncoming: true, status: data.status, isVideo: true });
      cleanupCallResources();
    }
  });

  unsubscribeCandidates = onSnapshot(callerCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        await safeAddIceCandidate(peerConnection, change.doc.data() as RTCIceCandidateInit);
      }
    });
  });
}

// ─── cleanupCallResources ─────────────────────────────────────────────────────
function cleanupCallResources(): void {
  stopRingtone();
  pendingIceCandidates = [];

  if (unsubscribeCallDoc) { unsubscribeCallDoc(); unsubscribeCallDoc = null; }
  if (unsubscribeCandidates) { unsubscribeCandidates(); unsubscribeCandidates = null; }

  if (currentLocalStream) {
    currentLocalStream.getTracks().forEach((t) => t.stop());
    currentLocalStream = null;
  }

  if (currentPeerConnection) {
    currentPeerConnection.close();
    currentPeerConnection = null;
  }

  // Clear audio element
  if (remoteAudioElement) {
    remoteAudioElement.pause();
    remoteAudioElement.srcObject = null;
  }

  // Clear video elements
  if (localVideoElement) localVideoElement.srcObject = null;
  if (remoteVideoElement) remoteVideoElement.srcObject = null;

  currentRemoteStream = null;
  notifyVideoSubscribers();
  activeCallId = null;

  console.log('[Call] Resources cleaned up');
}

// ─── subscribeToIncomingCalls ─────────────────────────────────────────────────
export function subscribeToIncomingCalls(
  username: string,
  onIncomingCall: IncomingCallListener
): () => void {
  if (!username) return () => {};

  const safeUsername = username.toLowerCase().trim();
  const callsRef = collection(db, 'calls');
  const q = query(callsRef, where('receiver', '==', safeUsername));

  const seenRingingIds = new Set<string>();

  return onSnapshot(
    q,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') {
          seenRingingIds.delete(change.doc.id);
          return;
        }

        const data = change.doc.data();
        const receiverKey = String(data.receiver || '').toLowerCase().trim();
        if (receiverKey !== safeUsername) return;
        if (data.status !== 'ringing') {
          seenRingingIds.delete(change.doc.id);
          return;
        }

        const ageMs = Date.now() - (data.createdAt || 0);
        if (ageMs > 120000) return;

        if (seenRingingIds.has(change.doc.id)) return;
        seenRingingIds.add(change.doc.id);

        playIncomingChime();
        onIncomingCall({
          callId: data.callId || change.doc.id,
          caller: data.callerDisplay || data.caller,
          receiver: data.receiverDisplay || data.receiver,
          isIncoming: true,
          status: 'ringing',
          isVideo: Boolean(data.isVideo || (data.callId && data.callId.startsWith('vcall_'))),
        });
      });
    },
    (error) => {
      console.error('[Call] Incoming call subscription failed:', error.message);
    }
  );
}
