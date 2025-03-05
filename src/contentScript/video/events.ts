import { logger } from '../logger';
import { debounce } from '../utils';
import { YouTubePlayer, PlayerState } from './types';
import { BackgroundMessageType } from '../../background/types';

/**
 * Configuration for video event monitoring
 */
interface EventMonitorConfig {
  updateInterval: number;  // How often to check for updates (ms)
  debounceTime: number;   // How long to wait before sending updates (ms)
  minTimeDelta: number;   // Minimum time change to trigger update (seconds)
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: EventMonitorConfig = {
  updateInterval: 1000,   // Check every second
  debounceTime: 500,     // Wait 500ms before sending updates
  minTimeDelta: 1        // Minimum 1 second change
};

/**
 * Class responsible for monitoring video events and tracking timestamps
 */
export class VideoEventMonitor {
  private player: YouTubePlayer;
  private config: EventMonitorConfig;
  private updateInterval: number | null = null;
  private lastTimestamp: number = 0;
  private maxTimestamp: number = 0;
  private tabId: number;

  constructor(player: YouTubePlayer, tabId: number, config: Partial<EventMonitorConfig> = {}) {
    this.player = player;
    this.tabId = tabId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring video events
   */
  public start(): void {
    logger.debug('Starting video event monitoring');
    this.setupEventListeners();
    this.startTimeTracking();
  }

  /**
   * Stop monitoring video events
   */
  public stop(): void {
    logger.debug('Stopping video event monitoring');
    this.clearTimeTracking();
  }

  /**
   * Setup event listeners for the video player
   */
  private setupEventListeners(): void {
    // Create debounced update functions
    const debouncedTimeUpdate = debounce(this.handleTimeUpdate.bind(this), this.config.debounceTime);
    const debouncedStateChange = debounce(this.handleStateChange.bind(this), this.config.debounceTime);

    // Monitor state changes through the proxy
    const originalGetPlayerState = this.player.getPlayerState?.bind(this.player);
    if (originalGetPlayerState) {
      let lastState = originalGetPlayerState();
      this.player.getPlayerState = () => {
        const currentState = originalGetPlayerState();
        if (currentState !== lastState) {
          lastState = currentState;
          debouncedStateChange(currentState);
        }
        return currentState;
      };
    }

    // Monitor time updates through the proxy
    const originalGetCurrentTime = this.player.getCurrentTime?.bind(this.player);
    if (originalGetCurrentTime) {
      let lastTime = originalGetCurrentTime();
      this.player.getCurrentTime = () => {
        const currentTime = originalGetCurrentTime();
        if (Math.abs(currentTime - lastTime) >= this.config.minTimeDelta) {
          lastTime = currentTime;
          debouncedTimeUpdate(currentTime);
        }
        return currentTime;
      };
    }

    // Start periodic time checks
    this.startTimeTracking();
  }

  /**
   * Start tracking video time
   */
  private startTimeTracking(): void {
    this.clearTimeTracking();

    this.updateInterval = window.setInterval(() => {
      const currentTime = this.player.getCurrentTime?.() || 0;
      if (Math.abs(currentTime - this.lastTimestamp) >= this.config.minTimeDelta) {
        this.handleTimeUpdate(currentTime);
      }
    }, this.config.updateInterval) as unknown as number;
  }

  /**
   * Clear time tracking interval
   */
  private clearTimeTracking(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Handle video time updates
   */
  private handleTimeUpdate(currentTime: number): void {
    // Update timestamps
    this.lastTimestamp = currentTime;
    this.maxTimestamp = Math.max(this.maxTimestamp, currentTime);

    // Send updates to background script
    this.sendTimestampUpdate(currentTime, false);  // Current position
    this.sendTimestampUpdate(this.maxTimestamp, true);  // Max position
  }

  /**
   * Handle player state changes
   */
  private handleStateChange(state: PlayerState): void {
    logger.debug('Player state changed', { state: PlayerState[state] });

    switch (state) {
      case PlayerState.ENDED:
        // Video ended, update max timestamp
        const duration = this.player.getDuration?.() || 0;
        this.maxTimestamp = duration;
        this.sendTimestampUpdate(duration, true);
        break;

      case PlayerState.PAUSED:
        // Video paused, update timestamps immediately
        const currentTime = this.player.getCurrentTime?.() || 0;
        this.handleTimeUpdate(currentTime);
        break;
    }
  }

  /**
   * Send timestamp update to background script
   */
  private sendTimestampUpdate(timestamp: number, isMaxTimestamp: boolean): void {
    chrome.runtime.sendMessage({
      type: BackgroundMessageType.UPDATE_TIMESTAMP,
      tabId: this.tabId,
      videoId: this.player.getVideoData?.()?.video_id,
      timestamp,
      isMaxTimestamp
    });
  }
} 