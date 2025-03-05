import { BackgroundMessageType } from './types';

/**
 * Execute a function in the page context and return the result
 */
async function executeInPage<T>(tabId: number, func: () => T): Promise<T | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      world: 'MAIN'
    });

    // Validate that we have results and the first result has a result property
    if (!results || !results[0] || !('result' in results[0])) {
      return null;
    }

    // Type assertion here is safe because func returns type T
    return results[0].result as T;
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
          return null;
        }
        
        const data = (player as any).getVideoData();
        const duration = (player as any).getDuration();
        
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
        return (player as any)?.getPlayerState?.() ?? -1;
      });
      sendResponse({ state });
      break;

    case BackgroundMessageType.GET_CURRENT_TIME:
      const time = await executeInPage(tabId, () => {
        const player = document.querySelector('#movie_player');
        return (player as any)?.getCurrentTime?.() || 0;
      });
      sendResponse({ time });
      break;
  }
} 