import React from 'react';
import { BookmarkList } from './components/BookmarkList';
import { NotificationProvider } from '../components/NotificationManager';
import './Popup.css';

export const Popup: React.FC = () => {
  return (
    <NotificationProvider>
      <div className="popup">
        <header className="popup-header">
          <h1>Video Bookmarks</h1>
        </header>
        <main className="popup-content">
          <BookmarkList />
        </main>
      </div>
    </NotificationProvider>
  );
};

export default Popup;
