import { logger, LogLevel } from './logger';
import { isYouTubeVideoPage, waitForPageLoad } from './utils';
import { VideoDetector } from './video/detector';

// Configure logger to show debug messages
logger.configure({
  enabled: true,
  minLevel: LogLevel.DEBUG,
  prefix: '[Video Bookmarks]'
});

class VideoBookmarkContentScript {
  private static instance: VideoBookmarkContentScript;
  private videoDetector: VideoDetector | null = null;

  private constructor() {}

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

      logger.info('Detected YouTube video page');

      // Initialize video detector
      await this.initializeVideoDetector();

      // Setup URL change detection for SPAs
      this.setupUrlChangeDetection();

      logger.info('Content script initialized successfully');      
    } catch (error) {
      logger.error('Failed to initialize content script:', error);
    }
  }

  /**
   * Initialize video detector
   */
  private async initializeVideoDetector(): Promise<void> {
    try {
      this.videoDetector = await VideoDetector.getInstance();
      await this.videoDetector.initialize();
    } catch (error) {
      logger.error('Failed to initialize video detector:', error);
      this.videoDetector = null;
    }
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
      logger.info('URL changed to new video page');

      // Reset video detector on URL change
      if (this.videoDetector) {
        this.videoDetector.destroy();
      }
      this.initializeVideoDetector();
    } else {
      logger.debug('URL changed to non-video page');
      if (this.videoDetector) {
        this.videoDetector.destroy();
        this.videoDetector = null;
      }
    }
  }
}

// Initialize content script
const contentScript = VideoBookmarkContentScript.getInstance();
contentScript.initialize().catch((error) => {
  logger.error('Failed to initialize content script:', error);
});
