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
  pendingDeletion?: boolean;  // Whether the video is pending deletion
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
  GET_TAB_ID = 'GET_TAB_ID',
  INJECT_BRIDGE = 'INJECT_BRIDGE',
  CHECK_PLAYER_READY = 'CHECK_PLAYER_READY',
  GET_VIDEO_DATA = 'GET_VIDEO_DATA',
  GET_PLAYER_STATE = 'GET_PLAYER_STATE',
  GET_CURRENT_TIME = 'GET_CURRENT_TIME',
  INJECT_STYLES = 'INJECT_STYLES',
  INITIATE_DELETE = 'INITIATE_DELETE',
  UNDO_DELETE = 'UNDO_DELETE',
  CONFIRM_DELETE = 'CONFIRM_DELETE'
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
 * Message sent to inject bridge script
 */
export interface InjectBridgeMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.INJECT_BRIDGE;
}

/**
 * Message to check if player is ready
 */
export interface CheckPlayerReadyMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.CHECK_PLAYER_READY;
}

/**
 * Message to get video data
 */
export interface GetVideoDataMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.GET_VIDEO_DATA;
}

/**
 * Message to get player state
 */
export interface GetPlayerStateMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.GET_PLAYER_STATE;
}

/**
 * Message to get current time
 */
export interface GetCurrentTimeMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.GET_CURRENT_TIME;
}

/**
 * Message to inject CSS styles
 */
export interface InjectStylesMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.INJECT_STYLES;
}

/**
 * Message sent to initiate bookmark deletion
 */
export interface InitiateDeleteMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.INITIATE_DELETE;
  videoId: string;
}

/**
 * Message sent to undo bookmark deletion
 */
export interface UndoDeleteMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.UNDO_DELETE;
  videoId: string;
}

/**
 * Message sent to confirm bookmark deletion
 */
export interface ConfirmDeleteMessage extends TabBackgroundMessage {
  type: BackgroundMessageType.CONFIRM_DELETE;
  videoId: string;
}

/**
 * Union type of all possible background messages
 */
export type BackgroundMessageUnion = 
  | VideoDetectedMessage 
  | VideoClosedMessage 
  | UpdateTimestampMessage
  | GetVideoStateMessage
  | GetTabIdMessage
  | InjectBridgeMessage
  | CheckPlayerReadyMessage
  | GetVideoDataMessage
  | GetPlayerStateMessage
  | GetCurrentTimeMessage
  | InjectStylesMessage
  | InitiateDeleteMessage
  | UndoDeleteMessage
  | ConfirmDeleteMessage; 