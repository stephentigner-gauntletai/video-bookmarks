/**
 * Represents a video bookmark with timestamp and metadata
 */
export interface VideoBookmark {
  id: string;           // YouTube video ID
  url: string;          // Full video URL
  title: string;        // Video title
  author: string;       // Video author/channel name
  lastTimestamp: number;// Last known position in seconds
  maxTimestamp: number; // Furthest watched position in seconds
  createdAt: number;    // Timestamp of bookmark creation
  updatedAt: number;    // Timestamp of last update
}

/**
 * Storage keys used in chrome.storage.local
 */
export enum StorageKeys {
  BOOKMARKS = 'bookmarks',
  SETTINGS = 'settings',
  BACKUP = 'backup'
}

/**
 * Backup data structure
 */
export interface BackupData {
  data: {
    bookmarks: Record<string, VideoBookmark>;
    settings: {
      autoTrack: boolean;
      cleanupDays: number;
    };
  };
  timestamp: number;
  version: string;
}

/**
 * Structure of our storage
 */
export interface StorageSchema {
  [StorageKeys.BOOKMARKS]: {
    [videoId: string]: VideoBookmark;
  };
  [StorageKeys.SETTINGS]: {
    autoTrack: boolean;  // Whether to automatically track video progress
    cleanupDays: number; // Number of days after which to clean up old bookmarks
  };
  [StorageKeys.BACKUP]?: BackupData;
}

/**
 * Error types that can occur during storage operations
 */
export enum StorageErrorType {
  NOT_FOUND = 'NOT_FOUND',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_DATA = 'INVALID_DATA',
  OPERATION_FAILED = 'OPERATION_FAILED'
}

/**
 * Custom error class for storage operations
 */
export class StorageError extends Error {
  constructor(
    public type: StorageErrorType,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'StorageError';
  }
} 