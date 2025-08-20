export type WebcamConstraints = {
	deviceId?: string;
	width?: number;
	height?: number;
	fps?: number;
};

type WebcamEntry = {
	stream: MediaStream | null;
	video: HTMLVideoElement | null;
	texture: any | null; // THREE.VideoTexture, typed as any to avoid importing three here
	refCount: number;
	stopTimeout: number | null;
};

class WebcamManagerImpl {
	private entries: Map<string, WebcamEntry> = new Map();
	private keepAliveMs = 10000; // keep stream alive for quick column switches

	private makeKey(constraints: WebcamConstraints): string {
		const id = constraints.deviceId || '';
		const w = constraints.width || 1280;
		const h = constraints.height || 720;
		const f = constraints.fps || 30;
		return `${id}|${w}|${h}|${f}`;
	}

	async retain(constraints: WebcamConstraints): Promise<WebcamEntry> {
		const key = this.makeKey(constraints);
		let entry = this.entries.get(key);
		if (entry) {
			entry.refCount += 1;
			// cancel any pending stop
			if (entry.stopTimeout != null) {
				clearTimeout(entry.stopTimeout);
				entry.stopTimeout = null;
			}
			return entry;
		}

		entry = { stream: null, video: null, texture: null, refCount: 1, stopTimeout: null };
		this.entries.set(key, entry);

		const mediaConstraints: MediaStreamConstraints = {
			video: {
				deviceId: constraints.deviceId ? { exact: constraints.deviceId } : undefined,
				width: { ideal: constraints.width || 1280 },
				height: { ideal: constraints.height || 720 },
				frameRate: { ideal: constraints.fps || 30 },
			},
			audio: false,
		};

		const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
		entry.stream = stream;

		const video = document.createElement('video');
		video.autoplay = true;
		video.muted = true;
		try { video.setAttribute('muted', ''); } catch {}
		video.playsInline = true;
		video.srcObject = stream;
		entry.video = video;

		await new Promise<void>((resolve) => {
			const onLoaded = () => resolve();
			video.addEventListener('loadedmetadata', onLoaded, { once: true });
		});
		try { await video.play(); } catch {}

		// Create THREE.VideoTexture lazily in WebcamSource where THREE is available
		return entry;
	}

	release(constraints: WebcamConstraints) {
		const key = this.makeKey(constraints);
		const entry = this.entries.get(key);
		if (!entry) return;
		entry.refCount = Math.max(0, entry.refCount - 1);
		if (entry.refCount > 0) return;
		// schedule stop to avoid flicker on quick switches
		if (entry.stopTimeout != null) clearTimeout(entry.stopTimeout);
		entry.stopTimeout = window.setTimeout(() => {
			try {
				if (entry.stream) {
					entry.stream.getTracks().forEach((t) => t.stop());
				}
			} catch {}
			try {
				if (entry.video) {
					entry.video.srcObject = null;
				}
			} catch {}
			entry.stream = null;
			entry.video = null;
			entry.texture = null;
			this.entries.delete(key);
		}, this.keepAliveMs);
	}

	getVideo(constraints: WebcamConstraints): HTMLVideoElement | null {
		const key = this.makeKey(constraints);
		return this.entries.get(key)?.video || null;
	}

	setTexture(constraints: WebcamConstraints, texture: any) {
		const key = this.makeKey(constraints);
		const entry = this.entries.get(key);
		if (entry) entry.texture = texture;
	}

	getTexture(constraints: WebcamConstraints): any | null {
		const key = this.makeKey(constraints);
		return this.entries.get(key)?.texture || null;
	}
}

let _webcamManager: WebcamManagerImpl | null = null;
export function getWebcamManager(): WebcamManagerImpl {
	if (!_webcamManager) _webcamManager = new WebcamManagerImpl();
	return _webcamManager;
}


