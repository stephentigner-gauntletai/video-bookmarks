import React from 'react';
import { BookmarkList } from './components/BookmarkList';
import { SettingsSection } from './components/SettingsSection';

import './Popup.css'

export const Popup: React.FC = () => {
  return (
    <div className="popup">
      <header className="popup-header">
        <h1>Video Bookmarks</h1>
      </header>
      <main className="popup-content">
        <SettingsSection />
        <BookmarkList />
      </main>
    </div>
  );
};

export default Popup
