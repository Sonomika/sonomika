const shouldMuteConsole = (() => {
  try {
    if (typeof window === 'undefined') return false;
    return (window.localStorage?.getItem('vj-debug-logs') || '').toLowerCase() !== 'true';
  } catch {
    return true;
  }
})();

// Suppress performance violation warnings from React scheduler
const suppressViolationWarnings = () => {
  if (typeof window === 'undefined') return;
  
  try {
    // Store original console methods
    const originalLog = console.log.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);
    
    // Filter function to suppress violation messages
    const shouldSuppress = (args: any[]): boolean => {
      if (!args || args.length === 0) return false;
      const firstArg = args[0];
      if (typeof firstArg === 'string') {
        return firstArg.includes('[Violation]') || 
               firstArg.includes("'message' handler took");
      }
      // Check all string arguments
      return args.some(arg => typeof arg === 'string' && 
        (arg.includes('[Violation]') || arg.includes("'message' handler took")));
    };
    
    // Override console methods to filter violations
    console.log = (...args: any[]) => {
      if (!shouldSuppress(args)) {
        originalLog(...args);
      }
    };
    
    console.warn = (...args: any[]) => {
      if (!shouldSuppress(args)) {
        originalWarn(...args);
      }
    };
    
    console.error = (...args: any[]) => {
      if (!shouldSuppress(args)) {
        originalError(...args);
      }
    };
    
    // Also intercept console messages via the PerformanceObserver if available
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          // Silently observe but don't log violations
          list.getEntries().forEach((entry) => {
            // This just prevents the observer from triggering console logs
            // The actual violation messages come from Chrome's internal monitoring
          });
        });
        observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
      } catch {
        // PerformanceObserver might not support all entry types
      }
    }
  } catch {
    // Ignore failures - this is a non-critical feature
  }
};

if (shouldMuteConsole) {
  const noop = () => {};
  try {
    // eslint-disable-next-line no-console
    console.log = noop as any;
    // eslint-disable-next-line no-console
    console.warn = noop as any;
    // eslint-disable-next-line no-console
    console.info = noop as any;
  } catch {
    // ignore failures to reassign console methods
  }
} else {
  // Even in debug mode, suppress violation warnings as they're noisy
  suppressViolationWarnings();
}

export {}; // ensure this module is treated as a module

