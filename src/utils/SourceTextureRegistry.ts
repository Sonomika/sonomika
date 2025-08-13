import * as THREE from 'three';

class SourceTextureRegistry {
	private static instance: SourceTextureRegistry;
	private effectIdToTexture: Map<string, THREE.VideoTexture> = new Map();

	static getInstance(): SourceTextureRegistry {
		if (!SourceTextureRegistry.instance) {
			SourceTextureRegistry.instance = new SourceTextureRegistry();
		}
		return SourceTextureRegistry.instance;
	}

	setTexture(effectId: string, texture: THREE.VideoTexture) {
		this.effectIdToTexture.set(effectId, texture);
	}

	getTexture(effectId: string): THREE.VideoTexture | undefined {
		return this.effectIdToTexture.get(effectId);
	}

	removeTexture(effectId: string) {
		this.effectIdToTexture.delete(effectId);
	}
}

export const sourceTextureRegistry = SourceTextureRegistry.getInstance();


