export async function preloadInterFonts(): Promise<void> {
  try {
    // Construct proper font URLs that work in both dev and production
    const getFontUrl = async (filename: string): Promise<string> => {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
      
      // In Electron production, fonts are unpacked from asar
      // They're at app.asar.unpacked/dist/fonts/ relative to resourcesPath
      if (isElectron) {
        try {
          const electron = (window as any).electron;
          const fsApi = (window as any).fsApi;
          
          if (electron?.getResourcesPath && fsApi?.join && fsApi?.exists) {
            const resourcesPath = await electron.getResourcesPath();
            if (resourcesPath) {
              // In production: fonts are at resourcesPath/app.asar.unpacked/dist/fonts/
              // In dev: fonts are at resourcesPath/dist/fonts/ (or relative to HTML)
              let fontPath: string;
              
              // Check if we're in a packaged app (has app.asar.unpacked)
              const unpackedPath = fsApi.join(resourcesPath, 'app.asar.unpacked', 'dist', 'fonts', filename);
              if (fsApi.exists(unpackedPath)) {
                fontPath = unpackedPath;
              } else {
                // Fallback: try without app.asar.unpacked (dev or different structure)
                fontPath = fsApi.join(resourcesPath, 'dist', 'fonts', filename);
              }
              
              // Convert to file:// URL with proper path separators
              const normalizedPath = fontPath.replace(/\\/g, '/');
              // Ensure it starts with / for Windows paths like C:/
              const fileUrl = normalizedPath.match(/^[A-Z]:/) 
                ? `file:///${normalizedPath}` 
                : `file://${normalizedPath}`;
              return fileUrl;
            }
          }
        } catch (error) {
          console.warn('Failed to get resources path for fonts:', error);
        }
      }
      
      // Fallback: use relative URL construction
      try {
        const baseUrl = window.location.href;
        const base = new URL(baseUrl);
        // Remove the filename if present (e.g., index.html)
        if (base.pathname && base.pathname !== '/') {
          const pathParts = base.pathname.split('/').filter(p => p);
          if (pathParts.length > 0 && pathParts[pathParts.length - 1].includes('.')) {
            pathParts.pop(); // Remove filename
          }
          base.pathname = pathParts.length > 0 ? '/' + pathParts.join('/') + '/' : '/';
        }
        const fontUrl = new URL(`fonts/${filename}`, base);
        return fontUrl.href;
      } catch {
        // Final fallback: relative path
        return `./fonts/${filename}`;
      }
    };
    
    const sources: Array<{ weight: number; style: 'normal' | 'italic'; filename: string }> = [
      { weight: 400, style: 'normal', filename: 'Inter_18pt-Regular.ttf' },
      { weight: 400, style: 'italic', filename: 'Inter_18pt-Italic.ttf' },
      { weight: 500, style: 'normal', filename: 'Inter_18pt-Medium.ttf' },
      { weight: 600, style: 'normal', filename: 'Inter_18pt-SemiBold.ttf' },
      { weight: 700, style: 'normal', filename: 'Inter_18pt-Bold.ttf' },
    ];

    const tasks = sources.map(async ({ weight, style, filename }) => {
      try {
        const fontUrl = await getFontUrl(filename);
        const ff = new FontFace('Inter', `url(${fontUrl})`, { weight: String(weight), style });
        const loaded = await ff.load();
        (document as any).fonts && (document as any).fonts.add(loaded);
      } catch (error) {
        // Log error for debugging but don't throw
        console.warn(`Failed to load font ${filename}:`, error);
      }
    });

    await Promise.all(tasks);
  } catch {}
}


