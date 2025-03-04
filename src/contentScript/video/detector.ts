import { logger } from '../logger';
import { debounce } from '../utils';
import { YouTubePlayer, VideoMetadata, PlayerState, VideoEvents } from './types';

/**
 * Class responsible for detecting and monitoring the YouTube player
 */
export class VideoDetector {
  private static instance: VideoDetector;
  private observer: MutationObserver | null = null;
  private player: YouTubePlayer | null = null;
  private events: Partial<VideoEvents> = {};
  private metadataCheckInterval: number | null = null;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): VideoDetector {
    if (!VideoDetector.instance) {
      VideoDetector.instance = new VideoDetector();
    }
    return VideoDetector.instance;
  }

  /**
   * Initialize the detector
   */
  public initialize(events: Partial<VideoEvents>): void {
    this.events = events;
    this.startObserving();
    logger.debug('Video detector initialized');
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopObserving();
    this.clearMetadataCheck();
    this.player = null;
    logger.debug('Video detector destroyed');
  }

  /**
   * Start observing DOM changes to detect the player
   */
  private startObserving(): void {
    logger.debug('Starting player detection');

    // First try to find existing player
    this.findPlayer();

    // Setup observer for dynamic changes
    this.observer = new MutationObserver(
      debounce(() => {
        if (!this.player) {
          this.findPlayer();
        }
      }, 500)
    );

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Stop observing DOM changes
   */
  private stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Find the YouTube player element
   */
  private findPlayer(): void {
    // Try to find the player element
    const player = document.querySelector('#movie_player') as YouTubePlayer;

    if (player && this.isValidPlayer(player)) {
      logger.info('YouTube player found');
      this.handlePlayerFound(player);
    }
  }

  /**
   * Validate that the player has the expected API methods
   */
  private isValidPlayer(player: YouTubePlayer): boolean {
    return (
      typeof player.getVideoData === 'function' &&
      typeof player.getCurrentTime === 'function' &&
      typeof player.getDuration === 'function' &&
      typeof player.getPlayerState === 'function'
    );
  }

  /**
   * Handle when a valid player is found
   */
  private handlePlayerFound(player: YouTubePlayer): void {
    this.player = player;
    this.events.onPlayerFound?.(player);
    this.startMetadataCheck();
    this.setupPlayerStateMonitoring();
  }

  /**
   * Start periodic metadata checks
   */
  private startMetadataCheck(): void {
    // Clear any existing interval
    this.clearMetadataCheck();

    // Check metadata immediately
    this.checkMetadata();

    // Setup periodic checks
    this.metadataCheckInterval = window.setInterval(() => {
      this.checkMetadata();
    }, 1000) as unknown as number;
  }

  /**
   * Clear metadata check interval
   */
  private clearMetadataCheck(): void {
    if (this.metadataCheckInterval !== null) {
      clearInterval(this.metadataCheckInterval);
      this.metadataCheckInterval = null;
    }
  }

  /**
   * Check and update video metadata
   */
  private checkMetadata(): void {
    if (!this.player) return;

    try {
      const videoData = this.player.getVideoData?.();
      if (!videoData) return;

      const metadata: VideoMetadata = {
        id: videoData.video_id,
        title: videoData.title,
        author: videoData.author,
        url: window.location.href,
        duration: this.player.getDuration?.() || 0
      };

      this.events.onMetadataUpdated?.(metadata);
    } catch (error) {
      logger.error('Failed to extract video metadata', error);
    }
  }

  /**
   * Setup monitoring of player state changes
   */
  private setupPlayerStateMonitoring(): void {
    if (!this.player || !this.player.getPlayerState) return;

    // Create a proxy to intercept state changes
    const originalGetPlayerState = this.player.getPlayerState.bind(this.player);
    let lastState = originalGetPlayerState();

    this.player.getPlayerState = function(this: YouTubePlayer): number {
      const currentState = originalGetPlayerState();
      
      if (currentState !== lastState) {
        lastState = currentState;
        VideoDetector.instance.events.onStateChange?.(currentState);
      }

      return currentState;
    };
  }

  /**
   * Get the current player instance
   */
  public getPlayer(): YouTubePlayer | null {
    return this.player;
  }

  /**
   * Check if we have a valid player
   */
  public hasValidPlayer(): boolean {
    return this.player !== null && this.isValidPlayer(this.player);
  }
} 