import { VideoBookmark } from '../storage/types';

/**
 * State of active video tracking
 */
export interface ActiveVideo {
  id: string;
  tabId: number;
  url: string;
  title: string;
  lastTimestamp: number;
  maxTimestamp: number;
  lastUpdate: number;
}

/**
 * Background script state
 */
export interface BackgroundState {
  activeVideos: Map<number, ActiveVideo>;  // tabId -> ActiveVideo
  isInitialized: boolean;
}

/**
 * Types of messages that can be sent to the background script
 */
export enum BackgroundMessageType {
  VIDEO_DETECTED = 'VIDEO_DETECTED',
  VIDEO_CLOSED = 'VIDEO_CLOSED',
  UPDATE_TIMESTAMP = 'UPDATE_TIMESTAMP',
  GET_VIDEO_STATE = 'GET_VIDEO_STATE',
  GET_TAB_ID = 'GET_TAB_ID'
}

/**
 * Base interface for all background messages
 */
export interface BackgroundMessageBase {
  type: BackgroundMessageType;
}

/**
 * Base interface for messages that require a tab ID
 */
export interface TabBackgroundMessage extends BackgroundMessageBase {
  tabId: number;
}

/**
 * Message sent when a video is detected
 */
export interface VideoDetectedMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.VIDEO_DETECTED;
  videoId: string;
  url: string;
  title: string;
}

/**
 * Message sent when a video is closed
 */
export interface VideoClosedMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.VIDEO_CLOSED;
  videoId: string;
}

/**
 * Message sent to update video timestamp
 */
export interface UpdateTimestampMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.UPDATE_TIMESTAMP;
  videoId: string;
  timestamp: number;
  isMaxTimestamp: boolean;
}

/**
 * Message sent to get video state
 */
export interface GetVideoStateMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.GET_VIDEO_STATE;
  videoId: string;
}

/**
 * Message sent to get current tab ID
 */
export interface GetTabIdMessage extends BackgroundMessageBase {
  type: BackgroundMessageType.GET_TAB_ID;
}

/**
 * Response to get video state
 */
export interface GetVideoStateResponse {
  bookmark: VideoBookmark | null;
  activeVideo: ActiveVideo | null;
}

/**
 * Union type of all possible background messages
 */
export type BackgroundMessageUnion = 
  | VideoDetectedMessage 
  | VideoClosedMessage 
  | UpdateTimestampMessage
  | GetVideoStateMessage
  | GetTabIdMessage; 