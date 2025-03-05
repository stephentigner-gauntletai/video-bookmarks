import { logger } from '../logger';
import { debounce } from '../utils';
import { YouTubePlayer, VideoMetadata, PlayerState, VideoEvents } from './types';
import { VideoEventMonitor } from './events';
import { VideoControls } from '../ui/controls';
import { BackgroundMessageType } from '../../background/types';

/**
 * Class responsible for detecting and monitoring the YouTube player
 */
export class VideoDetector {
  private static instance: VideoDetector;
  private observer: MutationObserver | null = null;
  private player: YouTubePlayer | null = null;
  private events: Partial<VideoEvents> = {};
  private metadataCheckInterval: number | null = null;
  private eventMonitor: VideoEventMonitor | null = null;
  private controls: VideoControls | null = null;
  private tabId: number = -1;

  private constructor() {
    // Initialize tabId
    this.initializeTabId();
  }

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
   * Initialize tab ID by sending a message to the background script
   */
  private async initializeTabId(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: BackgroundMessageType.GET_TAB_ID
      });
      this.tabId = response.tabId;
      logger.debug('Tab ID initialized:', this.tabId);
    } catch (error) {
      logger.error('Failed to get tab ID:', error);
      this.tabId = -1;
    }
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
    if (this.eventMonitor) {
      this.eventMonitor.stop();
      this.eventMonitor = null;
    }
    if (this.controls) {
      this.controls.destroy();
      this.controls = null;
    }
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
      }, 1000) // Increased debounce time to reduce spam
    );

    // Observe both body and head for changes
    this.observer.observe(document.documentElement, {
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
    
    if (!player) {
      logger.debug('Player element not found');
      return;
    }

    // If we already found and validated this player, skip
    if (this.player === player) {
      return;
    }

    logger.debug('Found player element, checking API initialization...');
    logger.debug('Found player element:', player);

    // Wait for YouTube API to initialize
    this.waitForPlayerAPI(player, 0).catch(error => {
      logger.error('Failed waiting for player API:', error);
    });
  }

  /**
   * Wait for YouTube player API to initialize with exponential backoff
   */
  private async waitForPlayerAPI(player: YouTubePlayer, attempt: number): Promise<void> {
    // Max 10 attempts (about 10 seconds total)
    const MAX_ATTEMPTS = 10;
    // Start with 100ms delay, double each time
    const delay = Math.min(100 * Math.pow(2, attempt), 2000);

    if (attempt >= MAX_ATTEMPTS) {
      logger.warn('Gave up waiting for player API initialization');
      return;
    }

    // Check if API is ready
    if (this.isValidPlayer(player)) {
      logger.info('YouTube player API initialized');
      await this.handlePlayerFound(player);
      return;
    }

    // Wait and try again
    await new Promise(resolve => setTimeout(resolve, delay));
    await this.waitForPlayerAPI(player, attempt + 1);
  }

  /**
   * Validate that the player has the expected API methods
   */
  private isValidPlayer(player: YouTubePlayer): boolean {
    const hasRequiredMethods = 
      typeof player.getVideoData === 'function' &&
      typeof player.getCurrentTime === 'function' &&
      typeof player.getDuration === 'function' &&
      typeof player.getPlayerState === 'function';

    if (!hasRequiredMethods) {
      logger.debug('Player validation failed, missing required methods:', {
        hasGetVideoData: typeof player.getVideoData === 'function',
        hasGetCurrentTime: typeof player.getCurrentTime === 'function',
        hasGetDuration: typeof player.getDuration === 'function',
        hasGetPlayerState: typeof player.getPlayerState === 'function'
      });

      logger.debug('Property types for player:', {
        getVideoData: typeof player.getVideoData,
        getCurrentTime: typeof player.getCurrentTime,
        getDuration: typeof player.getDuration,
        getPlayerState: typeof player.getPlayerState
      });
    }

    return hasRequiredMethods;
  }

  /**
   * Handle when a valid player is found
   */
  private async handlePlayerFound(player: YouTubePlayer): Promise<void> {
    if (this.player === player) {
      logger.debug('Player already initialized, skipping');
      return;
    }

    logger.info('Initializing player...');
    this.player = player;
    this.events.onPlayerFound?.(player);

    // Ensure we have a valid tab ID
    if (this.tabId === -1) {
      logger.debug('Getting tab ID...');
      await this.initializeTabId();
    }

    // Initialize event monitor
    logger.debug('Initializing event monitor...');
    this.eventMonitor = new VideoEventMonitor(player, this.tabId);
    this.eventMonitor.start();

    try {
      // Initialize UI controls
      logger.debug('Initializing UI controls...');
      this.controls = await VideoControls.getInstance(this.tabId);
      await this.controls.initialize(player);
      logger.info('UI controls initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize UI controls:', error);
    }

    // Start metadata monitoring
    logger.debug('Starting metadata monitoring...');
    this.startMetadataCheck();

    // Notify background script
    const videoData = player.getVideoData?.();
    if (videoData) {
      logger.debug('Sending video detected message...');
      chrome.runtime.sendMessage({
        type: BackgroundMessageType.VIDEO_DETECTED,
        tabId: this.tabId,
        videoId: videoData.video_id,
        url: window.location.href,
        title: videoData.title
      });
    }

    logger.info('Player initialization complete');
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