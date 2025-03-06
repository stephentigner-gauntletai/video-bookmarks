import { VideoBookmark, StorageKeys, StorageSchema, StorageError, StorageErrorType, BackupData } from './types';
import { withRetry } from '../utils/retry';
import { showError, showSuccess, showWarning, showInfo } from '../contentScript/ui/notifications';

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
      showInfo('Checking storage integrity...');
      
      // Get all storage data
      const storage = await this.getStorage();

      // Validate and repair bookmarks
      const repairedBookmarks = await this.validateAndRepairBookmarks(storage[StorageKeys.BOOKMARKS]);

      // Validate and repair settings
      const repairedSettings = await this.validateAndRepairSettings(storage[StorageKeys.SETTINGS]);

      // Save repaired data
      await this.saveRepairedData(repairedBookmarks, repairedSettings);

      showSuccess('Storage validation complete');
    } catch (error) {
      showError('Failed to validate storage data', () => this.validateAndRepair());
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
    bookmarks: Record<string, VideoBookmark | any> = {}
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
            showWarning(`Repaired corrupted bookmark: ${repaired.title}`);
          } else {
            showError(`Unable to repair bookmark: ${bookmark?.title || id}`);
          }
        }
      } catch (error) {
        const message = `Failed to repair bookmark ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(message);
        showError(message);
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
      showInfo('Creating storage backup...');
      
      const storage = await this.getStorage();
      // Exclude the backup key to prevent nesting
      const { [StorageKeys.BACKUP]: _, ...dataToBackup } = storage;
      
      const backup: BackupData = {
        data: {
          bookmarks: dataToBackup[StorageKeys.BOOKMARKS] || {},
          settings: dataToBackup[StorageKeys.SETTINGS] || {
            autoTrack: true,
            cleanupDays: 30
          }
        },
        timestamp: Date.now(),
        version: chrome.runtime.getManifest().version
      };

      await withRetry('create backup', async () => {
        await chrome.storage.local.set({
          [StorageKeys.BACKUP]: backup
        });
      });

      showSuccess('Storage backup created');
    } catch (error) {
      showError('Failed to create backup', () => this.createBackup());
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to create backup',
        error
      );
    }
  }

  /**
   * Clean up corrupted backup data
   */
  private async cleanupCorruptedBackup(): Promise<void> {
    try {
      const storage = await this.getStorage();
      if (!storage[StorageKeys.BACKUP]) return;

      // Function to extract valid data from nested backup
      const extractValidData = (backup: any): BackupData['data'] | null => {
        if (!backup || typeof backup !== 'object') return null;
        
        // If we find bookmarks and settings at this level, this is valid data
        if (backup.bookmarks && backup.settings) {
          return {
            bookmarks: backup.bookmarks,
            settings: backup.settings
          };
        }

        // Check data property for valid data
        if (backup.data) {
          const dataResult = extractValidData(backup.data);
          if (dataResult) return dataResult;
        }

        // Check backup property for valid data
        if (backup.backup) {
          const backupResult = extractValidData(backup.backup);
          if (backupResult) return backupResult;
        }

        return null;
      };

      // Try to extract valid data from the corrupted backup
      const validData = extractValidData(storage[StorageKeys.BACKUP]);

      if (validData) {
        // Save the valid data as a new clean backup
        const backup: BackupData = {
          data: validData,
          timestamp: Date.now(),
          version: chrome.runtime.getManifest().version
        };
        await chrome.storage.local.set({
          [StorageKeys.BACKUP]: backup
        });
      } else {
        // If no valid data found, remove the corrupted backup
        await chrome.storage.local.remove(StorageKeys.BACKUP);
      }
    } catch (error) {
      console.error('Failed to cleanup corrupted backup:', error);
    }
  }

  /**
   * Restore from backup if available
   */
  public async restoreFromBackup(): Promise<boolean> {
    try {
      showWarning('Attempting to restore from backup...');
      
      // First cleanup any corrupted backup
      await this.cleanupCorruptedBackup();

      const result = await withRetry('get backup', async () => {
        return await chrome.storage.local.get(StorageKeys.BACKUP);
      });

      const backup = result[StorageKeys.BACKUP] as BackupData | undefined;
      if (!backup?.data) {
        showError('No backup available for restoration');
        return false;
      }

      // Validate backup data before restoring
      const repairedBookmarks = await this.validateAndRepairBookmarks(backup.data.bookmarks);
      const repairedSettings = await this.validateAndRepairSettings(backup.data.settings);

      // Save validated backup data
      await chrome.storage.local.set({
        [StorageKeys.BOOKMARKS]: repairedBookmarks,
        [StorageKeys.SETTINGS]: repairedSettings
      });

      showSuccess('Storage restored from backup');
      return true;
    } catch (error) {
      showError('Failed to restore from backup');
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to restore from backup',
        error
      );
    }
  }
} 