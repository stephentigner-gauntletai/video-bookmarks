import { VideoBookmark, StorageKeys, StorageSchema, StorageError, StorageErrorType, SupportedSite, AutoTrackSettings } from './types';

// Current schema version
const CURRENT_SCHEMA_VERSION = 1;

// Default settings values
const DEFAULT_SETTINGS: StorageSchema[StorageKeys.SETTINGS] = {
  autoTrack: false,
  cleanupDays: 30,
  supportedSites: [SupportedSite.YOUTUBE]
};

/**
 * Wrapper for chrome.storage.local operations with type safety and error handling
 */
class StorageManager {
  private static instance: StorageManager;

  private constructor() {}

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
      const storage = await this.getStorage();
      const updates: Partial<StorageSchema> = {};

      // Initialize bookmarks if not present
      if (!storage[StorageKeys.BOOKMARKS]) {
        updates[StorageKeys.BOOKMARKS] = {};
      }

      // Initialize or update settings
      if (!storage[StorageKeys.SETTINGS]) {
        updates[StorageKeys.SETTINGS] = DEFAULT_SETTINGS;
      } else if (!('supportedSites' in storage[StorageKeys.SETTINGS])) {
        // Update existing settings with new fields
        const currentSettings = storage[StorageKeys.SETTINGS] as Partial<StorageSchema[StorageKeys.SETTINGS]>;
        updates[StorageKeys.SETTINGS] = {
          autoTrack: currentSettings.autoTrack ?? DEFAULT_SETTINGS.autoTrack,
          cleanupDays: currentSettings.cleanupDays ?? DEFAULT_SETTINGS.cleanupDays,
          supportedSites: DEFAULT_SETTINGS.supportedSites
        };
      }

      // Initialize or update schema version
      const currentVersion = storage[StorageKeys.SCHEMA_VERSION] || 0;
      if (currentVersion < CURRENT_SCHEMA_VERSION) {
        updates[StorageKeys.SCHEMA_VERSION] = CURRENT_SCHEMA_VERSION;
        await this.migrateSchema(currentVersion, CURRENT_SCHEMA_VERSION, storage);
      }

      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
      }
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to initialize storage',
        error
      );
    }
  }

  /**
   * Migrate schema from one version to another
   */
  private async migrateSchema(
    fromVersion: number,
    toVersion: number,
    storage: Partial<StorageSchema>
  ): Promise<void> {
    // For now, we just have version 1, so no migration logic needed yet
    // This will be implemented when we add new schema versions
    console.debug('[Video Bookmarks] Schema migration:', { fromVersion, toVersion });
  }

  /**
   * Get all storage data
   */
  private async getStorage(): Promise<Partial<StorageSchema>> {
    try {
      return await chrome.storage.local.get(null) as Partial<StorageSchema>;
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
      const storage = await this.getStorage();
      const bookmarks = storage[StorageKeys.BOOKMARKS] || {};

      bookmarks[bookmark.id] = {
        ...bookmark,
        updatedAt: Date.now()
      };

      await chrome.storage.local.set({
        [StorageKeys.BOOKMARKS]: bookmarks
      });
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
      const storage = await this.getStorage();
      const bookmark = storage[StorageKeys.BOOKMARKS]?.[videoId];

      if (!bookmark) {
        throw new StorageError(
          StorageErrorType.NOT_FOUND,
          `Bookmark not found for video ID: ${videoId}`
        );
      }

      return bookmark;
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
      const storage = await this.getStorage();
      const bookmarks = storage[StorageKeys.BOOKMARKS] || {};
      return Object.values(bookmarks);
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
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to update settings',
        error
      );
    }
  }

  /**
   * Get auto-track settings
   */
  public async getAutoTrackSettings(): Promise<AutoTrackSettings> {
    try {
      const storage = await this.getStorage();
      const settings = storage[StorageKeys.SETTINGS];

      if (!settings) {
        return {
          enabled: DEFAULT_SETTINGS.autoTrack,
          supportedSites: DEFAULT_SETTINGS.supportedSites
        };
      }

      return {
        enabled: settings.autoTrack,
        supportedSites: settings.supportedSites || DEFAULT_SETTINGS.supportedSites
      };
    } catch (error) {
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to get auto-track settings',
        error
      );
    }
  }

  /**
   * Update auto-track settings
   */
  public async setAutoTrackSettings(settings: AutoTrackSettings): Promise<void> {
    try {
      // Validate settings
      this.validateAutoTrackSettings(settings);

      const storage = await this.getStorage();
      const currentSettings = storage[StorageKeys.SETTINGS] || DEFAULT_SETTINGS;

      await chrome.storage.local.set({
        [StorageKeys.SETTINGS]: {
          ...currentSettings,
          autoTrack: settings.enabled,
          supportedSites: settings.supportedSites
        }
      });

      console.debug('[Video Bookmarks] Auto-track settings updated:', settings);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError(
        StorageErrorType.OPERATION_FAILED,
        'Failed to update auto-track settings',
        error
      );
    }
  }

  /**
   * Validate auto-track settings
   */
  private validateAutoTrackSettings(settings: AutoTrackSettings): void {
    if (typeof settings.enabled !== 'boolean') {
      throw new StorageError(
        StorageErrorType.INVALID_DATA,
        'Auto-track enabled setting must be a boolean'
      );
    }

    if (!Array.isArray(settings.supportedSites)) {
      throw new StorageError(
        StorageErrorType.INVALID_DATA,
        'Supported sites must be an array'
      );
    }

    // Validate each site is a valid SupportedSite enum value
    const validSites = Object.values(SupportedSite);
    for (const site of settings.supportedSites) {
      if (!validSites.includes(site)) {
        throw new StorageError(
          StorageErrorType.INVALID_DATA,
          `Invalid supported site: ${site}`
        );
      }
    }
  }
}

// Export singleton instance
export const storageManager = StorageManager.getInstance();
export * from './types'; 