// High quality Web Audio API sound generator for ringtones, notifications and alerts

class SoundEngine {
  private ctx: AudioContext | null = null;
  private ringtoneInterval: any = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Pleasant message chime (WhatsApp-like pop chime)
  playMessageReceived() {
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Sent message whoosh / pop
  playMessageSent() {
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Phone Ringtone for incoming voice/video call
  startRingtone() {
    this.stopRingtone();
    const playBurst = () => {
      try {
        const ctx = this.initCtx();
        if (!ctx) return;

        // Two-tone marimba chime
        const playTone = (freq: number, startDelay: number, dur: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);

          gain.gain.setValueAtTime(0.25, ctx.currentTime + startDelay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(ctx.currentTime + startDelay);
          osc.stop(ctx.currentTime + startDelay + dur);
        };

        playTone(659.25, 0.0, 0.2); // E5
        playTone(523.25, 0.22, 0.2); // C5
        playTone(659.25, 0.44, 0.2); // E5
        playTone(783.99, 0.66, 0.4); // G5
      } catch (e) {
        console.warn('Ringtone error:', e);
      }
    };

    playBurst();
    this.ringtoneInterval = setInterval(playBurst, 2400);
  }

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  // Hangup tone
  playHangup() {
    this.stopRingtone();
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.setValueAtTime(280, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.warn('Hangup audio error:', e);
    }
  }

  // Recording start beep
  playRecordStart() {
    try {
      const ctx = this.initCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  }
}

export const sounds = new SoundEngine();
