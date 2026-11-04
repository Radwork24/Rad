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

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
};

let currentPeerConnection: RTCPeerConnection | null = null;
let currentLocalStream: MediaStream | null = null;
let remoteAudioElement: HTMLAudioElement | null = null;
let activeCallId: string | null = null;
let unsubscribeCallDoc: (() => void) | null = null;
let unsubscribeCandidates: (() => void) | null = null;

// Ringtone synthesizers using Web Audio API (no external asset dependencies)
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

/**
 * Ensures a hidden <audio> element exists to play the peer's live voice.
 */
function getRemoteAudioElement(): HTMLAudioElement {
  if (!remoteAudioElement) {
    remoteAudioElement = document.createElement('audio');
    remoteAudioElement.autoplay = true;
    remoteAudioElement.id = 'rad-remote-voice-audio';
    remoteAudioElement.style.display = 'none';
    document.body.appendChild(remoteAudioElement);
  }
  return remoteAudioElement;
}

/**
 * Initiates an outgoing WebRTC voice call to a friend.
 */
export async function startVoiceCall(
  callerUsername: string,
  receiverUsername: string,
  onStateChange: CallListener
): Promise<string> {
  // Clean up any stale call first
  await endVoiceCall();

  // 1. Get user microphone stream
  let localStream: MediaStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (err) {
    console.error('Failed to access microphone:', err);
    throw new Error('Microphone permission is required to make a voice call.');
  }

  currentLocalStream = localStream;
  const peerConnection = new RTCPeerConnection(ICE_SERVERS);
  currentPeerConnection = peerConnection;

  // Add audio tracks to peer connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Handle incoming remote audio track
  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    const audioEl = getRemoteAudioElement();
    audioEl.srcObject = remoteStream;
    audioEl.play().catch((e) => console.warn('Autoplay blocked:', e));
  };

  // Generate unique call document in Firestore
  const safeCaller = callerUsername.toLowerCase().trim();
  const safeReceiver = receiverUsername.toLowerCase().trim();
  const callId = `call_${safeCaller}_${safeReceiver}_${Date.now()}`;
  activeCallId = callId;

  const callDocRef = doc(db, 'calls', callId);
  const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
  const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');

  // Push ICE candidates generated locally to Firestore
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(callerCandidatesCol, event.candidate.toJSON()).catch((e) =>
        console.warn('Error saving caller candidate:', e)
      );
    }
  };

  // Create WebRTC Offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const callData = {
    callId,
    caller: safeCaller,
    receiver: safeReceiver,
    callerDisplay: callerUsername,
    receiverDisplay: receiverUsername,
    status: 'ringing',
    offer: {
      type: offer.type,
      sdp: offer.sdp,
    },
    createdAt: Date.now(),
  };

  await setDoc(callDocRef, callData);

  playOutgoingTone();

  onStateChange({
    callId,
    caller: callerUsername,
    receiver: receiverUsername,
    isIncoming: false,
    status: 'ringing',
  });

  // Listen for the receiver's answer or status change
  unsubscribeCallDoc = onSnapshot(callDocRef, async (snapshot) => {
    const data = snapshot.data();
    if (!data) return;

    if (data.status === 'declined' || data.status === 'ended') {
      stopRingtone();
      onStateChange({
        callId,
        caller: callerUsername,
        receiver: receiverUsername,
        isIncoming: false,
        status: data.status,
      });
      cleanupCallResources();
      return;
    }

    if (!peerConnection.currentRemoteDescription && data.answer) {
      stopRingtone();
      const rtcAnswer = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcAnswer);

      onStateChange({
        callId,
        caller: callerUsername,
        receiver: receiverUsername,
        isIncoming: false,
        status: 'connected',
        startTime: Date.now(),
      });
    }
  });

  // Listen for ICE candidates added by receiver
  unsubscribeCandidates = onSnapshot(receiverCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const candidateData = change.doc.data();
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
        } catch (e) {
          console.warn('Error adding receiver candidate:', e);
        }
      }
    });
  });

  return callId;
}

/**
 * Answers an incoming voice call.
 */
export async function answerVoiceCall(
  callId: string,
  onStateChange: CallListener
): Promise<void> {
  stopRingtone();

  const callDocRef = doc(db, 'calls', callId);
  const callSnapshot = await getDoc(callDocRef);
  if (!callSnapshot.exists()) {
    throw new Error('Call does not exist or was ended.');
  }

  const callData = callSnapshot.data();
  activeCallId = callId;

  // 1. Get microphone access
  let localStream: MediaStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (err) {
    console.error('Failed to get mic:', err);
    throw new Error('Microphone permission is required to answer the call.');
  }

  currentLocalStream = localStream;
  const peerConnection = new RTCPeerConnection(ICE_SERVERS);
  currentPeerConnection = peerConnection;

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    const audioEl = getRemoteAudioElement();
    audioEl.srcObject = remoteStream;
    audioEl.play().catch((e) => console.warn('Autoplay error:', e));
  };

  const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
  const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(receiverCandidatesCol, event.candidate.toJSON()).catch((e) =>
        console.warn('Error adding answer candidate:', e)
      );
    }
  };

  // Set remote offer & generate answer
  const offerDescription = callData.offer;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDocRef, {
    answer,
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

  // Listen for call updates / remote end
  unsubscribeCallDoc = onSnapshot(callDocRef, (snapshot) => {
    const data = snapshot.data();
    if (!data) return;
    if (data.status === 'ended' || data.status === 'declined') {
      onStateChange({
        callId,
        caller: data.caller,
        receiver: data.receiver,
        isIncoming: true,
        status: data.status,
      });
      cleanupCallResources();
    }
  });

  // Listen for caller ICE candidates
  unsubscribeCandidates = onSnapshot(callerCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const candidateData = change.doc.data();
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
        } catch (e) {
          console.warn('Error adding caller candidate:', e);
        }
      }
    });
  });
}

/**
 * Rejects or declines an incoming call.
 */
export async function rejectVoiceCall(callId: string): Promise<void> {
  stopRingtone();
  try {
    const callDocRef = doc(db, 'calls', callId);
    await updateDoc(callDocRef, {
      status: 'declined',
      endedAt: Date.now(),
    });
  } catch (e) {
    console.warn('Error declining call:', e);
  }
  cleanupCallResources();
}

/**
 * Ends an active or ongoing voice call.
 */
export async function endVoiceCall(): Promise<void> {
  stopRingtone();
  if (activeCallId) {
    try {
      const callDocRef = doc(db, 'calls', activeCallId);
      await updateDoc(callDocRef, {
        status: 'ended',
        endedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Error marking call ended:', e);
    }
  }
  cleanupCallResources();
}

/**
 * Toggles the local microphone mute state.
 */
export function toggleLocalMute(isMuted: boolean): void {
  if (currentLocalStream) {
    currentLocalStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  }
}

function cleanupCallResources(): void {
  stopRingtone();

  if (unsubscribeCallDoc) {
    unsubscribeCallDoc();
    unsubscribeCallDoc = null;
  }
  if (unsubscribeCandidates) {
    unsubscribeCandidates();
    unsubscribeCandidates = null;
  }

  if (currentLocalStream) {
    currentLocalStream.getTracks().forEach((t) => t.stop());
    currentLocalStream = null;
  }

  if (currentPeerConnection) {
    currentPeerConnection.close();
    currentPeerConnection = null;
  }

  if (remoteAudioElement) {
    remoteAudioElement.srcObject = null;
  }

  activeCallId = null;
}

/**
 * Real-time subscription to detect incoming calls for a logged-in user.
 */
export function subscribeToIncomingCalls(
  username: string,
  onIncomingCall: IncomingCallListener
): () => void {
  if (!username) return () => {};

  const safeUsername = username.toLowerCase().trim();
  const callsRef = collection(db, 'calls');
  // Single-field query so Firestore does not require a composite index.
  // Status and freshness are filtered on the client.
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
      console.error('Incoming call subscription failed:', error.message);
    }
  );
}


// ============================================================
// VIDEO CALL EXTENSIONS
// ============================================================

let currentVideoStream: MediaStream | null = null;
let currentRemoteStream: MediaStream | null = null;
let remoteVideoElement: HTMLVideoElement | null = null;
let localVideoElement: HTMLVideoElement | null = null;
const streamSubscribers = new Set<(local: MediaStream | null, remote: MediaStream | null) => void>();

function notifyStreamSubscribers(): void {
  streamSubscribers.forEach((fn) => {
    try {
      fn(currentVideoStream, currentRemoteStream);
    } catch (e) {
      console.warn('Stream subscriber error:', e);
    }
  });
}

/**
 * Subscribes to live local and remote MediaStreams for video calls.
 * Fires immediately with the current state.
 */
export function subscribeToVideoStreams(
  listener: (local: MediaStream | null, remote: MediaStream | null) => void
): () => void {
  streamSubscribers.add(listener);
  try {
    listener(currentVideoStream, currentRemoteStream);
  } catch {}
  return () => {
    streamSubscribers.delete(listener);
  };
}

/**
 * Attaches the current active local/remote streams to provided DOM <video> elements.
 */
export function attachVideoElements(
  localEl?: HTMLVideoElement | null,
  remoteEl?: HTMLVideoElement | null
): void {
  if (localEl !== undefined) {
    localVideoElement = localEl;
    if (localEl && currentVideoStream) {
      localEl.srcObject = currentVideoStream;
      localEl.muted = true;
      localEl.play().catch(() => {});
    }
  }
  if (remoteEl !== undefined) {
    remoteVideoElement = remoteEl;
    if (remoteEl && currentRemoteStream) {
      remoteEl.srcObject = currentRemoteStream;
      remoteEl.play().catch(() => {});
    }
  }
}

/**
 * Exposes the current local camera/mic stream so React components
 * can attach it to a <video> element for self-preview.
 */
export function getLocalVideoStream(): MediaStream | null {
  return currentVideoStream;
}

export function getRemoteVideoStream(): MediaStream | null {
  return currentRemoteStream;
}

/**
 * Toggles the local camera on/off during a connected video call.
 */
export function toggleLocalVideo(isCameraOff: boolean): void {
  if (currentVideoStream) {
    currentVideoStream.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOff;
    });
  }
  // Also toggle for audio-only stream used in voice paths
  if (currentLocalStream) {
    currentLocalStream.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOff;
    });
  }
}

/**
 * Initiates an outgoing WebRTC VIDEO + audio call.
 */
export async function startVideoCall(
  callerUsername: string,
  receiverUsername: string,
  onStateChange: CallListener,
  localVideoEl?: HTMLVideoElement | null,
  remoteVideoEl?: HTMLVideoElement | null
): Promise<string> {
  // Clean up stale calls
  await endVoiceCall();

  // Capture camera + mic
  let localStream: MediaStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    });
  } catch (err) {
    console.error('Failed to access camera/mic:', err);
    throw new Error('Camera and microphone permission required for a video call.');
  }

  currentVideoStream = localStream;
  currentLocalStream = localStream;

  if (localVideoEl) {
    localVideoElement = localVideoEl;
    localVideoEl.srcObject = localStream;
    localVideoEl.muted = true;
    localVideoEl.play().catch(() => {});
  }
  if (remoteVideoEl) {
    remoteVideoElement = remoteVideoEl;
  }
  notifyStreamSubscribers();

  const peerConnection = new RTCPeerConnection(ICE_SERVERS);
  currentPeerConnection = peerConnection;

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Play remote video when stream arrives
  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    currentRemoteStream = remoteStream;
    notifyStreamSubscribers();
    if (remoteVideoElement) {
      remoteVideoElement.srcObject = remoteStream;
      remoteVideoElement.play().catch(() => {});
    }
    // Also feed audio to hidden audio element
    const audioEl = getRemoteAudioElement();
    audioEl.srcObject = remoteStream;
    audioEl.play().catch(() => {});
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
      addDoc(callerCandidatesCol, event.candidate.toJSON()).catch(() => {});
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
      onStateChange({
        callId,
        caller: callerUsername,
        receiver: receiverUsername,
        isIncoming: false,
        status: data.status,
        isVideo: true,
      });
      cleanupVideoResources();
      return;
    }

    if (!peerConnection.currentRemoteDescription && data.answer) {
      stopRingtone();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      onStateChange({
        callId,
        caller: callerUsername,
        receiver: receiverUsername,
        isIncoming: false,
        status: 'connected',
        startTime: Date.now(),
        isVideo: true,
      });
    }
  });

  unsubscribeCandidates = onSnapshot(receiverCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        } catch {}
      }
    });
  });

  return callId;
}

/**
 * Answers an incoming video call and attaches local/remote streams to provided video elements.
 */
export async function answerVideoCall(
  callId: string,
  onStateChange: CallListener,
  localVideoEl?: HTMLVideoElement | null,
  remoteVideoEl?: HTMLVideoElement | null
): Promise<void> {
  stopRingtone();

  const callDocRef = doc(db, 'calls', callId);
  const callSnapshot = await getDoc(callDocRef);
  if (!callSnapshot.exists()) throw new Error('Call does not exist or was ended.');

  const callData = callSnapshot.data();
  activeCallId = callId;

  let localStream: MediaStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    });
  } catch (err) {
    throw new Error('Camera and microphone permission required to answer video call.');
  }

  currentVideoStream = localStream;
  currentLocalStream = localStream;

  if (localVideoEl) {
    localVideoElement = localVideoEl;
    localVideoEl.srcObject = localStream;
    localVideoEl.muted = true;
    localVideoEl.play().catch(() => {});
  }
  if (remoteVideoEl) {
    remoteVideoElement = remoteVideoEl;
  }
  notifyStreamSubscribers();

  const peerConnection = new RTCPeerConnection(ICE_SERVERS);
  currentPeerConnection = peerConnection;

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    currentRemoteStream = remoteStream;
    notifyStreamSubscribers();
    if (remoteVideoElement) {
      remoteVideoElement.srcObject = remoteStream;
      remoteVideoElement.play().catch(() => {});
    }
    const audioEl = getRemoteAudioElement();
    audioEl.srcObject = remoteStream;
    audioEl.play().catch(() => {});
  };

  const callerCandidatesCol = collection(callDocRef, 'callerCandidates');
  const receiverCandidatesCol = collection(callDocRef, 'receiverCandidates');

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(receiverCandidatesCol, event.candidate.toJSON()).catch(() => {});
    }
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
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
    isVideo: true,
  });

  unsubscribeCallDoc = onSnapshot(callDocRef, (snapshot) => {
    const data = snapshot.data();
    if (!data) return;
    if (data.status === 'ended' || data.status === 'declined') {
      onStateChange({
        callId,
        caller: data.caller,
        receiver: data.receiver,
        isIncoming: true,
        status: data.status,
        isVideo: true,
      });
      cleanupVideoResources();
    }
  });

  unsubscribeCandidates = onSnapshot(callerCandidatesCol, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        } catch {}
      }
    });
  });
}

function cleanupVideoResources(): void {
  if (currentVideoStream) {
    currentVideoStream.getTracks().forEach((t) => t.stop());
    currentVideoStream = null;
  }
  currentRemoteStream = null;
  notifyStreamSubscribers();
  if (localVideoElement) {
    localVideoElement.srcObject = null;
    localVideoElement = null;
  }
  if (remoteVideoElement) {
    remoteVideoElement.srcObject = null;
    remoteVideoElement = null;
  }
  cleanupCallResources();
}


