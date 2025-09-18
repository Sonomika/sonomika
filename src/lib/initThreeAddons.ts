import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function initThreeAddonsGlobal(): void {
  try {
    const w: any = window as any;
    if (!w.ConvexGeometry) w.ConvexGeometry = ConvexGeometry as any;
    if (!w.BufferGeometryUtils) w.BufferGeometryUtils = BufferGeometryUtils as any;
  } catch (e) {
    try { console.warn('initThreeAddonsGlobal failed:', e); } catch {}
  }
}


