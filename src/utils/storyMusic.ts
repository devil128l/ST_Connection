import { StorySong } from '../types.js';

export interface CatalogSong {
  id: string;
  title: string;
  artist: string;
  genre: string;
  albumArt: string;
  duration: number;
  audioUrl: string;
}

export const CATALOG_SONGS: CatalogSong[] = [
  {
    id: 'song_kesariya',
    title: 'Kesariya',
    artist: 'Arijit Singh, Pritam',
    genre: 'Bollywood Romantic',
    albumArt: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_kesariya.wav',
  },
  {
    id: 'song_brown_munde',
    title: 'Brown Munde',
    artist: 'AP Dhillon, Gurinder Gill',
    genre: 'Punjabi Hip-Hop',
    albumArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_brown_munde.wav',
  },
  {
    id: 'song_apna_bana_le',
    title: 'Apna Bana Le',
    artist: 'Arijit Singh, Sachin-Jigar',
    genre: 'Romantic Melody',
    albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_apna_bana_le.wav',
  },
  {
    id: 'song_shape_of_you',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    genre: 'Pop Dance',
    albumArt: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_shape_of_you.wav',
  },
  {
    id: 'song_lofi_midnight',
    title: 'Midnight Drive (Lofi Chill)',
    artist: 'Lofi Aesthetic Beats',
    genre: 'Lofi / Study',
    albumArt: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_lofi_midnight.wav',
  },
  {
    id: 'song_pasoori',
    title: 'Pasoori',
    artist: 'Ali Sethi, Shae Gill',
    genre: 'Folk Fusion',
    albumArt: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_pasoori.wav',
  },
  {
    id: 'song_raataan_lambiyan',
    title: 'Raataan Lambiyan',
    artist: 'Jubin Nautiyal, Asees Kaur',
    genre: 'Bollywood Soul',
    albumArt: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_raataan_lambiyan.wav',
  },
  {
    id: 'song_calm_down',
    title: 'Calm Down',
    artist: 'Rema, Selena Gomez',
    genre: 'Afrobeats / Pop',
    albumArt: 'https://images.unsplash.com/photo-1520523839898-507125cd53c1?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_calm_down.wav',
  },
  {
    id: 'song_starboy',
    title: 'Starboy',
    artist: 'The Weeknd, Daft Punk',
    genre: 'Synthwave / R&B',
    albumArt: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_starboy.wav',
  },
  {
    id: 'song_kahani_suno',
    title: 'Kahani Suno 2.0',
    artist: 'Kaifi Khalil',
    genre: 'Acoustic / Ballad',
    albumArt: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&auto=format&fit=crop&q=80',
    duration: 30,
    audioUrl: '/audio/song_kahani_suno.wav',
  },
];

type AudioStatusListener = (status: { isPlaying: boolean; isMuted: boolean; autoplayBlocked: boolean; currentSongId: string | null }) => void;

class StoryMusicEngine {
  private audioElement: HTMLAudioElement | null = null;
  private isMuted: boolean = false;
  private isPlaying: boolean = false;
  private autoplayBlocked: boolean = false;
  private currentSong: (StorySong | CatalogSong) | null = null;
  private listeners: Set<AudioStatusListener> = new Set();

  constructor() {
    // Global user-gesture unlock listener
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.currentSong && (!this.isPlaying || this.autoplayBlocked)) {
          this.playSong(this.currentSong);
        }
      };
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  public subscribe(listener: AudioStatusListener): () => void {
    this.listeners.add(listener);
    listener({
      isPlaying: this.isPlaying,
      isMuted: this.isMuted,
      autoplayBlocked: this.autoplayBlocked,
      currentSongId: this.currentSong?.id || null,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = {
      isPlaying: this.isPlaying,
      isMuted: this.isMuted,
      autoplayBlocked: this.autoplayBlocked,
      currentSongId: this.currentSong?.id || null,
    };
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('Error in audio status listener:', e);
      }
    }
  }

  public playSong(song: StorySong | CatalogSong) {
    this.currentSong = song;

    // Resolve audio URL
    let url = song.audioUrl;
    if (!url) {
      // Find matching catalog track
      const match = CATALOG_SONGS.find(s => s.id === song.id || s.title.toLowerCase() === song.title.toLowerCase());
      if (match) {
        url = match.audioUrl;
      }
    }

    if (!url) {
      console.warn('No audio URL found for song:', song);
      return;
    }

    // Stop current audio if different source
    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch (e) {}
    }

    try {
      const audio = new Audio();
      audio.src = url;
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = this.isMuted ? 0 : 0.85;

      this.audioElement = audio;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isPlaying = true;
            this.autoplayBlocked = false;
            this.notify();
          })
          .catch(err => {
            console.warn('Autoplay prevented by browser:', err);
            this.isPlaying = false;
            this.autoplayBlocked = true;
            this.notify();
          });
      } else {
        this.isPlaying = true;
        this.autoplayBlocked = false;
        this.notify();
      }
    } catch (err) {
      console.error('Failed to create or play audio:', err);
      this.isPlaying = false;
      this.autoplayBlocked = true;
      this.notify();
    }
  }

  public unlockAndPlay() {
    this.autoplayBlocked = false;
    if (this.currentSong) {
      this.playSong(this.currentSong);
    } else if (this.audioElement) {
      this.audioElement.play().then(() => {
        this.isPlaying = true;
        this.autoplayBlocked = false;
        this.notify();
      }).catch(() => {});
    }
  }

  public pause() {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch (e) {}
    }
    this.isPlaying = false;
    this.notify();
  }

  public resume(song?: StorySong | CatalogSong) {
    if (this.audioElement && this.currentSong) {
      this.audioElement.volume = this.isMuted ? 0 : 0.85;
      this.audioElement.play().then(() => {
        this.isPlaying = true;
        this.autoplayBlocked = false;
        this.notify();
      }).catch(() => {
        this.autoplayBlocked = true;
        this.notify();
      });
    } else if (song) {
      this.playSong(song);
    }
  }

  public stop() {
    this.isPlaying = false;
    this.autoplayBlocked = false;
    this.currentSong = null;
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.src = '';
      } catch (e) {}
      this.audioElement = null;
    }
    this.notify();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.audioElement) {
      this.audioElement.volume = muted ? 0 : 0.85;
    }
    this.notify();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getAutoplayBlocked(): boolean {
    return this.autoplayBlocked;
  }
}

export const storyMusic = new StoryMusicEngine();
