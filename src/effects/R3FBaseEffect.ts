import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef, useState, useEffect } from 'react';

export interface R3FEffectParameter {
  name: string;
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean | string;
  options?: string[];
}

export interface R3FEffectMetadata {
  name: string;
  description: string;
  parameters: R3FEffectParameter[];
}

export interface R3FEffectProps {
  bpm?: number;
  parameters?: Record<string, number | boolean | string>;
  onParameterChange?: (name: string, value: number | boolean | string) => void;
}

export abstract class R3FBaseEffect {
  protected params: Record<string, number | boolean | string> = {};
  protected bpm: number = 120;
  protected time: number = 0;

  constructor() {
    // Initialize parameters with default values
    const metadata = this.getMetadata();
    metadata.parameters.forEach(param => {
      this.params[param.name] = param.default;
    });
  }

  abstract getMetadata(): R3FEffectMetadata;

  setParameter(name: string, value: number | boolean | string): void {
    const metadata = this.getMetadata();
    const param = metadata.parameters.find(p => p.name === name);
    if (!param) return;

    // Validate and clamp number values
    if (param.type === 'number' && typeof value === 'number') {
      const min = param.min ?? 0;
      const max = param.max ?? 1;
      value = Math.max(min, Math.min(max, value));
    }

    // Validate select values
    if (param.type === 'select' && typeof value === 'string') {
      if (!param.options?.includes(value)) return;
    }

    this.params[name] = value;
  }

  getParameter(name: string): number | boolean | string | undefined {
    return this.params[name];
  }

  setBPM(bpm: number): void {
    this.bpm = bpm;
  }

  updateTime(deltaTime: number): void {
    this.time += deltaTime;
  }

  // Helper method to get BPM-based timing
  getBPMTime(): number {
    const beatsPerSecond = this.bpm / 60;
    return this.time * beatsPerSecond;
  }

  // Helper method to get pulse value based on BPM
  getPulse(speed: number = 1): number {
    const bpmTime = this.getBPMTime();
    return Math.sin(bpmTime * Math.PI * 2 * speed) * 0.5 + 0.5;
  }

  // Helper method to get hue value that cycles with BPM
  getHue(speed: number = 1): number {
    const bpmTime = this.getBPMTime();
    return (bpmTime * speed * 360) % 360;
  }
}

// React Hook for R3F Effects
export function useR3FEffect<T extends R3FBaseEffect>(
  EffectClass: new () => T,
  props: R3FEffectProps = {}
): T {
  const effectRef = useRef<T>();
  const [effect] = useState(() => new EffectClass());

  // Update BPM
  useEffect(() => {
    if (props.bpm) {
      effect.setBPM(props.bpm);
    }
  }, [props.bpm, effect]);

  // Update parameters
  useEffect(() => {
    if (props.parameters) {
      Object.entries(props.parameters).forEach(([name, value]) => {
        effect.setParameter(name, value);
      });
    }
  }, [props.parameters, effect]);

  // Animation frame
  useFrame((state, deltaTime) => {
    effect.updateTime(deltaTime);
  });

  effectRef.current = effect;
  return effect;
} 