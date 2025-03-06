import { logger } from '../logger';
import { debounce } from '../utils';
import { PlayerState } from './types';
import { BackgroundMessageType } from '../../background/types';
import { getCurrentTime, getPlayerState, getVideoData } from './playerProxy';
import { showError, showSuccess, showWarning } from '../ui/notifications';

/**
 * Configuration for video event monitoring
 */
interface EventMonitorConfig {
  updateInterval: number;  // How often to check for updates (ms)
  debounceTime: number;   // How long to wait before sending updates (ms)
  minTimeDelta: number;   // Minimum time change to trigger update (seconds)
  initialLastTimestamp?: number;  // Initial value for lastTimestamp
  initialMaxTimestamp?: number;   // Initial value for maxTimestamp
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
  private config: EventMonitorConfig;
  private updateInterval: number | null = null;
  private lastTimestamp: number = 0;
  private maxTimestamp: number = 0;
  private tabId: number;
  private lastState: PlayerState = PlayerState.UNSTARTED;
  private lastUpdateTime: number = 0;
  private lastErrorTime: number = 0;
  private readonly ERROR_NOTIFICATION_COOLDOWN = 5000; // 5 seconds between error notifications

  constructor(tabId: number, config: Partial<EventMonitorConfig> = {}) {
    this.tabId = tabId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize timestamps if provided
    if (this.config.initialLastTimestamp !== undefined) {
      this.lastTimestamp = this.config.initialLastTimestamp;
    }
    if (this.config.initialMaxTimestamp !== undefined) {
      this.maxTimestamp = this.config.initialMaxTimestamp;
    }
  }

  /**
   * Start monitoring video events
   */
  public start(): void {
    logger.debug('Starting video event monitoring');
    showSuccess('Video tracking started');
    this.startTimeTracking();
  }

  /**
   * Stop monitoring video events
   */
  public stop(): void {
    logger.debug('Stopping video event monitoring');
    showWarning('Video tracking stopped');
    this.clearTimeTracking();
  }

  /**
   * Start tracking video time
   */
  private startTimeTracking(): void {
    this.clearTimeTracking();

    // Create debounced update functions
    const debouncedTimeUpdate = debounce(this.handleTimeUpdate.bind(this), this.config.debounceTime);
    const debouncedStateChange = debounce(this.handleStateChange.bind(this), this.config.debounceTime);

    this.updateInterval = window.setInterval(async () => {
      try {
        // Check current time
        const currentTime = await getCurrentTime(this.tabId);
        if (Math.abs(currentTime - this.lastTimestamp) >= this.config.minTimeDelta) {
          debouncedTimeUpdate(currentTime);
        }

        // Check player state
        const currentState = await getPlayerState(this.tabId);
        if (currentState !== this.lastState) {
          this.lastState = currentState;
          debouncedStateChange(currentState);
        }
      } catch (error) {
        const now = Date.now();
        if (now - this.lastErrorTime >= this.ERROR_NOTIFICATION_COOLDOWN) {
          showError('Failed to update video position', () => this.startTimeTracking());
          this.lastErrorTime = now;
        }
        logger.error('Error during time tracking:', error);
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
  private async handleTimeUpdate(currentTime: number): Promise<void> {
    try {
      // Get video data for the update
      const videoData = await getVideoData(this.tabId);
      if (!videoData) {
        showError('Failed to get video data for timestamp update');
        return;
      }

      // Update timestamps
      this.lastTimestamp = currentTime;
      if (currentTime > this.maxTimestamp) {
        this.maxTimestamp = currentTime;
      }

      // Record update time
      this.lastUpdateTime = Date.now();

      // Send updates to background script
      this.sendTimestampUpdate(videoData.id, currentTime, false);  // Current position
      if (currentTime >= this.maxTimestamp) {
        this.sendTimestampUpdate(videoData.id, this.maxTimestamp, true);  // Max position
      }
    } catch (error) {
      const now = Date.now();
      if (now - this.lastErrorTime >= this.ERROR_NOTIFICATION_COOLDOWN) {
        showError('Failed to update timestamp', () => this.handleTimeUpdate(currentTime));
        this.lastErrorTime = now;
      }
      logger.error('Error handling time update:', error);
    }
  }

  /**
   * Handle player state changes
   */
  private async handleStateChange(state: PlayerState): Promise<void> {
    logger.debug('Player state changed', { state: PlayerState[state] });

    try {
      const videoData = await getVideoData(this.tabId);
      if (!videoData) {
        showError('Failed to get video data for state change');
        return;
      }

      switch (state) {
        case PlayerState.ENDED:
          // Video ended, update max timestamp to duration
          this.maxTimestamp = videoData.duration;
          this.sendTimestampUpdate(videoData.id, videoData.duration, true);
          showSuccess('Video completed');
          break;

        case PlayerState.PAUSED:
          // Video paused, update timestamps immediately
          const currentTime = await getCurrentTime(this.tabId);
          await this.handleTimeUpdate(currentTime);
          break;
      }
    } catch (error) {
      const now = Date.now();
      if (now - this.lastErrorTime >= this.ERROR_NOTIFICATION_COOLDOWN) {
        showError('Failed to handle player state change', () => this.handleStateChange(state));
        this.lastErrorTime = now;
      }
      logger.error('Error handling state change:', error);
    }
  }

  /**
   * Send timestamp update to background script
   */
  private sendTimestampUpdate(videoId: string, timestamp: number, isMaxTimestamp: boolean): void {
    chrome.runtime.sendMessage({
      type: BackgroundMessageType.UPDATE_TIMESTAMP,
      tabId: this.tabId,
      videoId,
      timestamp,
      isMaxTimestamp
    });
  }
} 