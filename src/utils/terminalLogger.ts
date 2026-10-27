/**
 * Terminal Logger Utility
 * Sends logs from browser to Vite dev server so they appear directly in the terminal!
 * Also keeps standard browser console logs.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'success';

export function logToTerminal(level: LogLevel, tag: string, message: string, data?: any) {
  // 1. Log to browser console
  const consoleFn =
    level === 'error'
      ? console.error
      : level === 'warn'
      ? console.warn
      : console.log;

  if (data !== undefined) {
    consoleFn(`[${tag}] ${message}`, data);
  } else {
    consoleFn(`[${tag}] ${message}`);
  }

  // 2. Format serializable payload for terminal
  let serializedData = data;
  if (data instanceof Error) {
    serializedData = {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  } else if (typeof data === 'object' && data !== null) {
    try {
      // Test JSON serializability
      JSON.stringify(data);
    } catch {
      serializedData = String(data);
    }
  }

  // 3. Send to Vite backend middleware
  try {
    fetch('/api/terminal-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        level,
        tag,
        message,
        data: serializedData,
      }),
    }).catch(() => {
      // Dev server may not be running or endpoint unavailable
    });
  } catch {
    // Ignore fetch failures
  }
}

/**
 * Automatically hook into window unhandled errors and rejections
 */
export function initGlobalTerminalLogging() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    logToTerminal('error', 'WINDOW_ERROR', event.message || 'Unknown window error', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || event.error?.message,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logToTerminal('error', 'PROMISE_REJECTION', event.reason?.message || String(event.reason), {
      reason: event.reason instanceof Error ? { message: event.reason.message, stack: event.reason.stack } : event.reason,
    });
  });

  logToTerminal('info', 'TERMINAL_LOGGER', '⚡ Terminal logger initialized successfully in browser');
}
