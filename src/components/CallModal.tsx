import React, { useEffect, useState, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  SwitchCamera,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { webrtc, CallSession } from '../utils/webrtc.js';
import { sounds } from '../utils/audio.js';

interface CallModalProps {
  session: CallSession;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  isGroup?: boolean;
  groupName?: string;
}

export const CallModal: React.FC<CallModalProps> = ({
  session,
  onAccept,
  onReject,
  onEnd,
  isGroup = false,
  groupName,
}) => {
  const [isMuted, setIsMuted] = useState(session.isMuted);
  const [isVideoOff, setIsVideoOff] = useState(session.isVideoOff);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [duration, setDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Play ringtone on incoming call
  useEffect(() => {
    if (session.isIncoming && session.status === 'ringing') {
      sounds.startRingtone();
    }
    return () => {
      sounds.stopRingtone();
    };
  }, [session.isIncoming, session.status]);

  // Duration timer when connected
  useEffect(() => {
    let timer: any = null;
    if (session.status === 'connected') {
      sounds.stopRingtone();
      timer = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [session.status]);

  // Attach local media stream
  useEffect(() => {
    const stream = webrtc.getLocalStream();
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [session.status, isVideoOff]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    webrtc.toggleAudio(next);
  };

  const toggleVideo = () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    webrtc.toggleVideo(next);
  };

  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    const stream = await webrtc.switchCamera(nextFacing);
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 1. INCOMING CALL SCREEN
  if (session.isIncoming && session.status === 'ringing') {
    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
        <div className="w-full max-w-sm bg-[#111b21] border border-[#202c33] rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
          {/* Pulsing ring indicator */}
          <div className="absolute top-12 w-36 h-36 rounded-full bg-emerald-500/20 animate-ping pointer-events-none" />

          <div className="relative mb-6">
            <img
              src={session.targetUserAvatar}
              alt={session.targetUserName}
              className="w-28 h-28 rounded-full object-cover border-4 border-emerald-500/40 shadow-xl"
            />
            <div className="absolute bottom-0 right-0 p-2 rounded-full bg-emerald-600 text-white shadow">
              {session.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            </div>
          </div>

          <h3 className="text-xl font-bold text-white mb-1">{session.targetUserName}</h3>
          <p className="text-xs text-emerald-400 font-medium mb-8 animate-pulse flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Incoming ST WebRTC {session.type === 'video' ? 'Video' : 'Voice'} Call...
          </p>

          <div className="flex items-center justify-center gap-8 w-full">
            {/* Decline */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  sounds.playHangup();
                  onReject();
                }}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-900/40 transition active:scale-95 cursor-pointer"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-[11px] text-slate-400">Decline</span>
            </div>

            {/* Accept */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  sounds.stopRingtone();
                  onAccept();
                }}
                className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-900/40 transition active:scale-95 animate-bounce cursor-pointer"
              >
                <Phone className="w-7 h-7" />
              </button>
              <span className="text-[11px] text-emerald-400 font-medium">Accept</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. CONNECTED OR OUTGOING ACTIVE CALL SCREEN
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#0b141a] text-white flex flex-col justify-between overflow-hidden"
    >
      {/* Top Bar */}
      <div className="p-4 sm:p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-emerald-600/30 text-emerald-400">
            {isGroup ? <Users className="w-5 h-5" /> : session.type === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-white">
              {isGroup ? groupName || 'Group Call' : session.targetUserName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                {session.status === 'connected' ? formatDuration(duration) : 'Ringing...'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                End-to-End Encrypted
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session.type === 'video' && (
            <button
              type="button"
              onClick={toggleCameraFacing}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="Switch camera"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Main Video / Participant Stage */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        {session.type === 'video' && !isVideoOff ? (
          <div className="w-full h-full relative rounded-2xl overflow-hidden bg-black flex items-center justify-center">
            {/* Remote Video Stream / Simulated feed */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {/* Placeholder if remote stream video is connecting */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111b21]/70">
              <img
                src={session.targetUserAvatar}
                alt={session.targetUserName}
                className="w-24 h-24 rounded-full object-cover border-2 border-emerald-500 shadow-2xl mb-3 animate-pulse"
              />
              <p className="text-sm font-semibold">{session.targetUserName}</p>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                {session.status === 'connected' ? 'Connected • Live 720p HD' : 'Connecting peer-to-peer WebRTC...'}
              </p>
            </div>

            {/* Local Video Picture-in-Picture (PiP) */}
            <div className="absolute top-4 right-4 w-28 sm:w-36 aspect-video rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-900 z-10">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
              <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[9px] text-white">
                You
              </div>
            </div>
          </div>
        ) : (
          /* Voice Call Stage */
          <div className="flex flex-col items-center justify-center">
            <div className="relative mb-6">
              {/* Dynamic waveform ripples */}
              <div className="absolute -inset-4 rounded-full bg-emerald-500/10 animate-ping" />
              <div className="absolute -inset-8 rounded-full bg-emerald-500/5 animate-pulse" />
              <img
                src={session.targetUserAvatar}
                alt={session.targetUserName}
                className="w-36 h-36 rounded-full object-cover border-4 border-emerald-500/40 shadow-2xl relative z-10"
              />
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">{session.targetUserName}</h3>
            <p className="text-sm text-emerald-400 font-mono">
              {session.status === 'connected' ? formatDuration(duration) : 'Calling...'}
            </p>
          </div>
        )}
      </div>

      {/* Floating Control Dock */}
      <div className="p-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-4 sm:gap-6 z-20">
        {/* Toggle Mic */}
        <button
          type="button"
          onClick={toggleMute}
          className={`p-4 rounded-full transition shadow-lg cursor-pointer ${
            isMuted ? 'bg-red-600 text-white' : 'bg-[#202c33] hover:bg-[#2a3942] text-white'
          }`}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* Toggle Camera */}
        {session.type === 'video' && (
          <button
            type="button"
            onClick={toggleVideo}
            className={`p-4 rounded-full transition shadow-lg cursor-pointer ${
              isVideoOff ? 'bg-red-600 text-white' : 'bg-[#202c33] hover:bg-[#2a3942] text-white'
            }`}
            title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>
        )}

        {/* Toggle Speaker Volume */}
        <button
          type="button"
          onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
          className={`p-4 rounded-full transition shadow-lg cursor-pointer ${
            isSpeakerMuted ? 'bg-amber-600 text-white' : 'bg-[#202c33] hover:bg-[#2a3942] text-white'
          }`}
          title={isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker'}
        >
          {isSpeakerMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>

        {/* End Call Button */}
        <button
          type="button"
          onClick={() => {
            sounds.playHangup();
            onEnd();
          }}
          className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white transition shadow-xl shadow-rose-950/60 cursor-pointer"
          title="Hang up call"
        >
          <PhoneOff className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
};
