import { logger } from '../logger';
import { VideoMetadata, PlayerState } from './types';

/**
 * Get video data from the player
 */
export async function getVideoData(tabId: number): Promise<VideoMetadata | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const player = document.querySelector('#movie_player');
        if (!player || typeof (player as any).getVideoData !== 'function') {
          return null;
        }
        
        const videoData = (player as any).getVideoData();
        const duration = (player as any).getDuration();
        
        return {
          id: videoData.video_id,
          title: videoData.title,
          author: videoData.author,
          duration: duration,
          url: window.location.href
        };
      },
      world: 'MAIN'
    });

    return results[0].result;
  } catch (error) {
    logger.error('Failed to get video data:', error);
    return null;
  }
}

/**
 * Get current time from the player
 */
export async function getCurrentTime(tabId: number): Promise<number> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const player = document.querySelector('#movie_player');
        return (player as any)?.getCurrentTime?.() || 0;
      },
      world: 'MAIN'
    });

    return results[0].result;
  } catch (error) {
    logger.error('Failed to get current time:', error);
    return 0;
  }
}

/**
 * Get player state
 */
export async function getPlayerState(tabId: number): Promise<PlayerState> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const player = document.querySelector('#movie_player');
        return (player as any)?.getPlayerState?.() ?? -1;
      },
      world: 'MAIN'
    });

    return results[0].result;
  } catch (error) {
    logger.error('Failed to get player state:', error);
    return PlayerState.UNSTARTED;
  }
}

/**
 * Check if player exists and has required methods
 */
export async function isPlayerReady(tabId: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const player = document.querySelector('#movie_player');
        return !!(
          player &&
          typeof (player as any).getVideoData === 'function' &&
          typeof (player as any).getCurrentTime === 'function' &&
          typeof (player as any).getDuration === 'function' &&
          typeof (player as any).getPlayerState === 'function'
        );
      },
      world: 'MAIN'
    });

    return results[0].result;
  } catch (error) {
    logger.error('Failed to check player ready state:', error);
    return false;
  }
} 