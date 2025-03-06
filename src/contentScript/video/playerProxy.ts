import { logger } from '../logger';
import { VideoMetadata, PlayerState } from './types';
import { BackgroundMessageType } from '../../background/types';

/**
 * Get video data from the player
 */
export async function getVideoData(tabId: number): Promise<VideoMetadata | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: BackgroundMessageType.GET_VIDEO_DATA,
      tabId
    });
    return response?.videoData || null;
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
    const response = await chrome.runtime.sendMessage({
      type: BackgroundMessageType.GET_CURRENT_TIME,
      tabId
    });
    return response?.time || 0;
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
    const response = await chrome.runtime.sendMessage({
      type: BackgroundMessageType.GET_PLAYER_STATE,
      tabId
    });
    return response?.state ?? PlayerState.UNSTARTED;
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
    const response = await chrome.runtime.sendMessage({
      type: BackgroundMessageType.CHECK_PLAYER_READY,
      tabId
    });
    return response?.ready || false;
  } catch (error) {
    logger.error('Failed to check player ready state:', error);
    return false;
  }
} 