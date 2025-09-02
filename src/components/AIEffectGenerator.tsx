import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Button, Input, Select, Slider } from './ui';
import { useStore } from '../store/store';
import { OpenAIService, GeneratedEffectCode } from '../services/OpenAIService';
import { EffectFileManager } from '../utils/EffectFileManager';

interface AIEffectGeneratorProps {
  onClose?: () => void;
}

type GeneratedEffect = GeneratedEffectCode;

const EffectPreview: React.FC<{
  effect: GeneratedEffect | null;
  isPlaying: boolean;
  bpm: number;
  testVideo?: HTMLVideoElement;
}> = ({ effect, isPlaying, bpm, testVideo }) => {
  const { size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [error, setError] = useState<string | null>(null);

  const fallbackTexture = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  }, []);

  const videoTexture = useMemo(() => {
    if (!testVideo) return null;
    const texture = new THREE.VideoTexture(testVideo);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.generateMipmaps = false;
    return texture;
  }, [testVideo]);

  const extractShader = useMemo(() => {
    return (code: string | undefined, kind: 'vertex' | 'fragment'): string | null => {
      if (!code) return null;
      const patterns = [
        new RegExp(`${kind}Shader:\\s*` + '`' + `([\\s\\S]*?)` + '`'),
        new RegExp(`const\\s+${kind}Shader\\s*=\\s*` + '`' + `([\\s\\S]*?)` + '`'),
        new RegExp(`let\\s+${kind}Shader\\s*=\\s*` + '`' + `([\\s\\S]*?)` + '`'),
      ];
      for (const rx of patterns) {
        const m = code.match(rx);
        if (m && m[1]) return m[1];
      }
      return null;
    };
  }, []);

  const material = useMemo(() => {
    if (!effect) return null;
    try {
      setError(null);

      let vertexShader = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;

      let fragmentShader = `
        varying vec2 vUv;
        uniform sampler2D inputBuffer;
        uniform vec2 resolution;
        uniform float uTime;
        uniform float uBpm;
        uniform float uOpacity;
        void main() {
          vec2 uv = vUv;
          vec4 color = texture2D(inputBuffer, uv);
          float time = uTime * 0.001;
          float pulse = sin(time * uBpm * 0.1) * 0.5 + 0.5;
          color.rgb *= pulse;
          color.a *= uOpacity;
          gl_FragColor = color;
        }
      `;

      const customFrag = extractShader(effect.code, 'fragment');
      const customVert = extractShader(effect.code, 'vertex');
      if (customFrag) fragmentShader = customFrag;
      if (customVert) vertexShader = customVert;

      const isSourceFallback = !customFrag && !testVideo;
      if (isSourceFallback) {
        fragmentShader = `
          varying vec2 vUv;
          uniform vec2 resolution;
          uniform float uTime;
          uniform float uOpacity;
          float circle(vec2 uv, vec2 p, float r) {
            float d = length(uv - p);
            return smoothstep(r, r-0.01, d);
          }
          void main() {
            vec2 uv = vUv;
            float t = uTime * 0.001;
            vec2 p1 = 0.5 + 0.4 * vec2(sin(t*1.2), cos(t*0.9));
            vec2 p2 = 0.5 + 0.35 * vec2(sin(t*0.8+2.0), cos(t*1.1+1.0));
            vec2 p3 = 0.5 + 0.3 * vec2(sin(t*1.6+4.0), cos(t*0.7+3.0));
            vec3 col = vec3(0.0);
            col += vec3(1.0,0.5,0.2) * circle(uv, p1, 0.08);
            col += vec3(0.2,1.0,0.6) * circle(uv, p2, 0.07);
            col += vec3(0.3,0.6,1.0) * circle(uv, p3, 0.06);
            col = 1.0 - exp(-col * 1.8);
            gl_FragColor = vec4(col, uOpacity);
          }
        `;
      }

      const uniforms: Record<string, any> = {
        inputBuffer: { value: videoTexture || fallbackTexture },
        resolution: { value: new THREE.Vector2(size.width, size.height) },
        uTime: { value: 0 },
        uBpm: { value: bpm },
        uOpacity: { value: 1.0 },
      };

      effect.parameters.forEach(param => {
        uniforms[param.name] = { value: param.value };
      });

      const shaderMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      return shaderMaterial;
    } catch (err) {
      setError(`Shader compilation error: ${err}`);
      return null;
    }
  }, [effect, videoTexture, fallbackTexture, size.width, size.height, bpm, extractShader]);

  useFrame((state) => {
    if (!isPlaying) return;
    if (materialRef.current && materialRef.current.uniforms) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * 1000;
      materialRef.current.uniforms.uBpm.value = bpm;
      materialRef.current.uniforms.resolution.value.set(size.width, size.height);
      if (videoTexture) materialRef.current.uniforms.inputBuffer.value = videoTexture;
    }
  });

  useEffect(() => {
    return () => {
      try { materialRef.current?.dispose?.(); } catch {}
    };
  }, []);

  if (error || !effect || !material) {
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
};

const TestVideo: React.FC<{ onVideoReady: (video: HTMLVideoElement) => void }> = ({ onVideoReady }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    let raf: number | null = null;
    if (ctx) {
      const draw = () => {
        const time = Date.now() * 0.001;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < 5; i++) {
          const x = canvas.width / 2 + Math.sin(time + i) * 100;
          const y = canvas.height / 2 + Math.cos(time + i) * 50;
          const r = 20 + Math.sin(time * 2 + i) * 10;
          ctx.fillStyle = `hsl(${(time * 50 + i * 72) % 360}, 70%, 50%)`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        try {
          const url = canvas.toDataURL('image/webp');
          if (video.src !== url) video.src = url;
        } catch {}
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    const onLoaded = () => onVideoReady(video);
    video.addEventListener('loadeddata', onLoaded);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      video.removeEventListener('loadeddata', onLoaded);
    };
  }, [onVideoReady]);
  return <video ref={videoRef} className="tw-hidden" muted loop autoPlay playsInline />;
};

const AIEffectGenerator: React.FC<AIEffectGeneratorProps> = ({ onClose }) => {
  const { bpm } = useStore() as any;
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEffect, setGeneratedEffect] = useState<GeneratedEffect | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [testVideo, setTestVideo] = useState<HTMLVideoElement | null>(null);
  const [categoryUI, setCategoryUI] = useState<'visual-effects' | 'sources'>('visual-effects');
  const [effectParameters, setEffectParameters] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  // Reference state (single reference only)
  const [effectOptions, setEffectOptions] = useState<Array<{ path: string; label: string }>>([]);
  const [sourceOptions, setSourceOptions] = useState<Array<{ path: string; label: string }>>([]);
  const [selectedRef, setSelectedRef] = useState<string>('');
  const [refText, setRefText] = useState<string>('');

  const openaiService = useMemo(() => OpenAIService.getInstance(), []);
  const fileManager = useMemo(() => EffectFileManager.getInstance(), []);
  const [showDebug, setShowDebug] = useState(false);
  const [debugText, setDebugText] = useState<string>('');

  useEffect(() => {
    const checkApiKey = async () => {
      const key = await openaiService.loadApiKey();
      setHasApiKey(!!key);
    };
    checkApiKey();
  }, [openaiService]);

  // Build file pickers via Vite glob once
  useEffect(() => {
    try {
      const veMods: Record<string, () => Promise<string>> = (import.meta as any).glob('../effects/visual-effects/**/*.tsx', { query: '?raw', import: 'default' });
      const soMods: Record<string, () => Promise<string>> = (import.meta as any).glob('../effects/sources/**/*.tsx', { query: '?raw', import: 'default' });
      const toOpts = (mods: Record<string, any>) => Object.keys(mods)
        .sort()
        .map((k) => ({ path: k, label: k.replace('../', '') }));
      setEffectOptions([{ path: '', label: 'Select...' }, ...toOpts(veMods)]);
      setSourceOptions([{ path: '', label: 'Select...' }, ...toOpts(soMods)]);
    } catch {}
  }, []);

  const stripForPrompt = (src: string): string => {
    try {
      const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
      const noLine = noBlock.replace(/(^|\s)\/\/.*$/gm, '');
      return noLine.replace(/\n{3,}/g, '\n\n').slice(0, 40 * 1024);
    } catch { return src.slice(0, 40 * 1024); }
  };

  const loadReference = async (kind: 'effect' | 'source', path: string) => {
    try {
      if (!path) { setRefText(''); return; }
      const veMods: Record<string, () => Promise<string>> = (import.meta as any).glob('../effects/visual-effects/**/*.tsx', { query: '?raw', import: 'default' });
      const soMods: Record<string, () => Promise<string>> = (import.meta as any).glob('../effects/sources/**/*.tsx', { query: '?raw', import: 'default' });
      const mods = (kind === 'effect') ? veMods : soMods;
      const loader = mods[path];
      if (!loader) return;
      const raw = await loader();
      setRefText(stripForPrompt(raw));
    } catch {}
  };

  const generateEffect = async () => {
    if (!prompt.trim()) { setError('Please enter a description for your effect'); return; }
    if (!hasApiKey) { setError('OpenAI API key not configured. Please set it up in Settings.'); return; }
    setIsGenerating(true);
    setError(null);
    try {
      const category = categoryUI;
      const referenceBlocks: Array<{ path: string; text: string }> = [];
      if (selectedRef && refText) referenceBlocks.push({ path: selectedRef.replace('../', ''), text: refText });
      // Strict: send only reference or nothing else
      const eff = await openaiService.generateEffect({ prompt: prompt.trim(), category, useRepoContext: false, referenceBlocks });
      try {
        const snap = (openaiService as any).getLastRequestPayload?.();
        const raw = (openaiService as any).getLastResponseRaw?.();
        const merged = { request: snap || null, response_raw: raw || null };
        setDebugText(JSON.stringify(merged, null, 2));
      } catch {}
      setGeneratedEffect(eff);
      const initialParams: Record<string, any> = {};
      eff.parameters.forEach(p => { initialParams[p.name] = p.value; });
      setEffectParameters(initialParams);
    } catch (err) {
      setError(`Failed to generate effect: ${err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveEffect = async () => {
    if (!generatedEffect) return;
    try {
      const validation = fileManager.validateEffectCode(generatedEffect.code);
      if (!validation.isValid) { setError(`Effect validation failed: ${validation.errors.join(', ')}`); return; }
      const fileInfo = await fileManager.saveEffect(generatedEffect);
      alert(`Effect saved successfully as "${fileInfo.name}"! It will appear in the Effects Browser after restart.`);
      setGeneratedEffect(null);
      setEffectParameters({});
    } catch (err) {
      setError(`Failed to save effect: ${err}`);
    }
  };

  const updateParameter = (name: string, value: any) => {
    setEffectParameters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-bg-neutral-900 tw-text-neutral-100">
      <div className="tw-flex tw-items-center tw-justify-between tw-p-4 tw-border-b tw-border-neutral-800">
        <h2 className="tw-text-lg tw-font-semibold">AI Effect Generator</h2>
        <div className="tw-flex tw-items-center tw-gap-2">
          <Button onClick={() => setIsPlaying(!isPlaying)} className="tw-bg-neutral-800 hover:tw-bg-neutral-700">{isPlaying ? 'Pause' : 'Play'}</Button>
          {onClose && <Button onClick={onClose} className="tw-bg-neutral-800 hover:tw-bg-neutral-700">Close</Button>}
        </div>
      </div>
      <div className="tw-flex-1 tw-flex tw-overflow-hidden">
        <div className="tw-w-1/3 tw-border-r tw-border-neutral-800 tw-flex tw-flex-col tw-p-4 tw-gap-4">
          <div>
            <label className="tw-block tw-text-sm tw-font-medium tw-mb-2">Effect or Source</label>
            <Select value={categoryUI} onChange={async (v: string) => { setCategoryUI((v as any) as ('visual-effects'|'sources')); setSelectedRef(''); setRefText(''); }} options={[{ value: 'visual-effects', label: 'Effect' }, { value: 'sources', label: 'Source' }]} />
          </div>
          <div>
            <label className="tw-block tw-text-sm tw-font-medium tw-mb-2">Reference</label>
            <Select value={selectedRef} onChange={async (v: string) => { setSelectedRef(v); await loadReference(categoryUI === 'visual-effects' ? 'effect' : 'source', v); }} options={(categoryUI === 'visual-effects' ? effectOptions : sourceOptions).map(o => ({ value: o.path, label: o.label }))} />
          </div>
          <div>
            <label className="tw-block tw-text-sm tw-font-medium tw-mb-2">Prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the effect you want to create..." className="tw-w-full tw-h-24 tw-rounded tw-bg-neutral-800 tw-border tw-border-neutral-700 tw-text-neutral-100 tw-px-3 tw-py-2 tw-resize-none" />
          </div>
          {!hasApiKey && <div className="tw-text-yellow-400 tw-text-sm tw-bg-yellow-900/20 tw-p-2 tw-rounded">OpenAI API key not configured. Please set it up in Settings to generate effects.</div>}
          {error && <div className="tw-text-red-400 tw-text-sm tw-bg-red-900/20 tw-p-2 tw-rounded">{error}</div>}
          <Button onClick={generateEffect} disabled={isGenerating || !prompt.trim() || !hasApiKey} className="tw-w-full tw-bg-purple-600 hover:tw-bg-purple-700">{isGenerating ? 'Generating...' : 'Generate'}</Button>
          <button className="tw-text-xs tw-text-neutral-400 tw-underline tw-text-left" onClick={() => setShowDebug((v) => !v)}>Show generation log</button>
          {showDebug && (
            <div className="tw-text-[11px] tw-font-mono tw-bg-neutral-950 tw-border tw-border-neutral-800 tw-rounded tw-p-2 tw-max-h-56 tw-overflow-auto">
              <pre className="tw-whitespace-pre-wrap tw-text-neutral-300">{debugText || 'No log yet. Generate to see payload.'}</pre>
            </div>
          )}
          <div className="tw-border-t tw-border-neutral-800 tw-my-1" />
          <div className="tw-space-y-3">
            <div className="tw-text-sm tw-font-medium">Parameters</div>
            {generatedEffect ? (
              generatedEffect.parameters.map((param) => (
                <div key={param.name} className="tw-space-y-2">
                  <label className="tw-block tw-text-sm">{param.name}</label>
                  {param.type === 'number' ? (
                    <div className="tw-space-y-1">
                      <Slider value={[effectParameters[param.name] || param.value]} min={param.min || 0} max={param.max || 1} step={param.step || 0.01} onValueChange={(vals) => vals && vals.length > 0 && updateParameter(param.name, vals[0])} />
                      <div className="tw-text-xs tw-text-neutral-400">{effectParameters[param.name] || param.value}</div>
                    </div>
                  ) : (
                    <Input type={param.type} value={effectParameters[param.name] || param.value} onChange={(e) => updateParameter(param.name, e.target.value)} className="tw-bg-neutral-800 tw-border-neutral-700" />
                  )}
                </div>
              ))
            ) : (
              <div className="tw-text-xs tw-text-neutral-400">Generate an effect to see parameters</div>
            )}
          </div>
          {generatedEffect && (
            <div className="tw-mt-2 tw-space-y-2">
              <div className="tw-text-xs tw-text-neutral-400">{generatedEffect.description}</div>
              <Button onClick={saveEffect} className="tw-w-full tw-bg-green-600 hover:tw-bg-green-700">Save Effect</Button>
            </div>
          )}
        </div>
        <div className="tw-flex-1 tw-flex tw-flex-col">
          <div className="tw-p-4 tw-border-b tw-border-neutral-800"><h3 className="tw-text-md tw-font-medium">Live Preview</h3></div>
          <div className="tw-flex-1 tw-relative">
            <TestVideo onVideoReady={setTestVideo} />
            <Canvas camera={{ position: [0, 0, 2], fov: 75 }} className="tw-w-full tw-h-full" dpr={[1, 1]} gl={{ preserveDrawingBuffer: true, antialias: false }}>
              <EffectPreview effect={generatedEffect} isPlaying={isPlaying} bpm={bpm} testVideo={testVideo || undefined} />
            </Canvas>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIEffectGenerator;

export { AIEffectGenerator };


