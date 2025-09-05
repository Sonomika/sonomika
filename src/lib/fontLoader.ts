export async function preloadInterFonts(): Promise<void> {
  try {
    const sources: Array<{ weight: number; style: 'normal' | 'italic'; file: string }> = [
      { weight: 400, style: 'normal', file: '../assets/fonts/Inter_18pt-Regular.ttf' },
      { weight: 400, style: 'italic', file: '../assets/fonts/Inter_18pt-Italic.ttf' },
      { weight: 500, style: 'normal', file: '../assets/fonts/Inter_18pt-Medium.ttf' },
      { weight: 600, style: 'normal', file: '../assets/fonts/Inter_18pt-SemiBold.ttf' },
      { weight: 700, style: 'normal', file: '../assets/fonts/Inter_18pt-Bold.ttf' },
    ];

    const tasks = sources.map(async ({ weight, style, file }) => {
      try {
        const url = new URL(file, import.meta.url).toString();
        const ff = new FontFace('Inter', `url(${url})`, { weight: String(weight), style });
        const loaded = await ff.load();
        (document as any).fonts && (document as any).fonts.add(loaded);
      } catch {}
    });

    await Promise.all(tasks);
  } catch {}
}


