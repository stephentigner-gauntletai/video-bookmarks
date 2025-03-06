import { BackgroundMessageType } from './types';
import { withRetry, RetryConfig } from '../utils/retry';

/**
 * Retry configuration for player operations
 */
const PLAYER_RETRY_CONFIG: Partial<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 200,    // Start with 200ms
  maxDelay: 2000,       // Max 2 seconds
  backoffFactor: 2,     // Double the delay each time
  timeout: 5000         // 5 second total timeout
};

/**
 * Execute a function in the page context and return the result
 */
async function executeInPage<T>(tabId: number, func: () => T): Promise<T | null> {
  try {
    return await withRetry('execute in page', async () => {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        world: 'MAIN'
      });

      // Validate that we have results and the first result has a result property
      if (!results || !results[0] || !('result' in results[0])) {
        throw new Error('Invalid script execution result');
      }

      // Type assertion here is safe because func returns type T
      return results[0].result as T;
    }, PLAYER_RETRY_CONFIG);
  } catch (error) {
    console.error('Failed to execute in page:', error);
    return null;
  }
}

/**
 * Handle player proxy messages from content script
 */
export async function handlePlayerProxyMessage(
  message: { type: BackgroundMessageType; tabId: number },
  sendResponse: (response: any) => void
): Promise<void> {
  const { type, tabId } = message;

  try {
    switch (type) {
      case BackgroundMessageType.CHECK_PLAYER_READY:
        const ready = await executeInPage(tabId, () => {
          const player = document.querySelector('#movie_player');
          return !!(
            player &&
            typeof (player as any).getVideoData === 'function' &&
            typeof (player as any).getCurrentTime === 'function' &&
            typeof (player as any).getDuration === 'function' &&
            typeof (player as any).getPlayerState === 'function'
          );
        });
        sendResponse({ ready });
        break;

      case BackgroundMessageType.GET_VIDEO_DATA:
        const videoData = await executeInPage(tabId, () => {
          const player = document.querySelector('#movie_player');
          if (!player || typeof (player as any).getVideoData !== 'function') {
            throw new Error('Player not ready');
          }
          
          const data = (player as any).getVideoData();
          const duration = (player as any).getDuration();
          
          if (!data || !data.video_id) {
            throw new Error('Invalid video data');
          }
          
          return {
            id: data.video_id,
            title: data.title,
            author: data.author,
            duration: duration,
            url: window.location.href
          };
        });
        sendResponse({ videoData });
        break;

      case BackgroundMessageType.GET_PLAYER_STATE:
        const state = await executeInPage(tabId, () => {
          const player = document.querySelector('#movie_player');
          if (!player || typeof (player as any).getPlayerState !== 'function') {
            throw new Error('Player not ready');
          }
          return (player as any).getPlayerState();
        });
        sendResponse({ state });
        break;

      case BackgroundMessageType.GET_CURRENT_TIME:
        const time = await executeInPage(tabId, () => {
          const player = document.querySelector('#movie_player');
          if (!player || typeof (player as any).getCurrentTime !== 'function') {
            throw new Error('Player not ready');
          }
          return (player as any).getCurrentTime();
        });
        sendResponse({ time });
        break;

      default:
        console.warn('Unhandled player proxy message type:', type);
        sendResponse({ error: 'Unhandled message type' });
    }
  } catch (error: unknown) {
    console.error('Error handling player proxy message:', error);
    sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
} 