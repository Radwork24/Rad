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
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface ActiveCallState {
  callId: string;
  caller: string;
  receiver: string;
  isIncoming: boolean;
  status: 'ringing' | 'connected' | 'ended' | 'declined';
  startTime?: number;
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
    caller: callerUsername,
    receiver: receiverUsername,
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
    caller: callData.caller,
    receiver: callData.receiver,
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
  // Query calls where receiver matches and status is 'ringing'
  const q = query(
    callsRef,
    where('receiver', '==', safeUsername),
    where('status', '==', 'ringing'),
    limit(1)
  );

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        // Ignore calls older than 60 seconds
        if (Date.now() - (data.createdAt || 0) < 60000) {
          playIncomingChime();
          onIncomingCall({
            callId: data.callId || change.doc.id,
            caller: data.caller,
            receiver: data.receiver,
            isIncoming: true,
            status: 'ringing',
          });
        }
      }
    });
  });
}
