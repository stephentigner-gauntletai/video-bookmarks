import { logger } from './logger';
import { isYouTubeVideoPage, extractVideoId, waitForPageLoad } from './utils';
import { storageManager } from '../storage';
import { VideoDetector } from './video/detector';
import { VideoMetadata, PlayerState, YouTubePlayer } from './video/types';

class VideoBookmarkContentScript {
  private static instance: VideoBookmarkContentScript;
  private videoDetector: VideoDetector;
  private currentVideoId: string | null = null;

  private constructor() {
    this.videoDetector = VideoDetector.getInstance();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): VideoBookmarkContentScript {
    if (!VideoBookmarkContentScript.instance) {
      VideoBookmarkContentScript.instance = new VideoBookmarkContentScript();
    }
    return VideoBookmarkContentScript.instance;
  }

  /**
   * Initialize the content script
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing Video Bookmarks content script');

      // Wait for the page to load
      await waitForPageLoad();

      // Check if we're on a YouTube video page
      if (!isYouTubeVideoPage()) {
        logger.debug('Not a YouTube video page, skipping initialization');
        return;
      }

      // Extract video ID
      const videoId = extractVideoId();
      if (!videoId) {
        logger.warn('Could not extract video ID from URL');
        return;
      }

      logger.info('Detected YouTube video page', { videoId });

      // Initialize storage
      await storageManager.initialize();

      // Initialize video detector
      this.initializeVideoDetector();

      // Setup URL change detection for SPAs
      this.setupUrlChangeDetection();

      logger.info('Content script initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize content script', error);
    }
  }

  /**
   * Initialize video detector with event handlers
   */
  private initializeVideoDetector(): void {
    this.videoDetector.initialize({
      onPlayerFound: this.handlePlayerFound.bind(this),
      onPlayerLost: this.handlePlayerLost.bind(this),
      onMetadataUpdated: this.handleMetadataUpdated.bind(this),
      onStateChange: this.handlePlayerStateChange.bind(this)
    });
  }

  /**
   * Handle when the video player is found
   */
  private handlePlayerFound(player: YouTubePlayer): void {
    logger.info('YouTube player found and ready');
  }

  /**
   * Handle when the video player is lost/removed
   */
  private handlePlayerLost(): void {
    logger.info('YouTube player removed');
    this.currentVideoId = null;
  }

  /**
   * Handle video metadata updates
   */
  private handleMetadataUpdated(metadata: VideoMetadata): void {
    // Only log when video ID changes
    if (this.currentVideoId !== metadata.id) {
      this.currentVideoId = metadata.id;
      logger.info('Video metadata updated', metadata);
    }
  }

  /**
   * Handle player state changes
   */
  private handlePlayerStateChange(state: PlayerState): void {
    logger.debug('Player state changed', { state: PlayerState[state] });
  }

  /**
   * Setup detection for URL changes (for single-page app navigation)
   */
  private setupUrlChangeDetection(): void {
    logger.debug('Setting up URL change detection');

    // Create a new observer instance
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const currentUrl = window.location.href;
          if (this.lastUrl !== currentUrl) {
            this.handleUrlChange(currentUrl);
          }
        }
      });
    });

    // Start observing the document with the configured parameters
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also handle popstate events for browser back/forward
    window.addEventListener('popstate', () => {
      this.handleUrlChange(window.location.href);
    });

    logger.debug('URL change detection setup complete');
  }

  private lastUrl: string = window.location.href;

  /**
   * Handle URL changes in the SPA
   */
  private handleUrlChange(newUrl: string): void {
    this.lastUrl = newUrl;

    if (isYouTubeVideoPage()) {
      const videoId = extractVideoId(newUrl);
      logger.info('URL changed to new video', { videoId });

      // Reset video detector on URL change
      this.videoDetector.destroy();
      this.initializeVideoDetector();
    }
  }
}

// Initialize content script
const contentScript = VideoBookmarkContentScript.getInstance();
contentScript.initialize().catch((error) => {
  logger.error('Failed to initialize content script', error);
});
