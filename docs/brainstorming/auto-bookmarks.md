# Auto Bookmarks - Technical Design

## Overview
The auto-bookmark feature will automatically track video progress on supported sites (initially just YouTube) without requiring manual activation. This builds on the existing manual bookmark infrastructure while simplifying the user experience for those who want to track all their video progress.

## Architecture Changes

### Storage Layer
1. **Settings Schema Extension**
   ```typescript
   interface StorageSettings {
     autoTrack: boolean;      // Whether auto-bookmarking is enabled
     cleanupDays: number;     // Existing cleanup setting
   }
   ```

### Background Script
1. **State Management**
   - Add `autoTrackEnabled` flag to background state
   - Load setting during initialization
   - Handle setting changes from popup

2. **Video Detection**
   - Modify `handleVideoDetected` to automatically start tracking if:
     - Auto-track is enabled
     - Video is on a supported site (YouTube)
     - Video is not already being tracked

3. **Site Support**
   - Add `SupportedSite` enum/type for future extensibility
   - Initially just support YouTube
   - Add helper functions to check if a URL is supported

### Content Script
1. **Video Controls**
   - Remove manual bookmark button when auto-track is enabled
   - Add visual indicator that video is being auto-tracked
   - Keep timestamp display for user feedback

2. **Event Monitoring**
   - No changes needed - reuse existing monitoring logic
   - Auto-tracked videos use same timestamp update mechanism

### Popup UI
1. **Settings Section**
   - Add toggle switch for auto-tracking
   - Add help text explaining the feature
   - Save setting changes to storage

2. **Bookmark List**
   - Add indicator for auto-tracked videos
   - Keep existing bookmark management features

## Implementation Details

### Settings Management
```typescript
// Types
interface AutoTrackSettings {
  enabled: boolean;
  supportedSites: SupportedSite[];
}

enum SupportedSite {
  YOUTUBE = 'youtube'
}

// Storage operations
async function getAutoTrackSettings(): Promise<AutoTrackSettings>;
async function setAutoTrackSettings(settings: AutoTrackSettings): Promise<void>;
```

### Background Script Changes
```typescript
class BackgroundManager {
  private async initializeAutoTrack(): Promise<void> {
    const settings = await getAutoTrackSettings();
    this.state.autoTrackEnabled = settings.enabled;
  }

  private handleVideoDetected(message: VideoDetectedMessage): void {
    // Existing video detection logic...

    // Auto-track handling
    if (
      this.state.autoTrackEnabled &&
      this.isSupportedSite(message.url) &&
      !this.state.activeVideos.has(message.tabId)
    ) {
      this.startTracking(message);
    }
  }

  private isSupportedSite(url: string): boolean {
    // Initially just YouTube
    return url.includes('youtube.com/watch') || url.includes('youtu.be/');
  }
}
```

### Content Script Changes
```typescript
class VideoControls {
  private async initialize(): Promise<void> {
    const settings = await getAutoTrackSettings();
    
    if (settings.enabled) {
      this.setupAutoTrackUI();
    } else {
      this.setupManualTrackUI();
    }
  }

  private setupAutoTrackUI(): void {
    // Add auto-track indicator
    // Show timestamp display
    // No bookmark toggle button
  }
}
```

### Popup UI Changes
```typescript
// React component for settings
const AutoTrackSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Load initial settings
    loadSettings();
  }, []);

  const handleToggle = async () => {
    await setAutoTrackSettings({ enabled: !enabled });
    setEnabled(!enabled);
  };

  return (
    <div className="settings-section">
      <h2>Auto-Tracking</h2>
      <div className="setting-item">
        <Switch
          checked={enabled}
          onChange={handleToggle}
          aria-label="Enable auto-tracking"
        />
        <span>Automatically track progress on YouTube videos</span>
      </div>
    </div>
  );
};
```

## Migration Plan
1. Add storage schema changes
2. Implement settings UI in popup
3. Modify background script for auto-tracking
4. Update content script UI handling
5. Add migration code for existing bookmarks

## Testing Strategy
1. **Settings Management**
   - Verify settings persistence
   - Test toggle behavior
   - Check default state

2. **Auto-Tracking**
   - Verify automatic activation on YouTube
   - Test timestamp tracking accuracy
   - Check state preservation across page reloads

3. **UI Feedback**
   - Verify appropriate UI shown based on mode
   - Test timestamp display updates
   - Check auto-track indicators

4. **Edge Cases**
   - Test behavior when switching between auto/manual modes
   - Verify handling of unsupported sites
   - Check migration of existing bookmarks

## Future Considerations
1. **Site Support**
   - Framework for adding new supported sites
   - Site-specific settings (e.g., enable per site)
   - Custom tracking rules per site

2. **Performance**
   - Monitor storage usage with auto-tracking
   - Implement aggressive cleanup for auto-tracked videos
   - Add bulk operations for better performance

3. **User Experience**
   - Add statistics for auto-tracked videos
   - Provide filtering/sorting by tracking mode
   - Consider watch history export feature 