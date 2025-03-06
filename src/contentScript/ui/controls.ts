import { logger } from '../logger';
import { BackgroundMessageType } from '../../background/types';
import { GetVideoStateResponse } from '../../background/types';
import { getVideoData, getCurrentTime, getPlayerState, isPlayerReady } from '../video/playerProxy';
import { PlayerState } from '../video/types';
import { VideoEventMonitor } from '../video/events';

/**
 * Configuration for UI controls
 */
interface ControlsConfig {
  updateInterval: number;  // How often to update timestamp display (ms)
  containerClass: string;  // Class name for the controls container
  activeClass: string;    // Class name for active state
  savingClass: string;    // Class name for saving state
  errorClass: string;     // Class name for error state
  deletingClass: string;  // Class name for deleting state
  undoTimeout: number;    // Time in ms before deletion is confirmed
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ControlsConfig = {
  updateInterval: 1000,
  containerClass: 'vb-controls',
  activeClass: 'vb-active',
  savingClass: 'vb-saving',
  errorClass: 'vb-error',
  deletingClass: 'vb-deleting',
  undoTimeout: 5000  // 5 seconds for undo
};

/**
 * Class responsible for managing UI controls
 */
export class VideoControls {
  private static instance: VideoControls;
  private config: ControlsConfig;
  private container: HTMLElement | null = null;
  private bookmarkButton: HTMLElement | null = null;
  private undoButton: HTMLElement | null = null;
  private timestampDisplay: HTMLElement | null = null;
  private updateInterval: number | null = null;
  private tabId: number;
  private videoId: string | null = null;
  private isActive: boolean = false;
  private isSaving: boolean = false;
  private eventMonitor: VideoEventMonitor | null = null;
  private undoTimer: number | null = null;
  private countdownInterval: number | null = null;  // Add tracking for countdown interval

  private constructor(tabId: number, config: Partial<ControlsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tabId = tabId;
  }

  /**
   * Get the singleton instance
   */
  public static async getInstance(tabId?: number): Promise<VideoControls> {
    if (!VideoControls.instance) {
      // If tabId is not provided, get it from chrome.tabs API
      const finalTabId = tabId ?? await new Promise<number>((resolve) => {
        chrome.runtime.sendMessage({ 
          type: BackgroundMessageType.GET_TAB_ID 
        }, (response) => {
          if (!response || typeof response.tabId !== 'number') {
            logger.error('Invalid response format for GET_TAB_ID');
            resolve(-1);
            return;
          }
          resolve(response.tabId);
        });
      });

      if (finalTabId === -1) {
        logger.error('Failed to get tab ID');
      }

      VideoControls.instance = new VideoControls(finalTabId);
    }
    return VideoControls.instance;
  }

  /**
   * Initialize the controls
   */
  public async initialize(): Promise<void> {
    try {
      logger.debug('Starting UI controls initialization');
      
      // Check if player is ready
      const ready = await isPlayerReady(this.tabId);
      if (!ready) {
        throw new Error('YouTube player not ready');
      }

      // Get video data
      const videoData = await getVideoData(this.tabId);
      logger.debug('Retrieved video data:', videoData);
      
      if (!videoData?.id) {
        throw new Error('Failed to get video ID from player');
      }

      this.videoId = videoData.id;

      // Create and inject controls
      logger.debug('Creating UI controls');
      this.createControls();

      // Check initial state
      logger.debug('Checking video state');
      await this.checkVideoState();

      // Start timestamp updates
      logger.debug('Starting timestamp updates');
      this.startTimestampUpdates();

      // Setup message listener for deletion events
      this.setupMessageListener();

      logger.info('UI controls initialization complete');
    } catch (error) {
      logger.error('Failed to initialize UI controls:', error);
      // Clean up any partial initialization
      this.destroy();
      throw error;
    }
  }

  /**
   * Setup message listener for deletion events
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (!this.videoId) {
        logger.debug('Ignoring message - no videoId:', message);
        return;
      }

      logger.debug('Controls received message:', { message, videoId: this.videoId, tabId: this.tabId });

      switch (message.type) {
        case BackgroundMessageType.INITIATE_DELETE:
          if (message.videoId === this.videoId) {
            logger.debug('Processing initiate delete', { message, videoId: this.videoId });
            // Bookmark is being deleted from another source (e.g. popup)
            if (this.eventMonitor) {
              this.eventMonitor.stop();
            }
            this.showUndoUI();
          }
          break;

        case BackgroundMessageType.UNDO_DELETE:
          if (message.videoId === this.videoId) {
            logger.debug('Processing undo delete', { message, videoId: this.videoId });
            // Deletion was undone from another source
            this.clearTimers();
            this.hideUndoUI();
            if (this.eventMonitor) {
              this.eventMonitor.start();
            }
            this.setActive(true);
          }
          break;

        case BackgroundMessageType.CONFIRM_DELETE:
          if (message.videoId === this.videoId) {
            logger.debug('Processing confirm delete', { message, videoId: this.videoId });
            // Deletion was confirmed from another source
            this.clearTimers();
            this.hideUndoUI();
            this.eventMonitor = null;
            this.setActive(false);
          }
          break;

        default:
          logger.debug('Ignoring unhandled message type:', message.type);
      }
    });
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopTimestampUpdates();
    if (this.eventMonitor) {
      this.eventMonitor.stop();
      this.eventMonitor = null;
    }
    this.clearTimers();
    this.container?.remove();
    this.container = null;
    this.bookmarkButton = null;
    this.undoButton = null;
    this.timestampDisplay = null;
    this.videoId = null;
    this.isActive = false;
    this.isSaving = false;
  }

  /**
   * Create UI controls
   */
  private createControls(): void {
    // Create container that matches YouTube's control layout
    this.container = document.createElement('div');
    this.container.className = `${this.config.containerClass} ytp-button`;

    // Create bookmark button that matches YouTube's button style
    this.bookmarkButton = document.createElement('button');
    this.bookmarkButton.className = 'ytp-button';
    this.bookmarkButton.style.cssText = `
      border: none;
      background: none;
      padding: 0;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    `;
    this.bookmarkButton.innerHTML = `
      <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>
      </svg>
    `;
    this.bookmarkButton.addEventListener('click', this.handleButtonClick.bind(this));

    // Create undo button with same styling
    this.undoButton = document.createElement('button');
    this.undoButton.className = 'ytp-button';
    this.undoButton.style.cssText = `
      border: none;
      background: none;
      padding: 0;
      width: 48px;
      height: 48px;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #f28b82;
    `;
    this.undoButton.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; font-family: Roboto, Arial, sans-serif;">
        <span style="font-size: 10px; font-weight: 500;">UNDO (5)</span>
      </div>
    `;
    this.undoButton.title = 'Click to undo deletion';
    this.undoButton.addEventListener('click', this.handleUndo.bind(this));

    // Create timestamp display that matches YouTube's style
    this.timestampDisplay = document.createElement('div');
    this.timestampDisplay.className = 'ytp-time-display';
    this.timestampDisplay.style.cssText = `
      color: #fff;
      font-size: 12px;
      margin-left: 8px;
      display: none;
    `;

    // Add elements to container
    this.container.appendChild(this.bookmarkButton);
    this.container.appendChild(this.undoButton);
    this.container.appendChild(this.timestampDisplay);

    // Try to inject the controls into the YouTube player
    this.injectControls();
  }

  /**
   * Inject controls into the YouTube player
   */
  private injectControls(): void {
    const tryInjectControls = () => {
      // Find the right-side controls container
      const rightControls = document.querySelector('.ytp-right-controls');
      if (!rightControls || !this.container) return false;

      // Insert our controls before the settings button
      rightControls.insertBefore(this.container, rightControls.firstChild);
      return true;
    };

    // Try to inject immediately
    if (!tryInjectControls()) {
      // If failed, set up an observer to wait for the controls to be ready
      const observer = new MutationObserver((mutations, obs) => {
        if (tryInjectControls()) {
          obs.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    // Request CSS injection from background script
    chrome.runtime.sendMessage({
      type: BackgroundMessageType.INJECT_STYLES,
      tabId: this.tabId
    });
  }

  /**
   * Handle bookmark button click
   */
  private async handleButtonClick(): Promise<void> {
    if (!this.videoId) return;

    try {
      if (this.isActive) {
        // Instead of immediate deactivation, initiate deletion
        await this.initiateDelete();
      } else {
        await this.activateBookmark();
      }
    } catch (error) {
      logger.error('Failed to handle bookmark click', error);
      this.setError(true);
      setTimeout(() => this.setError(false), 2000);
    }
  }

  /**
   * Activate bookmark tracking
   */
  private async activateBookmark(): Promise<void> {
    if (!this.videoId) return;

    // Get video data through proxy
    const videoData = await getVideoData(this.tabId);
    if (!videoData) {
      throw new Error('Failed to get video data');
    }

    // Send video detected message
    chrome.runtime.sendMessage({
      type: BackgroundMessageType.VIDEO_DETECTED,
      tabId: this.tabId,
      videoId: this.videoId,
      url: window.location.href,
      title: videoData.title,
      author: videoData.author
    });

    // Start event monitoring
    this.eventMonitor = new VideoEventMonitor(this.tabId);
    this.eventMonitor.start();

    this.setActive(true);
  }

  /**
   * Initiate bookmark deletion
   */
  private async initiateDelete(): Promise<void> {
    if (!this.videoId) return;

    // Stop event monitoring but keep the state
    if (this.eventMonitor) {
      this.eventMonitor.stop();
    }

    // Send initiate delete message
    chrome.runtime.sendMessage({
      type: BackgroundMessageType.INITIATE_DELETE,
      tabId: this.tabId,
      videoId: this.videoId
    });

    // Show undo UI
    this.showUndoUI();
  }

  /**
   * Handle undo action
   */
  private handleUndo(): void {
    if (!this.videoId) return;

    // Clear both timers
    this.clearTimers();

    // Hide undo UI
    this.hideUndoUI();

    // Send undo message
    chrome.runtime.sendMessage({
      type: BackgroundMessageType.UNDO_DELETE,
      tabId: this.tabId,
      videoId: this.videoId
    });

    // Restart event monitoring
    if (this.eventMonitor) {
      this.eventMonitor.start();
    }

    // Keep active state
    this.setActive(true);
  }

  /**
   * Show undo UI with countdown
   */
  private showUndoUI(): void {
    if (!this.bookmarkButton || !this.undoButton) return;

    // Clear any existing timers
    this.clearTimers();

    // Hide bookmark button, show undo button
    this.bookmarkButton.style.display = 'none';
    this.undoButton.style.display = 'flex';

    // Start countdown
    let timeLeft = Math.floor(this.config.undoTimeout / 1000);
    const countdownSpan = this.undoButton.querySelector('span');
    if (countdownSpan) {
      countdownSpan.textContent = `UNDO (${timeLeft})`;
    }
    
    // Update countdown every second
    this.countdownInterval = window.setInterval(() => {
      timeLeft--;
      if (countdownSpan) {
        countdownSpan.textContent = `UNDO (${timeLeft})`;
      }
    }, 1000) as unknown as number;

    // Set timer for final deletion
    this.undoTimer = window.setTimeout(() => {
      this.clearTimers();
      this.confirmDelete();
    }, this.config.undoTimeout) as unknown as number;
  }

  /**
   * Hide undo UI
   */
  private hideUndoUI(): void {
    if (!this.bookmarkButton || !this.undoButton) return;

    // Show bookmark button, hide undo button
    this.bookmarkButton.style.display = 'flex';
    this.undoButton.style.display = 'none';
  }

  /**
   * Clear timers
   */
  private clearTimers(): void {
    if (this.undoTimer !== null) {
      clearTimeout(this.undoTimer);
      this.undoTimer = null;
    }
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /**
   * Confirm deletion after undo period
   */
  private confirmDelete(): void {
    if (!this.videoId) return;

    // Clear both timers
    this.clearTimers();

    // Hide undo UI
    this.hideUndoUI();

    // Send confirm delete message
    chrome.runtime.sendMessage({
      type: BackgroundMessageType.CONFIRM_DELETE,
      tabId: this.tabId,
      videoId: this.videoId
    });

    // Complete deactivation
    this.eventMonitor = null;
    this.setActive(false);
  }

  /**
   * Check current video state
   */
  private async checkVideoState(): Promise<void> {
    if (!this.videoId) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: BackgroundMessageType.GET_VIDEO_STATE,
        tabId: this.tabId,
        videoId: this.videoId
      }) as GetVideoStateResponse;

      // If we have an existing bookmark or active video, start tracking
      if (response.bookmark || response.activeVideo) {
        // Get the existing timestamps
        const lastTimestamp = response.activeVideo?.lastTimestamp ?? response.bookmark?.lastTimestamp ?? 0;
        const maxTimestamp = response.activeVideo?.maxTimestamp ?? response.bookmark?.maxTimestamp ?? 0;

        // Start event monitoring with existing timestamps
        this.eventMonitor = new VideoEventMonitor(this.tabId, {
          initialLastTimestamp: lastTimestamp,
          initialMaxTimestamp: maxTimestamp
        });
        this.eventMonitor.start();
        
        // Send video detected message to ensure background state is updated
        const videoData = await getVideoData(this.tabId);
        if (videoData) {
          chrome.runtime.sendMessage({
            type: BackgroundMessageType.VIDEO_DETECTED,
            tabId: this.tabId,
            videoId: this.videoId,
            url: window.location.href,
            title: videoData.title,
            author: videoData.author,
            lastTimestamp,  // Include existing timestamps
            maxTimestamp
          });
        }
      }

      this.setActive(!!response.activeVideo || !!response.bookmark);
    } catch (error) {
      logger.error('Failed to check video state', error);
    }
  }

  /**
   * Start timestamp display updates
   */
  private startTimestampUpdates(): void {
    this.stopTimestampUpdates();

    this.updateInterval = window.setInterval(() => {
      this.updateTimestamp();
    }, this.config.updateInterval) as unknown as number;
  }

  /**
   * Stop timestamp display updates
   */
  private stopTimestampUpdates(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Update timestamp display
   */
  private async updateTimestamp(): Promise<void> {
    if (!this.videoId || !this.timestampDisplay) return;

    try {
      const currentTime = await getCurrentTime(this.tabId);
      const playerState = await getPlayerState(this.tabId);

      // Update timestamp display
      this.timestampDisplay.textContent = this.formatTime(currentTime);

      // Send update to background script if video is playing
      if (playerState === PlayerState.PLAYING) {
        chrome.runtime.sendMessage({
          type: BackgroundMessageType.UPDATE_TIMESTAMP,
          tabId: this.tabId,
          videoId: this.videoId,
          timestamp: currentTime,
          isMaxTimestamp: false
        });
      }
    } catch (error) {
      logger.error('Failed to update timestamp:', error);
    }
  }

  /**
   * Format time in seconds to HH:MM:SS or MM:SS
   */
  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Set active state
   */
  private setActive(active: boolean): void {
    this.isActive = active;
    if (this.container) {
      this.container.classList.toggle(this.config.activeClass, active);
    }
    if (this.bookmarkButton) {
      this.bookmarkButton.title = active ? 'Stop tracking' : 'Start tracking';
    }
  }

  /**
   * Set saving state
   */
  private setSaving(saving: boolean): void {
    this.isSaving = saving;
    if (this.container) {
      this.container.classList.toggle(this.config.savingClass, saving);
    }
  }

  /**
   * Set error state
   */
  private setError(error: boolean): void {
    if (this.container) {
      this.container.classList.toggle(this.config.errorClass, error);
    }
  }
}