export type OutputMode = "Car" | "Speaker" | "TV";
export type Page = "library" | "player" | "youtube" | "downloads" | "settings";

export interface Song {
  id: string;
  artist: string;
  album: string;
  title: string;
  url: string;
  favorite: boolean;
  length: string;
  artwork?: string;
}

export interface SearchResult {
  title: string;
  channel: string;
  length: string;
  url: string;
  thumbnail?: string;
}

export interface Theme {
  name: string;
  background: string;
  surface: string;
  surfaceStrong: string;
  field: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  selected: string;
  danger: string;
  success: string;
  glow: number;
  blur: number;
}

export interface Settings {
  gameExe: string;
  openChatKey: string;
  mode: OutputMode;
  volume: number;
  alwaysOnTop: boolean;
  closeAfterPlay: boolean;
  startMinimized: boolean;
  downloadFolder: string;
  theme: Theme;
  windowScale: number;
}

export interface DependencyStatus {
  ytdlp: boolean;
  ffmpeg: boolean;
  ffprobe: boolean;
}

export interface AppState {
  songs: Song[];
  settings: Settings;
  dependencies: DependencyStatus;
  dataDir: string;
}
