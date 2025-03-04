/**
 * YouTube player element with additional properties
 */
export interface YouTubePlayer extends HTMLElement {
  getVideoData?: () => {
    title: string;
    video_id: string;
    author: string;
  };
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
}

/**
 * Video metadata extracted from the player
 */
export interface VideoMetadata {
  id: string;
  title: string;
  url: string;
  duration: number;
  author: string;
}

/**
 * YouTube player states
 */
export enum PlayerState {
  UNSTARTED = -1,
  ENDED = 0,
  PLAYING = 1,
  PAUSED = 2,
  BUFFERING = 3,
  CUED = 5
}

/**
 * Events emitted by the video detector
 */
export interface VideoEvents {
  onPlayerFound: (player: YouTubePlayer) => void;
  onPlayerLost: () => void;
  onMetadataUpdated: (metadata: VideoMetadata) => void;
  onStateChange: (state: PlayerState) => void;
} 