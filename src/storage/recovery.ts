import { VideoBookmark, StorageKeys, StorageSchema, StorageError, StorageErrorType } from './types';
import { withRetry } from '../utils/retry';

/**
 * Validates a video bookmark object
 */
function isValidBookmark(bookmark: any): bookmark is VideoBookmark {
  return (
    typeof bookmark === 'object' &&
    typeof bookmark.id === 'string' &&
    typeof bookmark.url === 'string' &&
    typeof bookmark.title === 'string' &&
    typeof bookmark.author === 'string' &&
    typeof bookmark.lastTimestamp === 'number' &&
    typeof bookmark.maxTimestamp === 'number' &&
    typeof bookmark.createdAt === 'number' &&
    typeof bookmark.updatedAt === 'number' &&
    bookmark.lastTimestamp >= 0 &&
    bookmark.maxTimestamp >= bookmark.lastTimestamp &&
    bookmark.createdAt <= bookmark.updatedAt &&
    bookmark.updatedAt <= Date.now()
  );
}

/**
 * Validates storage settings
 */
function isValidSettings(settings: any): settings is StorageSchema[StorageKeys.SETTINGS] {
  return (
    typeof settings === 'object' &&
    typeof settings.autoTrack === 'boolean' &&
    typeof settings.cleanupDays === 'number' &&
    settings.cleanupDays > 0
  );
}

/**
 * Class to handle storage recovery operations
 */
export class StorageRecovery {
  private static instance: StorageRecovery;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): StorageRecovery {
    if (!StorageRecovery.instance) {
      StorageRecovery.instance = new StorageRecovery();
    }
    return StorageRecovery.instance;
  }

  /**
   * Validate and repair storage data
   */
  public async validateAndRepair(): Promise<void> {
    try {
      // Get all storage data
      const storage = await this.getStorage();

      // Validate and repair bookmarks
      const repairedBookmarks = await this.validateAndRepairBookmarks(storage[StorageKeys.BOOKMARKS]);

      // Validate and repair settings
      const repairedSettings = await this.validateAndRepairSettings(storage[StorageKeys.SETTINGS]);

      // Save repaired data
      await this.saveRepairedData(repairedBookmarks, repairedSettings);
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to validate and repair storage',
        error
      );
    }
  }

  /**
   * Get all storage data
   */
  private async getStorage(): Promise<Partial<StorageSchema>> {
    return await withRetry('get storage data', async () => {
      return await chrome.storage.local.get(null) as Partial<StorageSchema>;
    });
  }

  /**
   * Validate and repair bookmarks
   */
  private async validateAndRepairBookmarks(
    bookmarks: Record<string, VideoBookmark> = {}
  ): Promise<Record<string, VideoBookmark>> {
    const repairedBookmarks: Record<string, VideoBookmark> = {};
    const errors: string[] = [];

    for (const [id, bookmark] of Object.entries(bookmarks)) {
      try {
        if (isValidBookmark(bookmark)) {
          repairedBookmarks[id] = bookmark;
        } else {
          // Try to repair the bookmark
          const repaired = await this.repairBookmark(id, bookmark);
          if (repaired) {
            repairedBookmarks[id] = repaired;
          }
        }
      } catch (error) {
        errors.push(`Failed to repair bookmark ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (errors.length > 0) {
      console.warn('Bookmark repair warnings:', errors);
    }

    return repairedBookmarks;
  }

  /**
   * Attempt to repair a corrupted bookmark
   */
  private async repairBookmark(id: string, bookmark: any): Promise<VideoBookmark | null> {
    // Skip if completely invalid
    if (!bookmark || typeof bookmark !== 'object') return null;

    try {
      const now = Date.now();
      const repaired: VideoBookmark = {
        id: typeof bookmark.id === 'string' ? bookmark.id : id,
        url: typeof bookmark.url === 'string' ? bookmark.url : `https://youtube.com/watch?v=${id}`,
        title: typeof bookmark.title === 'string' ? bookmark.title : 'Unknown Title',
        author: typeof bookmark.author === 'string' ? bookmark.author : 'Unknown Author',
        lastTimestamp: typeof bookmark.lastTimestamp === 'number' && bookmark.lastTimestamp >= 0 
          ? bookmark.lastTimestamp 
          : 0,
        maxTimestamp: typeof bookmark.maxTimestamp === 'number' && bookmark.maxTimestamp >= 0
          ? Math.max(bookmark.maxTimestamp, bookmark.lastTimestamp || 0)
          : bookmark.lastTimestamp || 0,
        createdAt: typeof bookmark.createdAt === 'number' && bookmark.createdAt > 0
          ? Math.min(bookmark.createdAt, now)
          : now,
        updatedAt: typeof bookmark.updatedAt === 'number' && bookmark.updatedAt > 0
          ? Math.min(bookmark.updatedAt, now)
          : now
      };

      // Ensure timestamps are valid
      if (repaired.maxTimestamp < repaired.lastTimestamp) {
        repaired.maxTimestamp = repaired.lastTimestamp;
      }
      if (repaired.createdAt > repaired.updatedAt) {
        repaired.createdAt = repaired.updatedAt;
      }

      return repaired;
    } catch (error) {
      console.error('Failed to repair bookmark:', error);
      return null;
    }
  }

  /**
   * Validate and repair settings
   */
  private async validateAndRepairSettings(
    settings: StorageSchema[StorageKeys.SETTINGS] | undefined
  ): Promise<StorageSchema[StorageKeys.SETTINGS]> {
    const defaultSettings: StorageSchema[StorageKeys.SETTINGS] = {
      autoTrack: true,
      cleanupDays: 30
    };

    if (!settings || !isValidSettings(settings)) {
      return defaultSettings;
    }

    // Ensure values are within valid ranges
    return {
      autoTrack: Boolean(settings.autoTrack),
      cleanupDays: Math.max(1, Math.min(365, settings.cleanupDays))
    };
  }

  /**
   * Save repaired data back to storage
   */
  private async saveRepairedData(
    bookmarks: Record<string, VideoBookmark>,
    settings: StorageSchema[StorageKeys.SETTINGS]
  ): Promise<void> {
    await withRetry('save repaired data', async () => {
      await chrome.storage.local.set({
        [StorageKeys.BOOKMARKS]: bookmarks,
        [StorageKeys.SETTINGS]: settings
      });
    });
  }

  /**
   * Create a backup of current storage data
   */
  public async createBackup(): Promise<void> {
    try {
      const storage = await this.getStorage();
      const backup = {
        data: storage,
        timestamp: Date.now(),
        version: chrome.runtime.getManifest().version
      };

      await withRetry('create backup', async () => {
        await chrome.storage.local.set({
          ['backup']: backup
        });
      });
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to create backup',
        error
      );
    }
  }

  /**
   * Restore from backup if available
   */
  public async restoreFromBackup(): Promise<boolean> {
    try {
      const backup = await withRetry('get backup', async () => {
        const result = await chrome.storage.local.get('backup');
        return result.backup;
      });

      if (!backup || !backup.data) {
        return false;
      }

      // Validate backup data before restoring
      const repairedBookmarks = await this.validateAndRepairBookmarks(backup.data[StorageKeys.BOOKMARKS]);
      const repairedSettings = await this.validateAndRepairSettings(backup.data[StorageKeys.SETTINGS]);

      // Save validated backup data
      await this.saveRepairedData(repairedBookmarks, repairedSettings);

      return true;
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to restore from backup',
        error
      );
    }
  }
} 