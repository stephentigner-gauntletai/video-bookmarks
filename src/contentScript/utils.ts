/**
 * Regular expression to match YouTube video URLs and extract video ID
 * Matches both youtube.com/watch?v= and youtu.be/ formats
 */
const YOUTUBE_VIDEO_ID_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/;

/**
 * Check if the current page is a YouTube video page
 */
export function isYouTubeVideoPage(): boolean {
  return YOUTUBE_VIDEO_ID_REGEX.test(window.location.href);
}

/**
 * Check if a URL is from a supported site
 */
export function isSupportedSite(url: string): boolean {
  // Currently only supporting YouTube
  return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

/**
 * Extract video ID from YouTube URL
 * @returns video ID or null if not found
 */
export function extractVideoId(url: string = window.location.href): string | null {
  const match = url.match(YOUTUBE_VIDEO_ID_REGEX);
  return match ? match[1] : null;
}

/**
 * Check if the page has finished initial load
 */
export function isPageLoaded(): boolean {
  return document.readyState === 'complete';
}

/**
 * Wait for the page to finish loading
 */
export function waitForPageLoad(): Promise<void> {
  return new Promise((resolve) => {
    if (isPageLoaded()) {
      resolve();
    } else {
      window.addEventListener('load', () => resolve(), { once: true });
    }
  });
}

/**
 * Create a debounced version of a function
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), wait);
  };
} 