import { logger } from '../logger';
import { VideoControls } from '../ui/controls';
import { isPlayerReady } from './playerProxy';

/**
 * Class responsible for detecting YouTube video pages and initializing controls
 */
export class VideoDetector {
  private static instance: VideoDetector | null = null;
  private observer: MutationObserver | null = null;
  private controls: VideoControls | null = null;
  private tabId: number = -1;
  private isInitialized: boolean = false;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static async getInstance(): Promise<VideoDetector> {
    if (!VideoDetector.instance) {
      VideoDetector.instance = new VideoDetector();
    }
    return VideoDetector.instance;
  }

  /**
   * Initialize the tab ID
   */
  private async initializeTabId(): Promise<void> {
    try {
      logger.debug('Initializing tab ID');
      const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_ID' });
      
      if (!response || typeof response.tabId !== 'number') {
        throw new Error('Invalid response format for GET_TAB_ID');
      }

      this.tabId = response.tabId;
      
      if (this.tabId === -1) {
        logger.warn('Using fallback tab ID of -1');
      } else {
        logger.debug('Tab ID initialized:', this.tabId);
      }
    } catch (error) {
      logger.error('Failed to initialize tab ID:', error);
      this.tabId = -1;
      throw error;
    }
  }

  /**
   * Initialize the detector
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.initializeTabId();
      await this.startObserving();
      this.isInitialized = true;
      logger.debug('Video detector initialized');
    } catch (error) {
      logger.error('Failed to initialize video detector:', error);
      this.destroy();
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopObserving();
    if (this.controls) {
      this.controls.destroy();
      this.controls = null;
    }
    this.isInitialized = false;
    logger.debug('Video detector destroyed');
  }

  /**
   * Start observing DOM changes to detect the player
   */
  private async startObserving(): Promise<void> {
    logger.debug('Starting player detection');

    // Initial check
    await this.checkForPlayer();

    // Setup observer for dynamic changes
    this.observer = new MutationObserver(async () => {
      await this.checkForPlayer();
    });

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
   * Check for player presence and initialize controls if found
   */
  private async checkForPlayer(): Promise<void> {
    try {
      // Only proceed if we have a valid tab ID
      if (this.tabId === -1) {
        logger.warn('Cannot check for player: invalid tab ID');
        return;
      }

      // Check if player is ready
      const ready = await isPlayerReady(this.tabId);
      if (!ready) {
        return;
      }

      // Initialize controls if not already done
      if (!this.controls) {
        logger.debug('Player found, initializing controls');
        this.controls = await VideoControls.getInstance(this.tabId);
        await this.controls.initialize();
        
        // Stop observing once controls are initialized
        this.stopObserving();
      }
    } catch (error) {
      logger.error('Error checking for player:', error);
    }
  }
} 