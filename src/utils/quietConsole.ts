const shouldMuteConsole = (() => {
  try {
    if (typeof window === 'undefined') return false;
    return (window.localStorage?.getItem('vj-debug-logs') || '').toLowerCase() !== 'true';
  } catch {
    return true;
  }
})();

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
}

export {}; // ensure this module is treated as a module

