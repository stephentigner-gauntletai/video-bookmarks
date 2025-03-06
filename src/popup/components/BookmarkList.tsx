import React, { useEffect, useState } from 'react';
import { VideoBookmark } from '../../storage/types';
import { storageManager } from '../../storage';
import { BackgroundMessageType } from '../../background/types';

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

  const handleClick = () => {
    chrome.tabs.create({ url: bookmark.url });
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
  
  // Add refs to track timers
  const timerRefs = React.useRef<Record<string, { interval: number; timeout: number }>>({});

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
          break;

        case BackgroundMessageType.UNDO_DELETE:
          // Remove from deleting state when deletion is undone
          setDeletingBookmarks(prev => {
            const { [message.videoId]: _, ...rest } = prev;
            return rest;
          });
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
  }, []);

  const loadBookmarks = async () => {
    try {
      setLoading(true);
      setError(null);
      const allBookmarks = await storageManager.getAllBookmarks();
      setBookmarks(allBookmarks.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (error) {
      setError('Failed to load bookmarks');
      console.error('Error loading bookmarks:', error);
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
      setError('Failed to delete bookmark');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleUndoDelete = async (id: string) => {
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
      setError('Failed to undo deletion');
      setTimeout(() => setError(null), 3000);
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
    <div className="bookmark-list">
      {bookmarks.map(bookmark => (
        <BookmarkItem
          key={bookmark.id}
          bookmark={bookmark}
          onInitiateDelete={handleInitiateDelete}
          onUndoDelete={handleUndoDelete}
          isDeleting={bookmark.id in deletingBookmarks}
          timeLeft={deletingBookmarks[bookmark.id] || 0}
        />
      ))}
    </div>
  );
}; 