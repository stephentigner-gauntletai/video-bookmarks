import { BackgroundManager } from './manager';

// Initialize background manager
const backgroundManager = BackgroundManager.getInstance();
backgroundManager.initialize().catch((error) => {
  console.error('Failed to initialize background manager:', error);
});

console.log('background is running')

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'COUNT') {
    console.log('background has received a message from popup, and count is ', request?.count)
  }
})
