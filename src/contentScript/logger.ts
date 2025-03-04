/**
 * Log levels for the content script logger
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
  prefix: string;
}

/**
 * Default configuration for the logger
 */
const DEFAULT_CONFIG: LoggerConfig = {
  enabled: true,
  minLevel: LogLevel.INFO,
  prefix: '[Video Bookmarks]'
};

/**
 * Logger class for content script debugging
 */
class Logger {
  private static instance: Logger;
  private config: LoggerConfig;

  private constructor(config: LoggerConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Update logger configuration
   */
  public configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a log level should be displayed
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    
    const levels = Object.values(LogLevel);
    const configLevelIndex = levels.indexOf(this.config.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    
    return currentLevelIndex >= configLevelIndex;
  }

  /**
   * Format a log message
   */
  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    return `${this.config.prefix} [${timestamp}] [${level}] ${message}`;
  }

  /**
   * Log a debug message
   */
  public debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message), data || '');
    }
  }

  /**
   * Log an info message
   */
  public info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(LogLevel.INFO, message), data || '');
    }
  }

  /**
   * Log a warning message
   */
  public warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message), data || '');
    }
  }

  /**
   * Log an error message
   */
  public error(message: string, error?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message), error || '');
    }
  }

  /**
   * Create a group of related logs
   */
  public group(name: string, fn: () => void): void {
    if (this.config.enabled) {
      console.group(this.formatMessage(LogLevel.INFO, name));
      fn();
      console.groupEnd();
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance(); 