# Manual Bookmarks - Technical Design

## Overview
The manual bookmarks feature will allow users to track their progress in online videos, specifically focusing on YouTube for the MVP. The extension will store both the last known timestamp and the furthest watched timestamp for each bookmarked video.

## Architecture

### Components

1. **Content Script**
   - Injects into YouTube pages
   - Detects video player presence
   - Monitors video playback events
   - Communicates with the background script
   - Adds UI elements for bookmark controls

2. **Background Script**
   - Manages persistent storage
   - Handles bookmark CRUD operations
   - Coordinates between content script and storage

3. **Storage**
   - Uses Chrome's `chrome.storage.local` for data persistence
   - Stores bookmarks in the following format:
     ```typescript
     interface VideoBookmark {
       id: string;           // Unique identifier (e.g., YouTube video ID)
       url: string;          // Full video URL
       title: string;        // Video title
       lastTimestamp: number;// Last known position in seconds
       maxTimestamp: number; // Furthest watched position in seconds
       createdAt: number;    // Timestamp of bookmark creation
       updatedAt: number;    // Timestamp of last update
     }
     ```

4. **Popup UI**
   - Lists all bookmarked videos
   - Provides quick access to bookmarks
   - Allows bookmark management (delete, edit)

## Implementation Details

### Content Script
1. **Video Detection**
   - Use MutationObserver to detect when video player is added to the page
   - Extract video metadata (ID, title, URL)

2. **Event Monitoring**
   - Listen for video events:
     - `timeupdate`: Update current timestamp
     - `seeking`: Handle manual seeking
     - `pause`: Save current position
     - `ended`: Mark video as completed

3. **UI Integration**
   - Add bookmark button near video controls
   - Show current bookmark status
   - Display timestamp information

### Background Script
1. **Message Handling**
   - Listen for messages from content script
   - Process bookmark operations
   - Manage storage operations

2. **Storage Operations**
   - Save new bookmarks
   - Update existing bookmarks
   - Delete bookmarks
   - Query bookmarks

### Popup Interface
1. **Bookmark List**
   - Display video thumbnails
   - Show title and timestamps
   - Provide quick actions (resume, delete)

2. **Search/Filter**
   - Allow searching by title
   - Filter by date added

## User Flow

1. User visits a YouTube video
2. Extension detects video and adds bookmark button
3. User clicks bookmark button to start tracking
4. Extension begins monitoring video progress
5. Progress is saved:
   - Periodically during playback
   - When video is paused
   - When tab is closed
6. User can access bookmarks via extension popup
7. Clicking a bookmark takes user back to video at last position

## Error Handling

1. **Network Issues**
   - Cache last known state
   - Retry failed storage operations
   - Show sync status in UI

2. **Player Detection**
   - Retry detection if initial attempt fails
   - Handle dynamic page updates

3. **Invalid States**
   - Validate timestamps
   - Handle missing metadata
   - Recover from storage corruption

## Testing Strategy

1. **Unit Tests**
   - Storage operations
   - Timestamp calculations
   - Data validation

2. **Integration Tests**
   - Video player interaction
   - Storage synchronization
   - UI updates

3. **Manual Testing**
   - Different video lengths
   - Network conditions
   - Page navigation scenarios

## Future Considerations

1. **Performance**
   - Optimize storage operations
   - Minimize DOM operations
   - Handle large bookmark collections

2. **Extensibility**
   - Design for adding new video platforms
   - Support for different video player implementations
   - Plugin system for site-specific handling

3. **User Experience**
   - Keyboard shortcuts
   - Custom timestamp annotations
   - Export/import functionality 