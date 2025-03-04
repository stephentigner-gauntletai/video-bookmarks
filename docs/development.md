# Video Bookmarks Development Guide

## Setup Instructions

### Prerequisites
- Node.js >= 14.18.0
- npm (comes with Node.js)
- Chrome browser

### Initial Setup
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd video-bookmarks
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup your development environment:
   - Install recommended VS Code extensions:
     - ESLint
     - Prettier
     - TypeScript and JavaScript Language Features

## Build Commands

### Development
```bash
# Start development server with hot reload
npm run dev
```

### Production Build
```bash
# Create production build
npm run build

# Create production build and package as zip
npm run zip
```

### Code Formatting
```bash
# Format all files
npm run fmt
```

### Preview Build
```bash
# Preview production build locally
npm run preview
```

## Development Workflow

### 1. Loading the Extension
1. Build the extension:
   ```bash
   npm run dev
   ```
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `build` directory

### 2. Development Process
1. **Making Changes**
   - Content Script changes: Edit files in `src/contentScript/`
   - Background Script changes: Edit files in `src/background/`
   - Popup UI changes: Edit files in `src/popup/`
   - Options page changes: Edit files in `src/options/`

2. **Testing Changes**
   - Content script and UI changes will hot reload automatically
   - For background script changes:
     1. Go to `chrome://extensions`
     2. Find "Video Bookmarks"
     3. Click the refresh icon

3. **Debugging**
   - Content Script: Use browser DevTools on the page
   - Background Script: Click "inspect" on `chrome://extensions`
   - Popup/Options: Right-click extension icon → Inspect popup

### 3. Project Structure
```
src/
├── assets/         # Static assets (images, etc.)
├── background/     # Background service worker
├── contentScript/  # Content scripts injected into pages
├── popup/         # Extension popup UI
├── options/       # Extension options page
├── sidepanel/     # Side panel UI
└── manifest.ts    # Extension manifest configuration
```

### 4. Best Practices
1. **Code Style**
   - Follow TypeScript best practices
   - Use ESLint and Prettier for consistency
   - Write meaningful commit messages

2. **Testing**
   - Test on different types of YouTube pages
   - Verify functionality in both development and production builds
   - Test with various video states (playing, paused, ended)

3. **Performance**
   - Minimize content script operations
   - Use event delegation where appropriate
   - Implement proper cleanup in content scripts

### 5. Common Issues and Solutions
1. **Extension not updating**
   - Hard refresh the page (Ctrl+Shift+R)
   - Reload the extension from `chrome://extensions`

2. **Content script not injecting**
   - Verify manifest permissions
   - Check console for errors
   - Ensure URL patterns match

3. **Storage issues**
   - Check quota limits
   - Verify permissions in manifest
   - Check for storage errors in console

### 6. Release Process
1. Update version in `package.json`
2. Run tests and verify functionality
3. Create production build: `npm run build`
4. Create zip package: `npm run zip`
5. Test the production build
6. Submit to Chrome Web Store 