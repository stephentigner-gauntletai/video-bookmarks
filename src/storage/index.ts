import { VideoBookmark, StorageKeys, StorageSchema, StorageError, StorageErrorType } from './types';
import { withRetry, RetryConfig } from '../utils/retry';
import { StorageRecovery } from './recovery';

/**
 * Storage operation retry configuration
 */
const STORAGE_RETRY_CONFIG: Partial<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 500,    // Start with 500ms
  maxDelay: 5000,       // Max 5 seconds
  backoffFactor: 2,     // Double the delay each time
  timeout: 10000        // 10 second total timeout
};

/**
 * Wrapper for chrome.storage.local operations with type safety and error handling
 */
class StorageManager {
  private static instance: StorageManager;
  private recovery: StorageRecovery;
  private lastBackup: number = 0;
  private readonly BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {
    this.recovery = StorageRecovery.getInstance();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * Initialize storage with default values if needed
   */
  public async initialize(): Promise<void> {
    try {
      // First, try to validate and repair any corrupted data
      await this.recovery.validateAndRepair();

      // Then initialize with default values if needed
      await withRetry('initialize storage', async () => {
        const storage = await this.getStorage();
        const updates: Partial<StorageSchema> = {};
        let needsUpdate = false;

        if (!storage[StorageKeys.BOOKMARKS]) {
          updates[StorageKeys.BOOKMARKS] = {};
          needsUpdate = true;
        }

        if (!storage[StorageKeys.SETTINGS]) {
          updates[StorageKeys.SETTINGS] = {
            autoTrack: true,
            cleanupDays: 30
          };
          needsUpdate = true;
        }

        if (needsUpdate) {
          await chrome.storage.local.set(updates);
        }

        // Create initial backup if none exists
        await this.checkBackup();
      }, STORAGE_RETRY_CONFIG);
    } catch (error) {
      console.error('[Video Bookmarks] Storage initialization failed:', error);
      
      // If initialization fails, try to restore from backup
      try {
        const restored = await this.recovery.restoreFromBackup();
        if (!restored) {
          console.error('[Video Bookmarks] No backup available for recovery');
          // Initialize with empty state rather than throwing
          await chrome.storage.local.set({
            [StorageKeys.BOOKMARKS]: {},
            [StorageKeys.SETTINGS]: {
              autoTrack: true,
              cleanupDays: 30
            }
          });
          return;
        }
      } catch (backupError) {
        console.error('[Video Bookmarks] Backup restoration failed:', backupError);
        // Initialize with empty state as last resort
        await chrome.storage.local.set({
          [StorageKeys.BOOKMARKS]: {},
          [StorageKeys.SETTINGS]: {
            autoTrack: true,
            cleanupDays: 30
          }
        });
      }
    }
  }

  /**
   * Check if backup is needed and create one if necessary
   */
  private async checkBackup(): Promise<void> {
    const now = Date.now();
    if (now - this.lastBackup >= this.BACKUP_INTERVAL) {
      await this.recovery.createBackup();
      this.lastBackup = now;
    }
  }

  /**
   * Get all storage data
   */
  private async getStorage(): Promise<Partial<StorageSchema>> {
    try {
      return await withRetry('get storage data', async () => {
        return await chrome.storage.local.get(null) as Partial<StorageSchema>;
      }, STORAGE_RETRY_CONFIG);
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to get storage data',
        error
      );
    }
  }

  /**
   * Create or update a bookmark
   */
  public async saveBookmark(bookmark: VideoBookmark): Promise<void> {
    try {
      await withRetry('save bookmark', async () => {
        const storage = await this.getStorage();
        const bookmarks = storage[StorageKeys.BOOKMARKS] || {};

        bookmarks[bookmark.id] = {
          ...bookmark,
          updatedAt: Date.now()
        };

        await chrome.storage.local.set({
          [StorageKeys.BOOKMARKS]: bookmarks
        });

        // Check if backup is needed after significant changes
        await this.checkBackup();
      }, STORAGE_RETRY_CONFIG);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to save bookmark',
        error
      );
    }
  }

  /**
   * Get a bookmark by video ID
   */
  public async getBookmark(videoId: string): Promise<VideoBookmark> {
    try {
      return await withRetry('get bookmark', async () => {
        const storage = await this.getStorage();
        const bookmark = storage[StorageKeys.BOOKMARKS]?.[videoId];

        if (!bookmark) {
          throw new StorageError(
            StorageErrorType.NOT_FOUND,
            `Bookmark not found for video ID: ${videoId}`
          );
        }

        return bookmark;
      }, STORAGE_RETRY_CONFIG);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to get bookmark',
        error
      );
    }
  }

  /**
   * Get all bookmarks
   */
  public async getAllBookmarks(): Promise<VideoBookmark[]> {
    try {
      return await withRetry('get all bookmarks', async () => {
        const storage = await this.getStorage();
        const bookmarks = storage[StorageKeys.BOOKMARKS] || {};
        return Object.values(bookmarks);
      }, STORAGE_RETRY_CONFIG);
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to get all bookmarks',
        error
      );
    }
  }

  /**
   * Delete a bookmark
   */
  public async deleteBookmark(videoId: string): Promise<void> {
    try {
      await withRetry('delete bookmark', async () => {
        const storage = await this.getStorage();
        const bookmarks = storage[StorageKeys.BOOKMARKS] || {};

        if (!bookmarks[videoId]) {
          throw new StorageError(
            StorageErrorType.NOT_FOUND,
            `Bookmark not found for video ID: ${videoId}`
          );
        }

        delete bookmarks[videoId];
        await chrome.storage.local.set({
          [StorageKeys.BOOKMARKS]: bookmarks
        });
      }, STORAGE_RETRY_CONFIG);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to delete bookmark',
        error
      );
    }
  }

  /**
   * Clean up old bookmarks based on settings
   */
  public async cleanupOldBookmarks(): Promise<void> {
    try {
      await withRetry('cleanup old bookmarks', async () => {
        const storage = await this.getStorage();
        const settings = storage[StorageKeys.SETTINGS];
        const bookmarks = storage[StorageKeys.BOOKMARKS] || {};

        if (!settings?.cleanupDays) {
          return;
        }

        const cutoffDate = Date.now() - (settings.cleanupDays * 24 * 60 * 60 * 1000);
        const updatedBookmarks = Object.fromEntries(
          Object.entries(bookmarks).filter(([_, bookmark]) => bookmark.updatedAt > cutoffDate)
        );

        await chrome.storage.local.set({
          [StorageKeys.BOOKMARKS]: updatedBookmarks
        });
      }, STORAGE_RETRY_CONFIG);
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to cleanup old bookmarks',
        error
      );
    }
  }

  /**
   * Update settings
   */
  public async updateSettings(settings: Partial<StorageSchema[StorageKeys.SETTINGS]>): Promise<void> {
    try {
      await withRetry('update settings', async () => {
        const storage = await this.getStorage();
        const currentSettings = storage[StorageKeys.SETTINGS] || {
          autoTrack: true,
          cleanupDays: 30
        };

        await chrome.storage.local.set({
          [StorageKeys.SETTINGS]: {
            ...currentSettings,
            ...settings
          }
        });
      }, STORAGE_RETRY_CONFIG);
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to update settings',
        error
      );
    }
  }

  /**
   * Attempt to recover corrupted data
   */
  public async recover(): Promise<boolean> {
    try {
      // First try to validate and repair
      await this.recovery.validateAndRepair();
      return true;
    } catch (error) {
      // If repair fails, try to restore from backup
      try {
        return await this.recovery.restoreFromBackup();
      } catch (backupError) {
        throw new StorageError(
          StorageErrorType.OPERATION_FAILED,
          'Failed to recover storage data',
          backupError
        );
      }
    }
  }
}

// Export singleton instance
export const storageManager = StorageManager.getInstance();
export * from './types'; 