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
    // Special case for GET_TAB_ID message
    if (message.type === BackgroundMessageType.GET_TAB_ID) {
      console.debug('[Video Bookmarks] Handling GET_TAB_ID message', {
        sender,
        tabId: sender.tab?.id
      });
      const response = { tabId: sender.tab?.id ?? -1 };
      console.debug('[Video Bookmarks] Sending GET_TAB_ID response:', response);
      sendResponse(response);
      return true;
    }

    // Special case for INJECT_BRIDGE message
    if (message.type === BackgroundMessageType.INJECT_BRIDGE) {
      console.debug('[Video Bookmarks] Handling INJECT_BRIDGE message', {
        tabId: message.tabId
      });
      this.injectBridgeScript(message.tabId).then(sendResponse);
      return true;
    }

    // For all other messages, ensure we have a valid tabId
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') {
      console.error('Invalid tabId in message:', message);
      return false;
    }

    // Create a new message object with the validated tabId
    const messageWithTabId = {
      ...message,
      tabId
    };

    switch (message.type) {
      case BackgroundMessageType.VIDEO_DETECTED:
        this.handleVideoDetected(messageWithTabId as VideoDetectedMessage);
        break;

      case BackgroundMessageType.VIDEO_CLOSED:
        this.handleVideoClosed(messageWithTabId as VideoClosedMessage);
        break;

      case BackgroundMessageType.UPDATE_TIMESTAMP:
        this.handleUpdateTimestamp(messageWithTabId as UpdateTimestampMessage);
        break;

      case BackgroundMessageType.GET_VIDEO_STATE:
        this.handleGetVideoState(messageWithTabId as GetVideoStateMessage).then(sendResponse);
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

  /**
   * Inject the bridge script into a tab
   */
  private async injectBridgeScript(tabId: number): Promise<void> {
    console.debug('[Video Bookmarks] Injecting bridge script into tab:', tabId);

    const bridgeFunction = () => {
      console.debug('[Video Bookmarks] Bridge script starting execution');

      // Define the player interface in the page context
      interface YouTubePlayer extends HTMLElement {
        getVideoData(): { video_id: string; title: string; author: string };
        getCurrentTime(): number;
        getDuration(): number;
        getPlayerState(): number;
      }

      window.addEventListener('message', function(event) {
        if (event.data.type !== 'QUERY_PLAYER') return;
        
        console.debug('[Video Bookmarks] Bridge received QUERY_PLAYER message');
        
        const player = document.querySelector('#movie_player') as YouTubePlayer | null;
        if (!player) {
          console.debug('[Video Bookmarks] Bridge: Player element not found');
          window.postMessage({ type: 'PLAYER_STATUS', status: 'not_found' }, '*');
          return;
        }

        // Log the actual player object for debugging
        console.debug('[Video Bookmarks] Bridge: Found player element:', {
          element: player,
          methods: {
            getVideoData: player.getVideoData,
            getCurrentTime: player.getCurrentTime,
            getDuration: player.getDuration,
            getPlayerState: player.getPlayerState
          }
        });

        // Check if the player API is initialized
        const hasAPI = typeof player.getVideoData === 'function' &&
                      typeof player.getCurrentTime === 'function' &&
                      typeof player.getDuration === 'function' &&
                      typeof player.getPlayerState === 'function';

        if (!hasAPI) {
          console.debug('[Video Bookmarks] Bridge: Player API not ready', {
            methods: {
              getVideoData: typeof player.getVideoData,
              getCurrentTime: typeof player.getCurrentTime,
              getDuration: typeof player.getDuration,
              getPlayerState: typeof player.getPlayerState
            }
          });
          window.postMessage({ 
            type: 'PLAYER_STATUS', 
            status: 'api_not_ready',
            methods: {
              getVideoData: typeof player.getVideoData,
              getCurrentTime: typeof player.getCurrentTime,
              getDuration: typeof player.getDuration,
              getPlayerState: typeof player.getPlayerState
            }
          }, '*');
          return;
        }

        try {
          // Try to get video data and log it
          console.debug('[Video Bookmarks] Bridge: Attempting to get video data');
          const videoData = player.getVideoData();
          console.debug('[Video Bookmarks] Bridge: Retrieved video data:', videoData);

          if (!videoData || !videoData.video_id) {
            console.warn('[Video Bookmarks] Bridge: Invalid video data:', videoData);
            window.postMessage({ 
              type: 'PLAYER_STATUS', 
              status: 'error',
              error: 'Invalid video data returned from player'
            }, '*');
            return;
          }

          console.debug('[Video Bookmarks] Bridge: Player API ready, sending data');
          window.postMessage({
            type: 'PLAYER_STATUS',
            status: 'ready',
            data: {
              videoId: videoData.video_id,
              title: videoData.title,
              author: videoData.author,
              duration: player.getDuration(),
              currentTime: player.getCurrentTime(),
              state: player.getPlayerState()
            }
          }, '*');
        } catch (error) {
          console.error('[Video Bookmarks] Bridge: Error accessing player API:', error);
          window.postMessage({ 
            type: 'PLAYER_STATUS', 
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }, '*');
        }
      });

      console.debug('[Video Bookmarks] Bridge script setup complete');
    };

    try {
      console.debug('[Video Bookmarks] Executing bridge script injection');
      await chrome.scripting.executeScript({
        target: { tabId },
        func: bridgeFunction,
        world: 'MAIN'
      });
      console.debug('[Video Bookmarks] Bridge script injection successful');
    } catch (error) {
      console.error('[Video Bookmarks] Failed to inject bridge script:', error);
      throw error;
    }
  }
} 