import { logger } from '../logger';
import { VideoControls } from '../ui/controls';
import { isPlayerReady } from './playerProxy';
import { storageManager } from '../../storage';
import { isSupportedSite } from '../utils';

/**
 * Class responsible for detecting YouTube video pages and initializing controls
 */
export class VideoDetector {
  private static instance: VideoDetector | null = null;
  private observer: MutationObserver | null = null;
  private controls: VideoControls | null = null;
  private tabId: number = -1;
  private isInitialized: boolean = false;
  private autoTrackEnabled: boolean = false;
  private messageListeners: ((message: any, sender: any) => void)[] = [];

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
   * Initialize auto-track settings
   */
  private async initializeAutoTrack(): Promise<void> {
    try {
      logger.debug('Loading auto-track settings');
      const settings = await storageManager.getAutoTrackSettings();
      this.autoTrackEnabled = settings.enabled;
      logger.debug('Auto-track settings loaded:', settings);
    } catch (error) {
      logger.error('Failed to load auto-track settings:', error);
      this.autoTrackEnabled = false;
    }
  }

  /**
   * Add a message listener that we can clean up later
   */
  private addMessageListener(handler: (message: any, sender: any) => void): void {
    this.messageListeners.push(handler);
    chrome.runtime.onMessage.addListener(handler);
  }

  /**
   * Remove all message listeners
   */
  private removeMessageListeners(): void {
    this.messageListeners.forEach(listener => {
      chrome.runtime.onMessage.removeListener(listener);
    });
    this.messageListeners = [];
  }

  /**
   * Initialize the detector
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.initializeTabId();
      await this.initializeAutoTrack();
      await this.startObserving();
      this.isInitialized = true;
      logger.debug('Video detector initialized');

      // Listen for auto-track setting changes
      this.addMessageListener((message) => {
        if (message.type === 'AUTO_TRACK_CHANGED') {
          logger.debug('Auto-track setting changed:', message.enabled);
          this.autoTrackEnabled = message.enabled;
          // Reinitialize controls if needed
          if (this.controls) {
            this.controls.destroy();
            this.controls = null;
            this.checkForPlayer();
          }
        }
      });

      // Listen for navigation events
      this.addMessageListener((message) => {
        if (message.type === 'TAB_UPDATED' && message.tabId === this.tabId) {
          logger.debug('Tab updated, cleaning up detector');
          // Clean up everything
          this.destroy();
          // Reinitialize after a short delay
          setTimeout(() => this.initialize(), 100);
        }
      });

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
    logger.debug('Destroying video detector');
    this.stopObserving();
    if (this.controls) {
      this.controls.destroy();
      this.controls = null;
    }
    this.removeMessageListeners();
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

      // Check if URL is from a supported site
      const url = window.location.href;
      if (!isSupportedSite(url)) {
        logger.debug('URL is not from a supported site:', url);
        return;
      }

      // Initialize controls if not already done
      if (!this.controls) {
        logger.debug('Player found, initializing controls');
        this.controls = await VideoControls.getInstance(this.tabId);
        await this.controls.initialize(this.autoTrackEnabled);
        
        // Stop observing once controls are initialized
        this.stopObserving();
      }
    } catch (error) {
      logger.error('Error checking for player:', error);
    }
  }
} 