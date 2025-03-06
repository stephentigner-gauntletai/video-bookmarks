import React, { useEffect, useState } from 'react';
import { VideoBookmark } from '../../storage/types';
import { storageManager } from '../../storage';
import { BackgroundMessageType } from '../../background/types';
import { useErrorNotification, useSuccessNotification, useWarningNotification } from '../../components/NotificationManager';

interface BookmarkItemProps {
  bookmark: VideoBookmark;
  onInitiateDelete: (id: string) => void;
  onUndoDelete: (id: string) => void;
  isDeleting: boolean;
  timeLeft: number;
}

const BookmarkItem: React.FC<BookmarkItemProps> = ({ 
  bookmark, 
  onInitiateDelete, 
  onUndoDelete,
  isDeleting,
  timeLeft
}) => {
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getUrlWithTimestamp = (timestamp: number): string => {
    // Parse the base URL
    const url = new URL(bookmark.url);
    // Set the timestamp parameter
    url.searchParams.set('t', Math.floor(timestamp).toString());
    return url.toString();
  };

  const handleClick = (e: React.MouseEvent) => {
    // Use maxTimestamp if shift is held, otherwise use lastTimestamp
    const timestamp = e.shiftKey ? bookmark.maxTimestamp : bookmark.lastTimestamp;
    chrome.tabs.create({ url: getUrlWithTimestamp(timestamp) });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInitiateDelete(bookmark.id);
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUndoDelete(bookmark.id);
  };

  return (
    <div 
      className={`bookmark-item ${isDeleting ? 'deleting' : ''}`}
      onClick={handleClick}
      title={`Click to open at ${formatTime(bookmark.lastTimestamp)}\nShift+Click to open at ${formatTime(bookmark.maxTimestamp)}`}
    >
      <div className="bookmark-content">
        <h3 className="bookmark-title">{bookmark.title}</h3>
        <div className="bookmark-author">{bookmark.author}</div>
        <div className="bookmark-info">
          <span className="bookmark-time">
            {formatTime(bookmark.lastTimestamp)} / {formatTime(bookmark.maxTimestamp)}
          </span>
          <span className="bookmark-date">
            {new Date(bookmark.updatedAt).toLocaleDateString()}
          </span>
        </div>
        {isDeleting && (
          <div className="bookmark-undo">
            Bookmark will be removed. 
            <button onClick={handleUndo}>UNDO</button>
            <span>({timeLeft}s)</span>
          </div>
        )}
      </div>
      <button 
        className="bookmark-delete"
        onClick={handleDelete}
        title="Delete bookmark"
      >
        ×
      </button>
    </div>
  );
};

export const BookmarkList: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<VideoBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingBookmarks, setDeletingBookmarks] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'author'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Add refs to track timers
  const timerRefs = React.useRef<Record<string, { interval: number; timeout: number }>>({});
  const showError = useErrorNotification();
  const showSuccess = useSuccessNotification();
  const showWarning = useWarningNotification();

  // Filter and sort bookmarks
  const filteredBookmarks = React.useMemo(() => {
    let filtered = bookmarks;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(bookmark => 
        bookmark.title.toLowerCase().includes(query) ||
        bookmark.author.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = a.updatedAt - b.updatedAt;
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'author':
          comparison = a.author.localeCompare(b.author);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [bookmarks, searchQuery, sortBy, sortOrder]);

  // Save sort preferences
  React.useEffect(() => {
    chrome.storage.local.set({
      bookmarkSortPreferences: { sortBy, sortOrder }
    });
  }, [sortBy, sortOrder]);

  // Load sort preferences
  React.useEffect(() => {
    chrome.storage.local.get('bookmarkSortPreferences').then((result) => {
      if (result.bookmarkSortPreferences) {
        setSortBy(result.bookmarkSortPreferences.sortBy);
        setSortOrder(result.bookmarkSortPreferences.sortOrder);
      }
    });
  }, []);

  useEffect(() => {
    loadBookmarks();
    // Setup message listener for bookmark updates
    const messageListener = (message: any) => {
      if (!message.type) return;

      switch (message.type) {
        case BackgroundMessageType.CONFIRM_DELETE:
          // Remove the bookmark from the list when deletion is confirmed
          setBookmarks(prev => prev.filter(b => b.id !== message.videoId));
          setDeletingBookmarks(prev => {
            const { [message.videoId]: _, ...rest } = prev;
            return rest;
          });
          showSuccess('Bookmark deleted successfully');
          break;

        case BackgroundMessageType.UNDO_DELETE:
          // Remove from deleting state when deletion is undone
          setDeletingBookmarks(prev => {
            const { [message.videoId]: _, ...rest } = prev;
            return rest;
          });
          showSuccess('Bookmark deletion cancelled');
          break;
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup timers and listener on unmount
    return () => {
      Object.values(timerRefs.current).forEach(({ interval, timeout }) => {
        clearInterval(interval);
        clearTimeout(timeout);
      });
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [showSuccess]);

  const loadBookmarks = async () => {
    try {
      setLoading(true);
      setError(null);
      const allBookmarks = await storageManager.getAllBookmarks();
      setBookmarks(allBookmarks.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load bookmarks';
      setError(message);
      showError(message, loadBookmarks);  // Pass loadBookmarks as retry action
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateDelete = async (id: string) => {
    try {
      // Clear any existing timers for this ID
      if (timerRefs.current[id]) {
        clearInterval(timerRefs.current[id].interval);
        clearTimeout(timerRefs.current[id].timeout);
      }

      // Start countdown in UI
      setDeletingBookmarks(prev => ({ ...prev, [id]: 5 }));

      // Send initiate delete message to background
      chrome.runtime.sendMessage({
        type: BackgroundMessageType.INITIATE_DELETE,
        videoId: id
      });

      // Show warning notification with undo option
      showWarning('Bookmark will be deleted in 5 seconds', [
        {
          label: 'Undo',
          onClick: () => handleUndo(id)
        }
      ]);

      // Update countdown every second
      const countdownInterval = setInterval(() => {
        setDeletingBookmarks(prev => {
          const timeLeft = prev[id] - 1;
          return timeLeft <= 0 ? 
            // Let background handle actual deletion
            { ...prev, [id]: 0 } : 
            { ...prev, [id]: timeLeft };
        });
      }, 1000);

      // Set final deletion timer
      const deletionTimeout = setTimeout(() => {
        clearInterval(countdownInterval);
        // Send confirm delete message to background
        chrome.runtime.sendMessage({
          type: BackgroundMessageType.CONFIRM_DELETE,
          videoId: id
        });
      }, 5000);

      // Store timer references
      timerRefs.current[id] = {
        interval: countdownInterval as unknown as number,
        timeout: deletionTimeout as unknown as number
      };
    } catch (error) {
      console.error('Error initiating delete:', error);
      showError('Failed to delete bookmark');
    }
  };

  const handleUndo = async (id: string) => {
    try {
      // Clear timers
      if (timerRefs.current[id]) {
        clearInterval(timerRefs.current[id].interval);
        clearTimeout(timerRefs.current[id].timeout);
        delete timerRefs.current[id];
      }

      // Send undo delete message to background
      chrome.runtime.sendMessage({
        type: BackgroundMessageType.UNDO_DELETE,
        videoId: id
      });

      // Remove from deleting state
      setDeletingBookmarks(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    } catch (error) {
      console.error('Error undoing delete:', error);
      showError('Failed to undo deletion');
    }
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSortChange = (newSortBy: 'date' | 'title' | 'author') => {
    if (newSortBy === sortBy) {
      // Toggle order if clicking same sort field
      setSortOrder(current => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc'); // Default to descending for new sort field
    }
  };

  if (loading) {
    return <div className="loading">Loading bookmarks...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (bookmarks.length === 0) {
    return (
      <div className="empty-state">
        No bookmarks yet. Click the bookmark button in a video to start tracking.
      </div>
    );
  }

  return (
    <div className="bookmark-list-container">
      <div className="bookmark-help">
        Click to open video at last viewed position.
        Hold Shift and click to open at furthest viewed position.
      </div>
      <div className="bookmark-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search bookmarks..."
          value={searchQuery}
          onChange={handleSearchChange}
        />
        <div className="sort-controls">
          <button
            className={`sort-button ${sortBy === 'date' ? 'active' : ''}`}
            onClick={() => handleSortChange('date')}
            title={`Sort by date ${sortBy === 'date' ? (sortOrder === 'desc' ? '(newest first)' : '(oldest first)') : ''}`}
          >
            Date {sortBy === 'date' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
          <button
            className={`sort-button ${sortBy === 'title' ? 'active' : ''}`}
            onClick={() => handleSortChange('title')}
            title={`Sort by title ${sortBy === 'title' ? (sortOrder === 'desc' ? '(Z to A)' : '(A to Z)') : ''}`}
          >
            Title {sortBy === 'title' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
          <button
            className={`sort-button ${sortBy === 'author' ? 'active' : ''}`}
            onClick={() => handleSortChange('author')}
            title={`Sort by author ${sortBy === 'author' ? (sortOrder === 'desc' ? '(Z to A)' : '(A to Z)') : ''}`}
          >
            Author {sortBy === 'author' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
        </div>
      </div>

      <div className="bookmark-list">
        {filteredBookmarks.map(bookmark => (
          <BookmarkItem
            key={bookmark.id}
            bookmark={bookmark}
            onInitiateDelete={handleInitiateDelete}
            onUndoDelete={handleUndo}
            isDeleting={bookmark.id in deletingBookmarks}
            timeLeft={deletingBookmarks[bookmark.id] || 0}
          />
        ))}
      </div>

      {filteredBookmarks.length === 0 && searchQuery && (
        <div className="no-results">
          No bookmarks found matching "{searchQuery}"
        </div>
      )}
    </div>
  );
}; 