// Lazy loader for ml5.js that ensures a TensorFlow.js backend is initialized.
// Keeps ml5 out of the main bundle and avoids loading when unused.
// TensorFlow.js is loaded from CDN via script tags in index.html

let ml5Promise: Promise<any> | null = null;

async function ensureTfBackend(): Promise<void> {
	// Wait for TensorFlow.js to be available from CDN
	const waitForTf = (): Promise<any> => {
		return new Promise((resolve, reject) => {
			if (typeof window !== 'undefined' && (window as any).tf) {
				resolve((window as any).tf);
				return;
			}
			// Poll for tf to be available (loaded from CDN)
			let attempts = 0;
			const checkInterval = setInterval(() => {
				attempts++;
				if (typeof window !== 'undefined' && (window as any).tf) {
					clearInterval(checkInterval);
					resolve((window as any).tf);
				} else if (attempts > 50) { // 5 seconds max wait
					clearInterval(checkInterval);
					reject(new Error('TensorFlow.js failed to load from CDN'));
				}
			}, 100);
		});
	};

	// Prefer WebGL if available; fall back to CPU
	try {
		const tf = await waitForTf();
		// Suppress TensorFlow.js duplicate registration warnings
		// These are harmless but noisy when ml5.js also loads TensorFlow.js
		if (tf.env && typeof tf.env.set === 'function') {
			try {
				tf.env.set('IS_BROWSER', true);
			} catch {}
		}
		// Try WebGL first
		try {
			await tf.setBackend('webgl');
			await tf.ready();
			return;
		} catch {}
		// Fallback to CPU
		await tf.setBackend('cpu');
		await tf.ready();
	} catch {
		// If tf load fails, allow ml5 to attempt its own setup
	}
}

export async function loadMl5(): Promise<any> {
	if (!ml5Promise) {
		ml5Promise = (async () => {
			await ensureTfBackend();
			// Wait for ml5 to be available from CDN
			const waitForMl5 = (): Promise<any> => {
				return new Promise((resolve, reject) => {
					if (typeof window !== 'undefined' && (window as any).ml5) {
						resolve((window as any).ml5);
						return;
					}
					// Poll for ml5 to be available (loaded from CDN)
					let attempts = 0;
					const checkInterval = setInterval(() => {
						attempts++;
						if (typeof window !== 'undefined' && (window as any).ml5) {
							clearInterval(checkInterval);
							resolve((window as any).ml5);
						} else if (attempts > 50) { // 5 seconds max wait
							clearInterval(checkInterval);
							reject(new Error('ml5.js failed to load from CDN'));
						}
					}, 100);
				});
			};
			return await waitForMl5();
		})();
	}
	return ml5Promise;
}

export default loadMl5;


