import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function initGLTFLoaderGlobal(): void {
  try {
    const w: any = window as any;
    if (!w.GLTFLoader) {
      w.GLTFLoader = GLTFLoader as any;
    }
  } catch (e) {
    try { console.warn('initGLTFLoaderGlobal failed:', e); } catch {}
  }
}


