import React, { useEffect, useState } from 'react';
import { storageManager } from '../../storage';
import { SupportedSite } from '../../storage/types';
import './SettingsSection.css';

export const SettingsSection: React.FC = () => {
  const [autoTrackEnabled, setAutoTrackEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await storageManager.getAutoTrackSettings();
      setAutoTrackEnabled(settings.enabled);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    try {
      setError(null);
      await storageManager.setAutoTrackSettings({
        enabled: !autoTrackEnabled,
        supportedSites: [SupportedSite.YOUTUBE]
      });
      setAutoTrackEnabled(!autoTrackEnabled);
      
      // Notify background script of the change
      chrome.runtime.sendMessage({
        type: 'AUTO_TRACK_CHANGED',
        enabled: !autoTrackEnabled
      });
    } catch (err) {
      setError('Failed to update settings');
      console.error('Error updating settings:', err);
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading settings...</div>;
  }

  return (
    <div className="settings-section">
      <div className="settings-header">
        <h2>Auto-Tracking</h2>
        {error && <div className="settings-error">{error}</div>}
      </div>
      <div className="setting-item">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={autoTrackEnabled}
            onChange={handleToggle}
            disabled={loading}
          />
          <span className="toggle-slider"></span>
        </label>
        <div className="setting-content">
          <span className="setting-label">Automatically track video progress</span>
          <p className="setting-description">
            When enabled, your video progress will be automatically tracked on YouTube.
            You can still manage your bookmarks and delete them at any time.
          </p>
        </div>
      </div>
    </div>
  );
}; 