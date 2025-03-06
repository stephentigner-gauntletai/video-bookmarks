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

  useEffect(() => {
    loadBookmarks();
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
      // Send initiate delete message
      chrome.runtime.sendMessage({
        type: BackgroundMessageType.INITIATE_DELETE,
        videoId: id,
        tabId: -1
      });

      // Start countdown
      setDeletingBookmarks(prev => ({ ...prev, [id]: 5 }));

      // Update countdown every second
      const countdownInterval = setInterval(() => {
        setDeletingBookmarks(prev => {
          const timeLeft = prev[id] - 1;
          if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            handleConfirmDelete(id);
            const { [id]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [id]: timeLeft };
        });
      }, 1000);

      // Set final deletion timer
      setTimeout(() => {
        clearInterval(countdownInterval);
      }, 5000);
    } catch (error) {
      console.error('Error initiating delete:', error);
      setError('Failed to delete bookmark');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleUndoDelete = async (id: string) => {
    try {
      // Send undo delete message
      chrome.runtime.sendMessage({
        type: BackgroundMessageType.UNDO_DELETE,
        videoId: id,
        tabId: -1
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

  const handleConfirmDelete = async (id: string) => {
    try {
      // Send confirm delete message
      chrome.runtime.sendMessage({
        type: BackgroundMessageType.CONFIRM_DELETE,
        videoId: id,
        tabId: -1
      });

      // Remove from list
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (error) {
      console.error('Error confirming delete:', error);
      setError('Failed to delete bookmark');
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