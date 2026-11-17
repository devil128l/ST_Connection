// Production-grade WebRTC Calling Manager supporting 1:1 Voice & Video calls,
// STUN NAT traversal for VPS/Cloud deployments, and browser permission fallbacks.

export interface CallSession {
  callId: string;
  targetUserId: string;
  targetUserName: string;
  targetUserAvatar: string;
  type: 'voice' | 'video';
  isIncoming: boolean;
  status: 'connecting' | 'ringing' | 'connected' | 'ended';
  isMuted: boolean;
  isVideoOff: boolean;
  facingMode: 'user' | 'environment';
  durationSeconds: number;
}

export interface WebRTCSignalData {
  type: 'offer' | 'answer' | 'candidate' | 'reject' | 'hangup' | 'media_toggle' | 'incoming_call' | 'call_accepted' | 'call_rejected' | 'call_ended';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  callType?: 'voice' | 'video';
  callId?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 10,
};

export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  private currentCallId: string | null = null;
  private currentTargetUserId: string | null = null;
  private currentCallType: 'voice' | 'video' = 'voice';

  private sendSignalCallback: ((targetUserId: string, signalData: WebRTCSignalData, callType?: 'voice' | 'video', callId?: string) => void) | null = null;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: RTCPeerConnectionState) => void) | null = null;

  constructor() {}

  public setCallbacks(
    sendSignal: (targetUserId: string, signalData: WebRTCSignalData, callType?: 'voice' | 'video', callId?: string) => void,
    onRemoteStream?: (stream: MediaStream) => void,
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  ) {
    this.sendSignalCallback = sendSignal;
    if (onRemoteStream) this.onRemoteStreamCallback = onRemoteStream;
    if (onConnectionStateChange) this.onConnectionStateChangeCallback = onConnectionStateChange;
  }

  // Check if camera/mic APIs are allowed in current context (HTTPS or localhost)
  public isMediaDevicesSupported(): boolean {
    return !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // Generate fallback synthetic audio/video stream if mic/camera hardware is blocked or in insecure HTTP
  private createSyntheticStream(type: 'voice' | 'video'): MediaStream {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = AudioCtx ? new AudioCtx() : null;
      let audioTrack: MediaStreamTrack | null = null;

      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, ctx.currentTime); // silent background carrier
        const dst = ctx.createMediaStreamDestination();
        osc.connect(gain);
        gain.connect(dst);
        osc.start();
        audioTrack = dst.stream.getAudioTracks()[0] || null;
      }

      let videoTrack: MediaStreamTrack | null = null;
      if (type === 'video') {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const cCtx = canvas.getContext('2d');
        if (cCtx) {
          cCtx.fillStyle = '#1e293b';
          cCtx.fillRect(0, 0, 640, 480);
          cCtx.fillStyle = '#10b981';
          cCtx.font = '24px sans-serif';
          cCtx.fillText('ST CONNECTION HD', 200, 240);
        }
        const canvasStream = canvas.captureStream ? canvas.captureStream(10) : null;
        if (canvasStream) {
          videoTrack = canvasStream.getVideoTracks()[0] || null;
        }
      }

      const stream = new MediaStream();
      if (audioTrack) stream.addTrack(audioTrack);
      if (videoTrack) stream.addTrack(videoTrack);
      return stream;
    } catch (e) {
      console.warn('Could not generate synthetic media stream:', e);
      return new MediaStream();
    }
  }

  // Start local media stream with hardware error recovery
  public async startLocalMedia(
    type: 'voice' | 'video',
    facingMode: 'user' | 'environment' = 'user'
  ): Promise<MediaStream> {
    this.stopLocalMedia();
    this.currentCallType = type;

    if (!this.isMediaDevicesSupported()) {
      console.warn('[WebRTC] getUserMedia is not supported in this browser context (requires HTTPS or localhost on VPS). Using fallback stream.');
      const fallback = this.createSyntheticStream(type);
      this.localStream = fallback;
      return fallback;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          type === 'video'
            ? {
                facingMode,
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
              }
            : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;
      return stream;
    } catch (err: any) {
      console.warn('[WebRTC] Hardware media stream request failed or denied:', err?.message);
      // Attempt audio-only if video failed
      if (type === 'video') {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.localStream = audioOnly;
          return audioOnly;
        } catch {}
      }
      // Final fallback: synthetic stream so connection completes
      const fallback = this.createSyntheticStream(type);
      this.localStream = fallback;
      return fallback;
    }
  }

  // Create and configure RTCPeerConnection with STUN servers and event listeners
  private setupPeerConnection(targetUserId: string, callId: string) {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }

    this.currentTargetUserId = targetUserId;
    this.currentCallId = callId;
    this.pendingCandidates = [];

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnection = pc;

    // Attach local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate && this.sendSignalCallback && this.currentTargetUserId) {
        this.sendSignalCallback(
          this.currentTargetUserId,
          {
            type: 'candidate',
            candidate: event.candidate.toJSON(),
            callId: this.currentCallId || undefined,
          },
          this.currentCallType,
          this.currentCallId || undefined
        );
      }
    };

    // Remote Track handler
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
      }

      if (this.onRemoteStreamCallback && this.remoteStream) {
        this.onRemoteStreamCallback(this.remoteStream);
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state changed:', pc.connectionState);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE Connection state:', pc.iceConnectionState);
    };

    return pc;
  }

  // Caller: Create Offer and send to recipient
  public async createCallOffer(targetUserId: string, callType: 'voice' | 'video', callId: string): Promise<RTCSessionDescriptionInit | null> {
    this.currentCallType = callType;
    const pc = this.setupPeerConnection(targetUserId, callId);

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await pc.setLocalDescription(offer);

      if (this.sendSignalCallback) {
        this.sendSignalCallback(
          targetUserId,
          {
            type: 'offer',
            sdp: offer,
            callType,
            callId,
          },
          callType,
          callId
        );
      }
      return offer;
    } catch (err) {
      console.error('[WebRTC] Failed to create call offer:', err);
      return null;
    }
  }

  // Callee: Handle incoming Offer, create Answer and send back
  public async handleCallOffer(
    fromUserId: string,
    offerSdp: RTCSessionDescriptionInit,
    callType: 'voice' | 'video',
    callId: string
  ): Promise<RTCSessionDescriptionInit | null> {
    this.currentCallType = callType;
    const pc = this.setupPeerConnection(fromUserId, callId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));

      // Process any candidates received before remote description was ready
      await this.drainPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.sendSignalCallback) {
        this.sendSignalCallback(
          fromUserId,
          {
            type: 'answer',
            sdp: answer,
            callType,
            callId,
          },
          callType,
          callId
        );
      }
      return answer;
    } catch (err) {
      console.error('[WebRTC] Failed to handle offer and create answer:', err);
      return null;
    }
  }

  // Caller: Handle received Answer from callee
  public async handleCallAnswer(answerSdp: RTCSessionDescriptionInit) {
    if (!this.peerConnection) {
      console.warn('[WebRTC] Received answer but PeerConnection is null');
      return;
    }

    try {
      if (this.peerConnection.signalingState !== 'stable') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
        await this.drainPendingCandidates();
      }
    } catch (err) {
      console.error('[WebRTC] Failed to set remote description from answer:', err);
    }
  }

  // Both: Handle incoming ICE candidate
  public async handleIceCandidate(candidateInit: RTCIceCandidateInit) {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      // Queue candidate until remote description is set
      this.pendingCandidates.push(candidateInit);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (err) {
      console.warn('[WebRTC] Error adding ICE candidate:', err);
    }
  }

  private async drainPendingCandidates() {
    if (!this.peerConnection) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Error adding queued candidate:', e);
        }
      }
    }
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public toggleAudio(isMuted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
    if (this.sendSignalCallback && this.currentTargetUserId && this.currentCallId) {
      this.sendSignalCallback(
        this.currentTargetUserId,
        {
          type: 'media_toggle',
          isMuted,
          callId: this.currentCallId,
        },
        this.currentCallType,
        this.currentCallId
      );
    }
  }

  public toggleVideo(isVideoOff: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !isVideoOff;
      });
    }
    if (this.sendSignalCallback && this.currentTargetUserId && this.currentCallId) {
      this.sendSignalCallback(
        this.currentTargetUserId,
        {
          type: 'media_toggle',
          isVideoOff,
          callId: this.currentCallId,
        },
        this.currentCallType,
        this.currentCallId
      );
    }
  }

  public async switchCamera(facingMode: 'user' | 'environment'): Promise<MediaStream | null> {
    const newStream = await this.startLocalMedia('video', facingMode);
    if (this.peerConnection && newStream) {
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(newVideoTrack).catch(console.warn);
        }
      }
    }
    return newStream;
  }

  public stopLocalMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.remoteStream = null;
    }
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }
    this.pendingCandidates = [];
    this.currentCallId = null;
    this.currentTargetUserId = null;
  }

  public endCall(targetUserId?: string, callId?: string) {
    const target = targetUserId || this.currentTargetUserId;
    const cId = callId || this.currentCallId;

    if (this.sendSignalCallback && target) {
      this.sendSignalCallback(
        target,
        {
          type: 'hangup',
          callId: cId || undefined,
        },
        this.currentCallType,
        cId || undefined
      );
    }
    this.stopLocalMedia();
  }

  public rejectCall(targetUserId: string, callId: string) {
    if (this.sendSignalCallback && targetUserId) {
      this.sendSignalCallback(
        targetUserId,
        {
          type: 'reject',
          callId,
        },
        this.currentCallType,
        callId
      );
    }
    this.stopLocalMedia();
  }
}

export const webrtc = new WebRTCManager();
