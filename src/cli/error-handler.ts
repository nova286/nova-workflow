import { ui } from './ui';

export function withErrorHandling(fn: (...args: any[]) => Promise<void>) {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err: any) {
      ui.error(err.message || 'Unknown error');
      if (process.env.DEBUG) console.error(err);
      process.exit(1);
    }
  };
}
