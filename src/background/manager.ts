import { storageManager } from '../storage';
import { VideoBookmark, StorageError } from '../storage/types';
import {
  BackgroundState,
  ActiveVideo,
  BackgroundMessageType,
  BackgroundMessageUnion,
  GetVideoStateResponse,
  VideoDetectedMessage,
  VideoClosedMessage,
  UpdateTimestampMessage,
  GetVideoStateMessage
} from './types';

/**
 * Manager class for background script functionality
 */
export class BackgroundManager {
  private static instance: BackgroundManager;
  private state: BackgroundState = {
    activeVideos: new Map(),
    isInitialized: false
  };

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): BackgroundManager {
    if (!BackgroundManager.instance) {
      BackgroundManager.instance = new BackgroundManager();
    }
    return BackgroundManager.instance;
  }

  /**
   * Initialize the background manager
   */
  public async initialize(): Promise<void> {
    if (this.state.isInitialized) return;

    // Initialize storage
    await storageManager.initialize();

    // Setup message listeners
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

    // Setup tab removal listener
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));

    this.state.isInitialized = true;
    console.log('Background manager initialized');
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(
    message: BackgroundMessageUnion,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    switch (message.type) {
      case BackgroundMessageType.VIDEO_DETECTED:
        this.handleVideoDetected(message);
        break;

      case BackgroundMessageType.VIDEO_CLOSED:
        this.handleVideoClosed(message);
        break;

      case BackgroundMessageType.UPDATE_TIMESTAMP:
        this.handleUpdateTimestamp(message);
        break;

      case BackgroundMessageType.GET_VIDEO_STATE:
        this.handleGetVideoState(message).then(sendResponse);
        return true; // Will respond asynchronously
    }

    return false;
  }

  /**
   * Handle video detected message
   */
  private handleVideoDetected(message: VideoDetectedMessage): void {
    const activeVideo: ActiveVideo = {
      id: message.videoId,
      tabId: message.tabId,
      url: message.url,
      title: message.title,
      lastTimestamp: 0,
      maxTimestamp: 0,
      lastUpdate: Date.now()
    };

    this.state.activeVideos.set(message.tabId, activeVideo);
    console.log('Video detected:', activeVideo);
  }

  /**
   * Handle video closed message
   */
  private handleVideoClosed(message: VideoClosedMessage): void {
    const activeVideo = this.state.activeVideos.get(message.tabId);
    if (activeVideo && activeVideo.id === message.videoId) {
      this.saveVideoState(activeVideo);
      this.state.activeVideos.delete(message.tabId);
      console.log('Video closed:', message.videoId);
    }
  }

  /**
   * Handle update timestamp message
   */
  private handleUpdateTimestamp(message: UpdateTimestampMessage): void {
    const activeVideo = this.state.activeVideos.get(message.tabId);
    if (!activeVideo || activeVideo.id !== message.videoId) return;

    if (message.isMaxTimestamp) {
      activeVideo.maxTimestamp = Math.max(activeVideo.maxTimestamp, message.timestamp);
    } else {
      activeVideo.lastTimestamp = message.timestamp;
    }

    activeVideo.lastUpdate = Date.now();
    this.state.activeVideos.set(message.tabId, activeVideo);

    // Save state periodically (every 5 seconds)
    if (Date.now() - activeVideo.lastUpdate >= 5000) {
      this.saveVideoState(activeVideo);
    }
  }

  /**
   * Handle get video state message
   */
  private async handleGetVideoState(message: GetVideoStateMessage): Promise<GetVideoStateResponse> {
    const activeVideo = this.state.activeVideos.get(message.tabId);
    let bookmark: VideoBookmark | null = null;

    try {
      bookmark = await storageManager.getBookmark(message.videoId);
    } catch (error) {
      // Bookmark not found is expected
      if (error instanceof StorageError && error.type !== 'NOT_FOUND') {
        console.error('Error getting bookmark:', error);
      }
    }

    return {
      bookmark,
      activeVideo: activeVideo && activeVideo.id === message.videoId ? activeVideo : null
    };
  }

  /**
   * Handle tab removed event
   */
  private handleTabRemoved(tabId: number): void {
    const activeVideo = this.state.activeVideos.get(tabId);
    if (activeVideo) {
      this.saveVideoState(activeVideo);
      this.state.activeVideos.delete(tabId);
      console.log('Tab closed, video state saved:', activeVideo.id);
    }
  }

  /**
   * Save video state to storage
   */
  private async saveVideoState(activeVideo: ActiveVideo): Promise<void> {
    try {
      const bookmark: VideoBookmark = {
        id: activeVideo.id,
        url: activeVideo.url,
        title: activeVideo.title,
        lastTimestamp: activeVideo.lastTimestamp,
        maxTimestamp: activeVideo.maxTimestamp,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await storageManager.saveBookmark(bookmark);
      console.log('Video state saved:', bookmark);
    } catch (error) {
      console.error('Error saving video state:', error);
    }
  }
} 