import React, { useEffect, useState } from 'react';
import { VideoBookmark } from '../../storage/types';
import { storageManager } from '../../storage';

interface BookmarkItemProps {
  bookmark: VideoBookmark;
  onDelete: (id: string) => void;
}

const BookmarkItem: React.FC<BookmarkItemProps> = ({ bookmark, onDelete }) => {
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
    onDelete(bookmark.id);
  };

  return (
    <div 
      className="bookmark-item"
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

  const handleDelete = async (id: string) => {
    try {
      await storageManager.deleteBookmark(id);
      setBookmarks(bookmarks.filter(b => b.id !== id));
    } catch (error) {
      console.error('Error deleting bookmark:', error);
      // Show error in UI
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
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}; 