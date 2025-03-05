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
  private static instance: VideoDetector | null = null;
  private observer: MutationObserver | null = null;
  private player: YouTubePlayer | null = null;
  private events: Partial<VideoEvents> = {};
  private metadataCheckInterval: number | null = null;
  private eventMonitor: VideoEventMonitor | null = null;
  private controls: VideoControls | null = null;
  private tabId: number = -1;
  private bridgeInitialized: boolean = false;
  private isInitialized: boolean = false;

  private constructor() {
    // Setup message listener for bridge
    this.setupBridgeListener();
  }

  /**
   * Get the singleton instance
   */
  public static async getInstance(): Promise<VideoDetector> {
    if (!VideoDetector.instance) {
      VideoDetector.instance = new VideoDetector();
      // Initialize tab ID before returning instance
      await VideoDetector.instance.initializeTabId();
    }
    return VideoDetector.instance;
  }

  /**
   * Initialize tab ID by sending a message to the background script
   */
  private async initializeTabId(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.debug('Sending GET_TAB_ID message to background script');
      const response = await chrome.runtime.sendMessage({
        type: BackgroundMessageType.GET_TAB_ID
      });
      
      logger.debug('Received GET_TAB_ID response:', response);
      
      if (!response || typeof response.tabId !== 'number') {
        throw new Error(`Invalid response format: ${JSON.stringify(response)}`);
      }

      this.tabId = response.tabId;
      logger.debug('Tab ID initialized:', this.tabId);
      
      if (this.tabId === -1) {
        throw new Error('Received invalid tab ID (-1)');
      }

      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to get tab ID:', error);
      this.tabId = -1;
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Initialize the detector
   */
  public async initialize(events: Partial<VideoEvents>): Promise<void> {
    this.events = events;
    await this.startObserving();
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
  private async startObserving(): Promise<void> {
    logger.debug('Starting player detection');

    // Initialize bridge first
    await this.initializeBridge();

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
   * Initialize the bridge script for communicating with the YouTube player
   */
  private async initializeBridge(): Promise<void> {
    if (this.bridgeInitialized) return;

    // Ensure we have a valid tab ID before proceeding
    if (this.tabId === -1) {
      logger.debug('No valid tab ID, attempting to initialize...');
      await this.initializeTabId();
    }

    if (this.tabId === -1) {
      throw new Error('Cannot initialize bridge without a valid tab ID');
    }

    logger.debug('Initializing bridge script');

    try {
      // Send message to background script to inject the bridge
      await chrome.runtime.sendMessage({
        type: BackgroundMessageType.INJECT_BRIDGE,
        tabId: this.tabId
      });

      this.bridgeInitialized = true;
      logger.debug('Bridge script injected successfully');
    } catch (error) {
      logger.error('Failed to inject bridge script:', error);
      throw error;
    }
  }

  /**
   * Setup listener for bridge script messages
   */
  private setupBridgeListener(): void {
    window.addEventListener('message', (event) => {
      if (event.data.type !== 'PLAYER_STATUS') return;

      logger.debug('Received bridge response:', event.data);

      switch (event.data.status) {
        case 'ready':
          const player = document.querySelector('#movie_player') as YouTubePlayer;
          if (player && !this.player) {
            this.handlePlayerFound(player);
          }
          break;

        case 'not_found':
          logger.debug('Player element not found');
          break;

        case 'api_not_ready':
          logger.debug('Player API not ready:', event.data.methods);
          break;

        case 'error':
          logger.warn('Error in bridge script:', event.data.error);
          break;
      }
    });
  }

  /**
   * Find the YouTube player element
   */
  private findPlayer(): void {
    if (this.player) return;

    window.postMessage({ type: 'QUERY_PLAYER' }, '*');
    logger.debug('Sent player query through bridge');
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
} 