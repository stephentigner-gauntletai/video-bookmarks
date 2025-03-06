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
  GetVideoStateMessage,
  InitiateDeleteMessage,
  UndoDeleteMessage,
  ConfirmDeleteMessage
} from './types';
import { handlePlayerProxyMessage } from './playerProxy';

/**
 * Manager class for background script functionality
 */
export class BackgroundManager {
  private static instance: BackgroundManager;
  private state: BackgroundState = {
    activeVideos: new Map(),
    isInitialized: false
  };
  private saveInterval: number | null = null;
  private readonly SAVE_INTERVAL = 30000; // Save every 30 seconds

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

    // Setup tab update listener
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));

    // Start periodic saves
    this.startPeriodicSaves();

    // Run initial cleanup
    await this.cleanupOldBookmarks();

    // Setup periodic cleanup
    setInterval(() => this.cleanupOldBookmarks(), 24 * 60 * 60 * 1000); // Run daily

    this.state.isInitialized = true;
    console.log('[Video Bookmarks] Background manager initialized');
  }

  /**
   * Start periodic saves of all active videos
   */
  private startPeriodicSaves(): void {
    if (this.saveInterval !== null) {
      clearInterval(this.saveInterval);
    }

    this.saveInterval = setInterval(() => {
      console.debug('[Video Bookmarks] Running periodic save');
      for (const [tabId, activeVideo] of this.state.activeVideos.entries()) {
        if (!activeVideo.pendingDeletion) {
          this.saveVideoState(activeVideo);
        }
      }
    }, this.SAVE_INTERVAL) as unknown as number;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.saveInterval !== null) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    this.state.activeVideos.clear();
    this.state.isInitialized = false;
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(
    message: BackgroundMessageUnion,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    try {
      console.debug('[Video Bookmarks] Received message:', { message, sender });

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

      // Handle player proxy messages
      if ([
        BackgroundMessageType.CHECK_PLAYER_READY,
        BackgroundMessageType.GET_VIDEO_DATA,
        BackgroundMessageType.GET_PLAYER_STATE,
        BackgroundMessageType.GET_CURRENT_TIME
      ].includes(message.type)) {
        handlePlayerProxyMessage(message, sendResponse);
        return true;
      }

      // Handle CSS injection
      if (message.type === BackgroundMessageType.INJECT_STYLES) {
        this.injectStyles(message.tabId);
        sendResponse();
        return true;
      }

      // Handle deletion messages from popup (these don't need a tabId)
      if ([
        BackgroundMessageType.INITIATE_DELETE,
        BackgroundMessageType.UNDO_DELETE,
        BackgroundMessageType.CONFIRM_DELETE
      ].includes(message.type)) {
        switch (message.type) {
          case BackgroundMessageType.INITIATE_DELETE:
            this.handleInitiateDelete(message as InitiateDeleteMessage);
            break;
          case BackgroundMessageType.UNDO_DELETE:
            this.handleUndoDelete(message as UndoDeleteMessage);
            break;
          case BackgroundMessageType.CONFIRM_DELETE:
            this.handleConfirmDelete(message as ConfirmDeleteMessage);
            break;
        }
        return false;
      }

      // For all other messages (from content scripts), ensure we have a valid tabId
      const tabId = sender.tab?.id;
      if (typeof tabId !== 'number') {
        console.error('[Video Bookmarks] Invalid tabId in content script message:', message);
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
          this.handleUpdateTimestamp(messageWithTabId as UpdateTimestampMessage).then(sendResponse);
          return true; // Will respond asynchronously

        case BackgroundMessageType.GET_VIDEO_STATE:
          this.handleGetVideoState(messageWithTabId as GetVideoStateMessage).then(sendResponse);
          return true; // Will respond asynchronously
      }
    } catch (error) {
      console.error('[Video Bookmarks] Error handling message:', error);
    }

    return false;
  }

  /**
   * Handle video detected message
   */
  private handleVideoDetected(message: VideoDetectedMessage): void {
    // Get existing active video if any
    const existingVideo = this.state.activeVideos.get(message.tabId);

    // Create or update active video
    const activeVideo: ActiveVideo = {
      id: message.videoId,
      tabId: message.tabId,
      url: message.url,
      // Preserve existing metadata if new values are empty
      title: message.title || existingVideo?.title || '',
      author: message.author || existingVideo?.author || '',
      lastTimestamp: message.lastTimestamp ?? existingVideo?.lastTimestamp ?? 0,
      maxTimestamp: message.maxTimestamp ?? existingVideo?.maxTimestamp ?? 0,
      lastUpdate: Date.now()
    };

    // Only update if we have valid metadata
    if (!activeVideo.title || !activeVideo.author) {
      console.warn('[Video Bookmarks] Received empty metadata, preserving existing state:', {
        received: { title: message.title, author: message.author },
        preserved: { title: existingVideo?.title, author: existingVideo?.author }
      });
      return;
    }

    // Add to active videos
    this.state.activeVideos.set(message.tabId, activeVideo);
    console.debug('[Video Bookmarks] Video detected:', activeVideo);
  }

  /**
   * Handle video closed message
   */
  private handleVideoClosed(message: VideoClosedMessage): void {
    const activeVideo = this.state.activeVideos.get(message.tabId);
    if (activeVideo && activeVideo.id === message.videoId) {
      this.saveVideoState(activeVideo);
      this.state.activeVideos.delete(message.tabId);
      console.debug('[Video Bookmarks] Video closed:', message.videoId);
    }
  }

  /**
   * Handle update timestamp message
   */
  private async handleUpdateTimestamp(message: UpdateTimestampMessage): Promise<void> {
    const activeVideo = this.state.activeVideos.get(message.tabId);
    if (!activeVideo || activeVideo.id !== message.videoId) {
      return;
    }

    // Always update lastTimestamp to current position
    activeVideo.lastTimestamp = message.timestamp;

    // Only update maxTimestamp if we've watched further
    if (message.isMaxTimestamp || message.timestamp > activeVideo.maxTimestamp) {
      activeVideo.maxTimestamp = message.timestamp;
    }

    activeVideo.lastUpdate = Date.now();

    // Save to storage
    await this.saveVideoState(activeVideo);
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
      console.debug('[Video Bookmarks] Tab closed, video state saved:', activeVideo.id);
    }
  }

  /**
   * Handle tab updated event
   */
  private handleTabUpdated(tabId: number, changeInfo: chrome.tabs.TabChangeInfo): void {
    // Save state when tab is refreshed or URL changes
    if (changeInfo.status === 'loading') {
      const activeVideo = this.state.activeVideos.get(tabId);
      if (activeVideo) {
        console.debug('[Video Bookmarks] Tab updated, saving video state:', activeVideo.id);
        this.saveVideoState(activeVideo);
        // Don't delete from activeVideos here as the video might be reloaded
      }
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
        author: activeVideo.author,
        lastTimestamp: activeVideo.lastTimestamp,
        maxTimestamp: activeVideo.maxTimestamp,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await storageManager.saveBookmark(bookmark);
      console.debug('[Video Bookmarks] Video state saved:', bookmark);
    } catch (error) {
      console.error('[Video Bookmarks] Error saving video state:', error);
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

      // Keep track of last known good values
      let lastKnownGoodData: {
        videoId?: string;
        title?: string;
        author?: string;
        duration?: number;
      } = {};

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

          // Validate the data
          const isValidData = 
            videoData.video_id && 
            videoData.title && 
            videoData.title.trim() !== '' &&
            videoData.author && 
            videoData.author.trim() !== '';

          if (isValidData) {
            // Update last known good data
            lastKnownGoodData = {
              videoId: videoData.video_id,
              title: videoData.title,
              author: videoData.author,
              duration: player.getDuration()
            };
          } else {
            console.warn('[Video Bookmarks] Bridge: Invalid metadata detected, using last known good data');
            // If we have no valid data at all, report an error
            if (!lastKnownGoodData.videoId) {
              window.postMessage({ 
                type: 'PLAYER_STATUS', 
                status: 'error',
                error: 'No valid metadata available'
              }, '*');
              return;
            }
            // Use last known good data
            videoData.video_id = lastKnownGoodData.videoId;
            videoData.title = lastKnownGoodData.title || videoData.title;
            videoData.author = lastKnownGoodData.author || videoData.author;
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

  /**
   * Inject CSS styles into the page
   */
  private async injectStyles(tabId: number): Promise<void> {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        css: `
          .vb-controls {
            position: relative;
          }
          .vb-controls .ytp-button svg {
            fill: #fff;
            transition: fill 0.2s ease;
          }
          .vb-controls.vb-active .ytp-button svg {
            fill: #1a73e8;
          }
          .vb-controls.vb-saving .ytp-button svg {
            opacity: 0.7;
          }
          .vb-controls.vb-error .ytp-button svg {
            fill: #d93025;
          }
          .vb-controls .ytp-time-display {
            position: absolute;
            left: 100%;
            margin-left: 8px;
            color: #fff;
            font-size: 12px;
            opacity: 0;
            transition: opacity 0.2s ease;
            white-space: nowrap;
          }
          .vb-controls.vb-active .ytp-time-display {
            opacity: 1;
          }
        `
      });
      console.debug('[Video Bookmarks] Styles injected for tab:', tabId);
    } catch (error) {
      console.error('[Video Bookmarks] Failed to inject styles:', error);
    }
  }

  /**
   * Handle initiate delete message
   */
  private async handleInitiateDelete(message: InitiateDeleteMessage): Promise<void> {
    const { videoId } = message;
    
    try {
      // Find all YouTube tabs
      const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtube.com/*'] });
      
      // Mark video as pending deletion in active videos
      for (const [tabId, activeVideo] of this.state.activeVideos.entries()) {
        if (activeVideo.id === videoId) {
          activeVideo.pendingDeletion = true;
        }
      }

      // Broadcast to all YouTube tabs
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: BackgroundMessageType.INITIATE_DELETE,
            videoId,
            tabId: tab.id
          });
        }
      }
      console.debug('[Video Bookmarks] Initiated deletion for video:', videoId);
    } catch (error) {
      console.error('[Video Bookmarks] Error initiating deletion:', error);
    }
  }

  /**
   * Handle undo delete message
   */
  private async handleUndoDelete(message: UndoDeleteMessage): Promise<void> {
    const { videoId } = message;
    
    try {
      // Find all YouTube tabs
      const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtube.com/*'] });
      
      // Remove pending deletion flag from active videos
      for (const [tabId, activeVideo] of this.state.activeVideos.entries()) {
        if (activeVideo.id === videoId) {
          delete activeVideo.pendingDeletion;
        }
      }

      // Broadcast to all YouTube tabs
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: BackgroundMessageType.UNDO_DELETE,
            videoId,
            tabId: tab.id
          });
        }
      }
      console.debug('[Video Bookmarks] Undid deletion for video:', videoId);
    } catch (error) {
      console.error('[Video Bookmarks] Error undoing deletion:', error);
    }
  }

  /**
   * Handle confirm delete message
   */
  private async handleConfirmDelete(message: ConfirmDeleteMessage): Promise<void> {
    const { videoId } = message;
    
    try {
      // Find all YouTube tabs
      const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtube.com/*'] });
      
      // Remove from active videos
      for (const [tabId, activeVideo] of this.state.activeVideos.entries()) {
        if (activeVideo.id === videoId) {
          // Save final state before removal
          await this.saveVideoState(activeVideo);
          this.state.activeVideos.delete(tabId);
        }
      }

      // Delete the bookmark
      await storageManager.deleteBookmark(videoId);

      // Broadcast to all YouTube tabs and popup
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: BackgroundMessageType.CONFIRM_DELETE,
            videoId,
            tabId: tab.id
          });
        }
      }

      // Also broadcast to popup
      chrome.runtime.sendMessage({
        type: BackgroundMessageType.CONFIRM_DELETE,
        videoId
      });

      console.debug('[Video Bookmarks] Confirmed deletion for video:', videoId);
    } catch (error) {
      console.error('[Video Bookmarks] Failed to confirm deletion:', error);
    }
  }

  /**
   * Clean up old bookmarks based on settings
   */
  private async cleanupOldBookmarks(): Promise<void> {
    try {
      console.debug('[Video Bookmarks] Running bookmark cleanup');
      await storageManager.cleanupOldBookmarks();
    } catch (error) {
      console.error('[Video Bookmarks] Failed to cleanup old bookmarks:', error);
    }
  }
} 