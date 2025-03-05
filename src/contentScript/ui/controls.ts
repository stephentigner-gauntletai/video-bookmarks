import { logger } from '../logger';
import { BackgroundMessageType } from '../../background/types';
import { GetVideoStateResponse } from '../../background/types';
import { YouTubePlayer } from '../video/types';
import { getVideoData, getCurrentTime, getPlayerState, isPlayerReady } from '../video/playerProxy';
import { VideoMetadata, PlayerState } from '../video/types';

/**
 * Configuration for UI controls
 */
interface ControlsConfig {
  updateInterval: number;  // How often to update timestamp display (ms)
  containerClass: string;  // Class name for the controls container
  activeClass: string;    // Class name for active state
  savingClass: string;    // Class name for saving state
  errorClass: string;     // Class name for error state
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ControlsConfig = {
  updateInterval: 1000,
  containerClass: 'vb-controls',
  activeClass: 'vb-active',
  savingClass: 'vb-saving',
  errorClass: 'vb-error'
};

/**
 * Class responsible for managing UI controls
 */
export class VideoControls {
  private static instance: VideoControls;
  private config: ControlsConfig;
  private container: HTMLElement | null = null;
  private button: HTMLElement | null = null;
  private timestampDisplay: HTMLElement | null = null;
  private updateInterval: number | null = null;
  private player: YouTubePlayer | null = null;
  private tabId: number;
  private videoId: string | null = null;
  private isActive: boolean = false;
  private isSaving: boolean = false;

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
        chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
          resolve(response?.tabId ?? -1);
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

      logger.info('UI controls initialization complete');
    } catch (error) {
      logger.error('Failed to initialize UI controls:', error);
      // Clean up any partial initialization
      this.destroy();
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopTimestampUpdates();
    this.container?.remove();
    this.container = null;
    this.button = null;
    this.timestampDisplay = null;
    this.player = null;
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
    this.button = document.createElement('button');
    this.button.className = 'ytp-button';
    this.button.style.cssText = `
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
    this.button.innerHTML = `
      <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>
      </svg>
    `;
    this.button.addEventListener('click', this.handleButtonClick.bind(this));

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
    this.container.appendChild(this.button);
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
      this.setSaving(true);

      // Toggle bookmark state
      if (this.isActive) {
        await this.deactivateBookmark();
      } else {
        await this.activateBookmark();
      }

      this.setSaving(false);
    } catch (error) {
      logger.error('Failed to handle bookmark click', error);
      this.setError(true);
      setTimeout(() => this.setError(false), 2000);
      this.setSaving(false);
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
      title: videoData.title
    });

    this.setActive(true);
  }

  /**
   * Deactivate bookmark tracking
   */
  private async deactivateBookmark(): Promise<void> {
    if (!this.videoId) return;

    // Send video closed message
    chrome.runtime.sendMessage({
      type: BackgroundMessageType.VIDEO_CLOSED,
      tabId: this.tabId,
      videoId: this.videoId
    });

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
    if (this.button) {
      this.button.title = active ? 'Stop tracking' : 'Start tracking';
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