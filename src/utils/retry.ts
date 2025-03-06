/**
 * Configuration for retry operations
 */
export interface RetryConfig {
  maxAttempts: number;      // Maximum number of retry attempts
  initialDelay: number;     // Initial delay in milliseconds
  maxDelay: number;         // Maximum delay in milliseconds
  backoffFactor: number;    // Factor to multiply delay by after each attempt
  timeout?: number;         // Optional timeout for the entire operation
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,   // Start with 1 second
  maxDelay: 10000,      // Max 10 seconds
  backoffFactor: 2,     // Double the delay each time
};

/**
 * Error class for retry operations
 */
export class RetryError extends Error {
  constructor(
    public readonly operation: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(`Failed to ${operation} after ${attempts} attempts. Last error: ${lastError.message}`);
    this.name = 'RetryError';
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate delay for next retry attempt with exponential backoff
 */
const calculateDelay = (attempt: number, config: RetryConfig): number => {
  const delay = config.initialDelay * Math.pow(config.backoffFactor, attempt);
  return Math.min(delay, config.maxDelay);
};

/**
 * Execute an operation with retry logic and exponential backoff
 * @param operation Name of the operation (for error reporting)
 * @param fn Function to retry
 * @param config Retry configuration
 * @returns Result of the operation
 * @throws RetryError if all attempts fail
 */
export async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let attempt = 0;

  // Create timeout promise if timeout is specified
  const timeoutPromise = fullConfig.timeout
    ? new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation '${operation}' timed out after ${fullConfig.timeout}ms`));
        }, fullConfig.timeout);
      })
    : null;

  while (attempt < fullConfig.maxAttempts) {
    try {
      // If timeout is specified, race against timeout promise
      const result = await (timeoutPromise
        ? Promise.race([fn(), timeoutPromise])
        : fn());
      return result as T;
    } catch (error) {
      lastError = error as Error;
      attempt++;

      // If this was the last attempt, don't wait
      if (attempt === fullConfig.maxAttempts) {
        break;
      }

      // Calculate and apply backoff delay
      const delay = calculateDelay(attempt - 1, fullConfig);
      await sleep(delay);
    }
  }

  throw new RetryError(
    operation,
    attempt,
    lastError || new Error('Unknown error')
  );
}

/**
 * Decorator for adding retry logic to class methods
 * @param config Retry configuration
 */
export function retry(config: Partial<RetryConfig> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      return withRetry(
        propertyKey,
        () => originalMethod.apply(this, args),
        config
      );
    };

    return descriptor;
  };
} 