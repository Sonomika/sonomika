// Lazy loader for ml5.js that ensures a TensorFlow.js backend is initialized.
// Keeps ml5 out of the main bundle and avoids loading when unused.

let ml5Promise: Promise<any> | null = null;

async function ensureTfBackend(): Promise<void> {
	// Prefer WebGL if available; fall back to CPU
	try {
		const tf = await import('@tensorflow/tfjs');
		// Try WebGL first
		try {
			await import('@tensorflow/tfjs-backend-webgl');
			await tf.setBackend('webgl');
			await tf.ready();
			return;
		} catch {}
		// Fallback to CPU
		await import('@tensorflow/tfjs-backend-cpu');
		await tf.setBackend('cpu');
		await tf.ready();
	} catch {
		// If tf import fails, allow ml5 to attempt its own setup
	}
}

export async function loadMl5(): Promise<any> {
	if (!ml5Promise) {
		ml5Promise = (async () => {
			await ensureTfBackend();
			const mod = await import('ml5');
			return (mod as any).default ?? mod;
		})();
	}
	return ml5Promise;
}

export default loadMl5;


