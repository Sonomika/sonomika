import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Label, Select, Textarea, Tabs, TabsList, TabsTrigger, TabsContent, ScrollArea, Separator, Switch, Button } from './ui';
import { useStore } from '../store/store';
import { AITemplateLoader } from '../utils/AITemplateLoader';
import { callAIAPI } from '../utils/AIApiCaller';
import { AITemplate } from '../types/aiTemplate';
import { trackFeature } from '../utils/analytics';

interface RefEffectOption {
  id: string;
  name: string;
  fileKey?: string;
  category?: string;
  isSource?: boolean;
}

const DEFAULT_PROMPT = `Make a new original effect based on this code`;

export const AIEffectsLab: React.FC = () => {
  const { scenes, currentSceneId, showTimeline, timelineScenes, currentTimelineSceneId, selectedLayerId } = useStore() as any;
  // Track current selected layer's effect id
  const activeScene = showTimeline
    ? (timelineScenes || []).find((s: any) => s.id === currentTimelineSceneId)
    : (scenes || []).find((s: any) => s.id === currentSceneId);
  const selectedLayer = React.useMemo(() => {
    if (!activeScene || !selectedLayerId) return null;
    try {
      for (const col of activeScene.columns || []) {
        for (const layer of (col.layers || [])) {
          if (layer?.id === selectedLayerId) return layer;
        }
      }
    } catch {}
    return null;
  }, [activeScene, selectedLayerId]);
  const selectedEffectId: string | null = React.useMemo(() => {
    try {
      const asset = (selectedLayer as any)?.asset || {};
      const id = asset.id || asset.name || null;
      return id ? String(id) : null;
    } catch { return null; }
  }, [selectedLayer]);
  // Reference effect selection removed; editor is now the single source of truth
  // AI provider settings now managed in Settings dialog
  const [selectedTemplate, setSelectedTemplate] = useState<AITemplate | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [thinking, setThinking] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [code, setCode] = useState<string>(() => {
    try { return localStorage.getItem('vj-ai-last-code') || ''; } catch { return ''; }
  });
  const [status, setStatus] = useState<string>('');
  const [isSource, setIsSource] = useState<boolean>(false);
  const lastLoadedForEffectRef = useRef<string | null>(null);
  const [addonSelection, setAddonSelection] = useState<string>('');
  const [draggingOverEditor, setDraggingOverEditor] = useState<boolean>(false);
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  const notifyLibraryRefresh = React.useCallback(() => {
    // EffectsBrowser refreshes its Library list on this event.
    try { window.dispatchEvent(new Event('vj-bundled-updated')); } catch {}
  }, []);

  // Editor interactions are minimal; controls live in effect parameters

  // Suggested prompt ideas
  const addonOptions = useMemo(() => (
    [
      { value: 'make-new-version', label: 'Make a new version based on this template' },
      { value: 'make-amazing-original', label: 'Make a new amazing and original version' },
    ]
  ), []);

  const addonTextFromValue = (val: string): string => {
    switch (val) {
      case 'make-new-version':
        return 'Make a new version based on this template';
      case 'make-amazing-original':
        return 'Make a new amazing and original version';
      default:
        return '';
    }
  };

  const btnClass = "tw-text-xs tw-rounded tw-border tw-px-2 tw-py-1 tw-bg-neutral-800 tw-text-neutral-200 tw-border-neutral-700 hover:tw-bg-neutral-700 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed";

  // Helper: load raw source for a given effect id and place it into the editor
  const loadSourceForEffectId = React.useCallback(async (effectId: string) => {
    if (!effectId) return false;
    try {
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      const list = await discovery.listAvailableEffectsFromFilesystem();
      let entry: any = list.find((e: any) => String(e.id) === effectId) || list.find((e: any) => (String(e.name || '').toLowerCase() === String(effectId).toLowerCase()));
      if (!entry) {
        try {
          const all = discovery.getAllEffects?.() || [];
          const hit = all.find((e: any) => String(e.id) === effectId);
          if (hit) {
            entry = {
              id: hit.id,
              name: hit.name,
              fileKey: hit.metadata?.sourcePath || hit.id,
              metadata: { folder: hit.metadata?.folder, isSource: !!hit.metadata?.isSource },
            };
          }
        } catch {}
      }
      if (!entry) return false;
      // reference selection removed
      const rawGlobs: Record<string, () => Promise<string>> = {
        ...(import.meta as any).glob('../../bank/**/*.{tsx,ts,js,jsx,mjs}', { as: 'raw', eager: false }),
        ...(import.meta as any).glob('../effects/**/*.{tsx,ts,js,jsx}', { as: 'raw', eager: false }),
        ...(import.meta as any).glob('/src/effects/**/*.{tsx,ts,js,jsx}', { as: 'raw', eager: false }),
      } as any;
      const fileKey: string = String(entry.fileKey || '');
      const baseName = fileKey.split('/').pop() || fileKey;
      let loader: (() => Promise<string>) | undefined;
      loader = Object.entries(rawGlobs).find(([p]) => p.endsWith(fileKey))?.[1] as any;
      if (!loader) loader = Object.entries(rawGlobs).find(([p]) => p.endsWith('/' + baseName))?.[1] as any;
      if (!loader) loader = Object.entries(rawGlobs).find(([p]) => p.toLowerCase().includes('/' + baseName.toLowerCase()))?.[1] as any;
      if (!loader && fileKey && fileKey.includes('/')) {
        const tail = fileKey.split('/').slice(-3).join('/');
        loader = Object.entries(rawGlobs).find(([p]) => p.endsWith(tail))?.[1] as any;
      }
      if (loader) {
        const raw = await loader();
        setCode(raw);
        lastLoadedForEffectRef.current = effectId;
        setStatus(`Loaded source for ${entry.name}`);
        return true;
      }
      // Electron fallback: if fileKey points to an external absolute path, read via preload bridge
      try {
        const electron = (window as any)?.electron;
        if (!loader && electron && typeof electron.readFileText === 'function' && fileKey && /[:\\/]/.test(fileKey)) {
          const content = await electron.readFileText(fileKey);
          if (typeof content === 'string' && content.length > 0) {
            setCode(content);
            lastLoadedForEffectRef.current = effectId;
            setStatus(`Loaded source from external path: ${baseName}`);
            return true;
          }
        }
      } catch {}
    } catch {}
    return false;
  }, []);

  // Reference list disabled

  // When the user selects a layer with an effect, auto-load its source into the editor
  useEffect(() => {
    (async () => {
      const effId = selectedEffectId || '';
      if (!effId) return;
      if (lastLoadedForEffectRef.current === effId) return;
      const ok = await loadSourceForEffectId(effId);
      if (!ok) {
        setStatus('User effects need to be loaded or dragged into the Editable Code window');
      }
    })();
  }, [selectedEffectId, loadSourceForEffectId]);

  // Load selected provider and settings from Settings dialog
  useEffect(() => {
    const loadProviderSettings = async () => {
      try {
        const loader = AITemplateLoader.getInstance();
        await loader.loadTemplates();
        
        const selectedProviderId = localStorage.getItem('vj-ai-selected-provider') || 'openai';
        const template = loader.getTemplate(selectedProviderId) || loader.getDefaultTemplate();
        
        if (template) {
          setSelectedTemplate(template);
          const storedKey = localStorage.getItem(template.apiKeyStorageKey) || '';
          const storedModel = localStorage.getItem(template.modelStorageKey) || template.defaultModel;
          setApiKey(storedKey);
          setModel(storedModel);
        }
      } catch (error) {
        console.error('Failed to load AI provider settings:', error);
      }
    };
    
    loadProviderSettings();
    
    // Listen for changes from Settings dialog
    const handleStorageChange = () => {
      loadProviderSettings();
    };
    
    window.addEventListener('storage', handleStorageChange);
    // Also poll periodically since storage event doesn't fire in same window
    const interval = setInterval(loadProviderSettings, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Reference dropdown removed
  // API key and model saving now handled in Settings dialog

  // Generate effect code with selected AI provider
  const handleGenerate = async () => {
    if (!selectedTemplate) { setStatus('No AI provider selected. Configure in Settings first.'); return; }
    if (!apiKey) { setStatus(`Configure your ${selectedTemplate.name} API key in Settings first`); return; }
    setThinking(true);
    setStatus('Generating with AI...');
    try {
      // Lightweight client via fetch to avoid SDK dependency; Electron only recommended
      const truncated = (code && code.trim()) ? (code.length > 50000 ? code.slice(0, 50000) + "\n/* …truncated… */" : code) : '';
      const combined = truncated
        ? `${String(prompt || '')}\n\nExample:\n\`\`\`js\n${truncated}\n\`\`\``
        : String(prompt || '');

      const text = await callAIAPI({
        template: selectedTemplate,
        apiKey,
        model,
        messages: [
          { role: 'user', content: combined }
        ],
      });

      // Extract only code if response includes fenced blocks; otherwise use raw
      const match = /```[a-zA-Z]*\n([\s\S]*?)```/m.exec(text);
      const cleaned = match ? match[1] : text.replace(/^```[a-zA-Z]*\n?|```$/g, '');
      setCode(cleaned);
      setStatus('Generated. Review and Load to test.');
    } catch (e: any) {
      setStatus(`Generation failed: ${e?.message || String(e)}`);
    } finally {
      setThinking(false);
    }
  };

  // Load current editor code as a new user effect (unique id)
  const handleLoadAsNewEffect = async () => {
    try {
      if (!code.trim()) { setStatus('No code to load'); return; }
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      // Only refresh the Library list if this load introduces a *new* id.
      const beforeIds = new Set<string>();
      try {
        for (const e of discovery.getUserEffects?.() || []) beforeIds.add(String((e as any)?.id || ''));
      } catch {}
      const effect = await discovery.loadUserEffectFromContent(code, `ai-generated-${Date.now()}.js`);
      if (effect) {
        try {
          localStorage.setItem('vj-ai-last-code', code);
          // Persist the generated effect code so presets referencing it can rehydrate on reload.
          localStorage.setItem(`vj-user-effect-code:${String(effect.id)}`, code);
        } catch {}
        setStatus(`Loaded user effect: ${effect.name}`);
        if (!beforeIds.has(String(effect.id))) notifyLibraryRefresh();
      } else {
        setStatus('Failed to load effect. Ensure it exports default component and metadata.');
      }
    } catch (e: any) {
      setStatus(`Load failed: ${e?.message || String(e)}`);
    }
  };

  // Load code with a stable id and apply it to the currently selected layer slot
  const handleApplyToSelectedSlot = async () => {
    try {
      if (!code.trim()) { setStatus('No code to load'); return; }
      if (!selectedLayerId) { setStatus('Select a layer slot first'); return; }
      const { EffectDiscovery } = await import('../utils/EffectDiscovery');
      const discovery = EffectDiscovery.getInstance();
      // Only refresh the Library list if this apply introduces a *new* id.
      const beforeIds = new Set<string>();
      try {
        for (const e of discovery.getUserEffects?.() || []) beforeIds.add(String((e as any)?.id || ''));
      } catch {}
      // Use a stable sourceName so repeated applies hot-replace the same effect id
      const effect = await discovery.loadUserEffectFromContent(code, 'ai-live-edit.js');
      if (!effect) { setStatus('Failed to load effect for apply'); return; }
      try {
        localStorage.setItem('vj-ai-last-code', code);
        // Persist code by effect id so it can be auto-loaded on app reload / preset load.
        localStorage.setItem(`vj-user-effect-code:${String(effect.id)}`, code);
        // Backwards-compatible cache for older presets that may reference the legacy id
        // derived from the stable source name `ai-live-edit.js`.
        localStorage.setItem('vj-user-effect-code:user-ai-live-edit', code);
      } catch {}
      // Update current layer to reference the user effect and use friendly name for cell
      try {
        const id = effect.id; // e.g., user-ai-live-edit
        (useStore.getState() as any).updateLayer(selectedLayerId, {
          type: 'effect',
          asset: { id, name: effect.name || id, type: 'effect', isEffect: true },
        });
        // reference selection removed
        lastLoadedForEffectRef.current = effect.id;
        setStatus(`Applied to selected slot: ${effect.name || id}`);
        if (!beforeIds.has(String(effect.id))) notifyLibraryRefresh();
      } catch (e) {
        setStatus('Loaded effect, but failed to apply to the selected slot');
      }
    } catch (e: any) {
      setStatus(`Apply failed: ${e?.message || String(e)}`);
    }
  };

  // Save current editor code via system dialog (Electron) or File System Access API (web)
  const handleSaveToFile = async () => {
    try {
      if (!code.trim()) { setStatus('Nothing to save'); return; }
      const pickName = (src: string) => {
        try {
          // Try metadata blocks: export const metadata = { name: '...' }
          const metaName = /metadata\s*=\s*\{[\s\S]*?name\s*:\s*['\"]([^'\"]+)['\"]/m.exec(src)?.[1]
            || /export\s+const\s+metadata\s*=\s*\{[\s\S]*?name\s*:\s*['\"]([^'\"]+)['\"]/m.exec(src)?.[1]
            || /\.metadata\s*=\s*\{[\s\S]*?name\s*:\s*['\"]([^'\"]+)['\"]/m.exec(src)?.[1];
          let name = metaName;
          if (!name) {
            // Try default export function/class identifier
            name = /export\s+default\s+function\s+([A-Za-z0-9_]+)/.exec(src)?.[1]
              || /export\s+default\s+class\s+([A-Za-z0-9_]+)/.exec(src)?.[1]
              || /export\s+default\s+([A-Za-z0-9_]+)/.exec(src)?.[1];
          }
          if (name) {
            // Convert to CamelCaps (PascalCase) to match bank format
            const camelCaps = String(name)
              .trim()
              .replace(/['"]/g, '')
              .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
              .split(/[\s_-]+/)
              .filter(Boolean)
              .map(part => part.charAt(0).toUpperCase() + part.slice(1))
              .join('');

            return `${camelCaps || 'Effect'}.js`;
          }
        } catch {}
        return `effect-${Date.now()}.js`;
      };
      const defaultName = pickName(code);
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.showSaveDialog;
      if (isElectron) {
        const result = await (window as any).electron.showSaveDialog({
          title: 'Save Effect',
          defaultPath: defaultName,
          filters: [{ name: 'JavaScript', extensions: ['js'] }],
        });
        if (result?.canceled || !result?.filePath) { setStatus('Save canceled'); return; }
        const ok = await (window as any).electron.saveFile(result.filePath, code);
        setStatus(ok ? `Saved: ${result.filePath}` : 'Failed to save file');
        return;
      }
      // Web fallback: File System Access API
      try {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({ suggestedName: defaultName, types: [{ description: 'JavaScript', accept: { 'application/javascript': ['.js'] } }] });
        const writable = await handle.createWritable();
        await writable.write(code);
        await writable.close();
        try { localStorage.setItem('vj-ai-last-code', code); } catch {}
        setStatus('Saved file');
      } catch (e) {
        setStatus('Save canceled or unsupported');
      }
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message || String(e)}`);
    }
  };

  // Fix Output: build exact prompt with dynamic insertion and working example
  const handleFixOutput = async () => {
    try {
      if (!code.trim()) { setStatus('Nothing to fix'); return; }
      if (!selectedTemplate) { setStatus('No AI provider selected. Configure in Settings first.'); return; }
      const hasApi = !!apiKey && apiKey.trim().length > 0;
      if (!hasApi) { setStatus(`Add ${selectedTemplate.name} API key in Settings to use Fix Output`); return; }
      setThinking(true);
      setStatus('Fixing with AI...');

      const workingExample = [
        '// sonomika template',
        'const React = globalThis.React;',
        'const THREE = globalThis.THREE;',
        'const r3f = globalThis.r3f;',
        'const { useRef, useMemo, useEffect } = React || {};',
        '',
        'export const metadata = {',
        "name: 'Chromatic Drift & Edge Dissolve',",
        "description: 'A feedback-based flowing drift with chromatic separation and edge-aware dissolve creates drifting colour ribbons that break on scene edits.',",
        "category: 'Effects',",
        "author: 'AI',",
        "version: '1.0.0',",
        'replacesVideo: true,',
        'canBeGlobal: true,',
        'parameters: [',
        "{ name: 'driftScale', type: 'number', value: 0.50, min: 0.0, max: 3.0, step: 0.01 },",
        "{ name: 'speed', type: 'number', value: 6.00, min: 0.0, max: 6.0, step: 0.01 },",
        "{ name: 'frequency', type: 'number', value: 4.59, min: 0.1, max: 8.0, step: 0.01 },",
        "{ name: 'chroma', type: 'number', value: 0.000, min: 0.0, max: 0.05, step: 0.0005 },",
        "{ name: 'edgeThreshold', type: 'number', value: 1.000, min: 0.0, max: 1.0, step: 0.005 },",
        "{ name: 'dissolve', type: 'number', value: 1.00, min: 0.0, max: 1.0, step: 0.01 },",
        "{ name: 'decay', type: 'number', value: 0.210, min: 0.0, max: 1.0, step: 0.005 },",
        "{ name: 'grain', type: 'number', value: 0.059, min: 0.0, max: 0.2, step: 0.001 },",
        "{ name: 'seed', type: 'number', value: 96.0, min: 0.0, max: 1000.0, step: 1.0 },",
        '],',
        '};',
        '',
        'export default function ChromaticDriftEdgeDissolve({',
        'videoTexture,',
        'isGlobal = false,',
        'driftScale = 0.50,',
        'speed = 6.00,',
        'frequency = 4.59,',
        'chroma = 0.000,',
        'edgeThreshold = 1.000,',
        'dissolve = 1.00,',
        'decay = 0.210,',
        'grain = 0.059,',
        'seed = 96.0,',
        'compositionWidth,',
        'compositionHeight,',
        '}) {',
        'if (!React || !THREE || !r3f) return null;',
        'const { useThree, useFrame } = r3f;',
        '',
        'const meshRef = useRef(null);',
        'const screenMatRef = useRef(null);',
        '',
        'let gl, scene, camera, size, clock;',
        'try {',
        'const ctx = useThree();',
        'if (ctx) {',
        'gl = ctx.gl;',
        'scene = ctx.scene;',
        'camera = ctx.camera;',
        'size = ctx.size;',
        'clock = ctx.clock;',
        '}',
        '} catch {}',
        '',
        'const effectiveW = Math.max(1, compositionWidth || (size && size.width) || 1920);',
        'const effectiveH = Math.max(1, compositionHeight || (size && size.height) || 1080);',
        '',
        'const captureRT = useMemo(() => {',
        'if (!isGlobal) return null;',
        'return new THREE.WebGLRenderTarget(effectiveW, effectiveH, {',
        'format: THREE.RGBAFormat,',
        'type: THREE.UnsignedByteType,',
        'minFilter: THREE.LinearFilter,',
        'magFilter: THREE.LinearFilter,',
        'depthBuffer: false,',
        'stencilBuffer: false,',
        '});',
        '}, [isGlobal, effectiveW, effectiveH]);',
        '',
        'const feedbackA = useMemo(() => new THREE.WebGLRenderTarget(effectiveW, effectiveH, {',
        'format: THREE.RGBAFormat,',
        'type: THREE.UnsignedByteType,',
        'minFilter: THREE.LinearFilter,',
        'magFilter: THREE.LinearFilter,',
        'depthBuffer: false,',
        'stencilBuffer: false,',
        '}), [effectiveW, effectiveH]);',
        '',
        'const feedbackB = useMemo(() => new THREE.WebGLRenderTarget(effectiveW, effectiveH, {',
        'format: THREE.RGBAFormat,',
        'type: THREE.UnsignedByteType,',
        'minFilter: THREE.LinearFilter,',
        'magFilter: THREE.LinearFilter,',
        'depthBuffer: false,',
        'stencilBuffer: false,',
        '}), [effectiveW, effectiveH]);',
        '',
        'useEffect(() => () => {',
        'try {',
        'captureRT && captureRT.dispose && captureRT.dispose();',
        'feedbackA && feedbackA.dispose && feedbackA.dispose();',
        'feedbackB && feedbackB.dispose && feedbackB.dispose();',
        '} catch {}',
        '}, [captureRT, feedbackA, feedbackB]);',
        '',
        'const pass = useMemo(() => {',
        'const fsScene = new THREE.Scene();',
        'const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);',
        'const fsGeom = new THREE.PlaneGeometry(2, 2);',
        '',
        '```',
        'const vertexShader = `',
        '  varying vec2 vUv;',
        '  void main() {',
        '    vUv = uv;',
        '    gl_Position = vec4(position.xy, 0.0, 1.0);',
        '  }',
        '`;',
        '',
        'const fragmentShader = `',
        '  precision highp float;',
        '  varying vec2 vUv;',
        '  uniform sampler2D tPrev;',
        '  uniform sampler2D tCurr;',
        '  uniform vec2 uResolution;',
        '  uniform float uDriftScale;',
        '  uniform float uSpeed;',
        '  uniform float uFreq;',
        '  uniform float uChroma;',
        '  uniform float uEdgeThreshold;',
        '  uniform float uDissolve;',
        '  uniform float uDecay;',
        '  uniform float uGrain;',
        '  uniform float uTime;',
        '  uniform float uSeed;',
        '',
        '  float hash(vec2 p) {',
        '    p = fract(p * vec2(123.34, 456.21) + uSeed);',
        '    p += dot(p, p + 78.233);',
        '    return fract(p.x * p.y);',
        '  }',
        '',
        '  float noise(vec2 p) {',
        '    vec2 i = floor(p);',
        '    vec2 f = fract(p);',
        '    float a = hash(i + vec2(0.0, 0.0));',
        '    float b = hash(i + vec2(1.0, 0.0));',
        '    float c = hash(i + vec2(0.0, 1.0));',
        '    float d = hash(i + vec2(1.0, 1.0));',
        '    vec2 u = f * f * (3.0 - 2.0 * f);',
        '    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;',
        '  }',
        '',
        '  float fbm(vec2 p) {',
        '    float v = 0.0;',
        '    float amp = 0.5;',
        '    float freq = 1.0;',
        '    for (int i = 0; i < 5; i++) {',
        '      v += amp * noise(p * freq);',
        '      freq *= 2.0;',
        '      amp *= 0.5;',
        '    }',
        '    return v;',
        '  }',
        '',
        '  vec2 curlNoise(vec2 p) {',
        '    float e = 0.0015;',
        '    float n1 = fbm(p + vec2(e, 0.0));',
        '    float n2 = fbm(p - vec2(e, 0.0));',
        '    float n3 = fbm(p + vec2(0.0, e));',
        '    float n4 = fbm(p - vec2(0.0, e));',
        '    float dx = (n1 - n2) / (2.0 * e);',
        '    float dy = (n3 - n4) / (2.0 * e);',
        '    return vec2(dy, -dx);',
        '  }',
        '',
        '  float luma(vec3 c) {',
        '    return dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  }',
        '',
        '  void main() {',
        '    vec2 uv = vUv;',
        '    vec2 res = uResolution;',
        '    vec2 uvn = uv * res / min(res.x, res.y);',
        '    vec2 p = uvn * uFreq + vec2(uTime * 0.08);',
        '    vec2 flow = curlNoise(p);',
        '    vec2 adv = flow * uDriftScale * uSpeed * 0.0015;',
        '    vec2 prevUV = clamp(uv + adv, 0.0, 1.0);',
        '    float angle = atan(flow.y, flow.x);',
        '    vec2 ortho = vec2(cos(angle), sin(angle));',
        '    vec3 prevR = texture2D(tPrev, clamp(prevUV + ortho * uChroma * 1.0, 0.0, 1.0)).rgb;',
        '    vec3 prevG = texture2D(tPrev, clamp(prevUV, 0.0, 1.0)).rgb;',
        '    vec3 prevB = texture2D(tPrev, clamp(prevUV - ortho * uChroma * 1.0, 0.0, 1.0)).rgb;',
        '    vec3 prevColor = vec3(prevR.r, prevG.g, prevB.b);',
        '    vec3 softPrev = (',
        '      texture2D(tPrev, clamp(prevUV + vec2(0.0, uChroma*2.0), 0.0, 1.0)).rgb +',
        '      texture2D(tPrev, clamp(prevUV + vec2(uChroma*2.0, 0.0), 0.0, 1.0)).rgb +',
        '      prevColor',
        '    ) / 3.0;',
        '    vec3 curr = texture2D(tCurr, uv).rgb;',
        '    float dl = abs(luma(curr) - luma(softPrev));',
        '    float edgeW = smoothstep(uEdgeThreshold * 0.5, uEdgeThreshold, dl);',
        '    float reveal = mix(1.0 - uDissolve, 1.0, edgeW);',
        '    vec3 mixed = mix(prevColor, curr, reveal);',
        '    mixed = mix(mixed, softPrev, 0.08);',
        '    float g = (hash(uv * (uTime + uSeed)) - 0.5) * uGrain;',
        '    mixed += g;',
        '    vec3 outCol = mix(mixed, curr, uDecay);',
        '    gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);',
        '  }',
        '`;',
        '',
        'const mat = new THREE.ShaderMaterial({',
        '  vertexShader,',
        '  fragmentShader,',
        '  uniforms: {',
        '    tPrev: { value: null },',
        '    tCurr: { value: null },',
        '    uResolution: { value: new THREE.Vector2(effectiveW, effectiveH) },',
        '    uDriftScale: { value: driftScale },',
        '    uSpeed: { value: speed },',
        '    uFreq: { value: frequency },',
        '    uChroma: { value: chroma },',
        '    uEdgeThreshold: { value: edgeThreshold },',
        '    uDissolve: { value: dissolve },',
        '    uDecay: { value: decay },',
        '    uGrain: { value: grain },',
        '    uTime: { value: 0.0 },',
        '    uSeed: { value: seed },',
        '  },',
        '  depthTest: false,',
        '  depthWrite: false,',
        '  transparent: false,',
        '});',
        '',
        'const quad = new THREE.Mesh(fsGeom, mat);',
        'fsScene.add(quad);',
        '',
        'return { fsScene, fsCam, mat };',
        '',
        '```',
        '',
        '}, [effectiveW, effectiveH]);',
        '',
        'const screenMaterial = useMemo(() => {',
        'const m = new THREE.MeshBasicMaterial({',
        'map: feedbackA.texture,',
        'transparent: false,',
        '});',
        'screenMatRef.current = m;',
        'return m;',
        '}, [feedbackA]);',
        '',
        'const readIndexRef = useRef(0);',
        'const initialisedRef = useRef(false);',
        '',
        'useFrame((state) => {',
        'if (!gl || !pass || !screenMatRef.current) return;',
        '',
        '```',
        'const w = Math.max(1, (size && size.width) || effectiveW);',
        'const h = Math.max(1, (size && size.height) || effectiveH);',
        '',
        'pass.mat.uniforms.uResolution.value.set(w, h);',
        'pass.mat.uniforms.uDriftScale.value = driftScale;',
        'pass.mat.uniforms.uSpeed.value = speed;',
        'pass.mat.uniforms.uFreq.value = frequency;',
        'pass.mat.uniforms.uChroma.value = chroma;',
        'pass.mat.uniforms.uEdgeThreshold.value = edgeThreshold;',
        'pass.mat.uniforms.uDissolve.value = dissolve;',
        'pass.mat.uniforms.uDecay.value = decay;',
        'pass.mat.uniforms.uGrain.value = grain;',
        'pass.mat.uniforms.uSeed.value = seed;',
        'pass.mat.uniforms.uTime.value = clock ? clock.getElapsedTime() : (state.clock ? state.clock.getElapsedTime() : 0);',
        '',
        'let currTex = null;',
        '',
        'if (isGlobal && captureRT && scene && camera) {',
        '  const wasVisible = meshRef.current ? meshRef.current.visible : undefined;',
        '  if (meshRef.current) meshRef.current.visible = false;',
        '  const prevRT = gl.getRenderTarget();',
        '  try {',
        '    gl.setRenderTarget(captureRT);',
        '    gl.clear(true, true, true);',
        '    gl.render(scene, camera);',
        '  } finally {',
        '    gl.setRenderTarget(prevRT);',
        '    if (meshRef.current && wasVisible !== undefined) meshRef.current.visible = wasVisible;',
        '  }',
        '  currTex = captureRT.texture;',
        '} else if (videoTexture) {',
        '  currTex = videoTexture;',
        '} else {',
        '  currTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);',
        '  currTex.needsUpdate = true;',
        '}',
        '',
        'const readRT = readIndexRef.current === 0 ? feedbackA : feedbackB;',
        'const writeRT = readIndexRef.current === 0 ? feedbackB : feedbackA;',
        '',
        'if (!initialisedRef.current) {',
        '  const prev = gl.getRenderTarget();',
        '  gl.setRenderTarget(readRT);',
        '  gl.clear(true, true, true);',
        '  pass.mat.uniforms.tPrev.value = currTex;',
        '  pass.mat.uniforms.tCurr.value = currTex;',
        '  gl.render(pass.fsScene, pass.fsCam);',
        '  gl.setRenderTarget(prev);',
        '  initialisedRef.current = true;',
        '}',
        '',
        'pass.mat.uniforms.tPrev.value = readRT.texture;',
        'pass.mat.uniforms.tCurr.value = currTex;',
        '',
        'const prevRT = gl.getRenderTarget();',
        'gl.setRenderTarget(writeRT);',
        'gl.clear(true, true, true);',
        'gl.render(pass.fsScene, pass.fsCam);',
        'gl.setRenderTarget(prevRT);',
        '',
        'readIndexRef.current = 1 - readIndexRef.current;',
        'const latest = readIndexRef.current === 0 ? feedbackA : feedbackB;',
        '',
        'if (screenMatRef.current.map !== latest.texture) {',
        '  screenMatRef.current.map = latest.texture;',
        '  screenMatRef.current.needsUpdate = true;',
        '}',
        '',
        '```',
        '',
        '});',
        '',
        'const aspect = useMemo(() => {',
        'try {',
        'if (size && size.width > 0 && size.height > 0) return size.width / size.height;',
        '} catch {}',
        'return effectiveW / effectiveH;',
        '}, [size, effectiveW, effectiveH]);',
        '',
        "return React.createElement(",
        "'mesh',",
        '{ ref: meshRef },',
        "React.createElement('planeGeometry', { args: [aspect * 2, 2] }),",
        "React.createElement('primitive', { object: screenMaterial, attach: 'material' }),",
        ');',
        '}',
      ].join('\n');

      if (!selectedTemplate) { setStatus('No AI provider selected. Configure in Settings first.'); return; }

      const combined = [
        'why is the effect not working send whole code fix with no comment',
        '',
        'Not working',
        '',
        code,
        '',
        'working example',
        '',
        workingExample,
      ].join('\n');

      const text = await callAIAPI({
        template: selectedTemplate,
        apiKey,
        model,
        messages: [ { role: 'user', content: combined } ],
        temperature: 0.0,
      });

      const fence = /```[a-zA-Z]*\n([\s\S]*?)```/m.exec(text);
      const cleaned = fence ? fence[1] : text.replace(/^```[a-zA-Z]*\n?|```$/g, '');
      setCode(cleaned);
      setStatus('Fixed output applied');
    } catch (e: any) {
      setStatus(`Fix failed: ${e?.message || String(e)}`);
    } finally {
      setThinking(false);
    }
  };

  // Load external JS/TS code into the editor (Electron or Web)
  const handleLoadExternalCode = async () => {
    try {
      const isElectron = typeof window !== 'undefined' && !!(window as any).electron?.showOpenDialog;
      if (isElectron) {
        trackFeature('ai_external_code_load_dialog', { ok: true, source: 'electron_dialog' });
        const result = await (window as any).electron.showOpenDialog({
          title: 'Load External Code',
          properties: ['openFile'],
          filters: [{ name: 'Code', extensions: ['js','mjs','cjs','ts','tsx','jsx'] }]
        });
        if (result?.canceled || !result?.filePaths?.[0]) return;
        const filePath = String(result.filePaths[0]);
        const content = await (window as any).electron.readFileText(filePath);
        if (typeof content === 'string') {
          setCode(content);
          try { localStorage.setItem('vj-ai-last-code', content); } catch {}
          const base = String(filePath.split(/[/\\]/).pop() || '').slice(0, 80);
          setStatus(`Loaded external file: ${base}`);
          trackFeature('ai_external_code_loaded', { ok: true, source: 'electron_dialog' });
        }
        return;
      }
      // Web: File System Access API first
      try {
        trackFeature('ai_external_code_load_dialog', { ok: true, source: 'web_picker' });
        // @ts-ignore
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'JavaScript/TypeScript', accept: { 'application/javascript': ['.js','.mjs','.cjs'], 'text/plain': ['.ts','.tsx','.jsx'] } }]
        });
        const file = await handle.getFile();
        const text = await file.text();
        setCode(text);
        try { localStorage.setItem('vj-ai-last-code', text); } catch {}
        setStatus(`Loaded external file: ${file.name}`);
        trackFeature('ai_external_code_loaded', { ok: true, source: 'web_picker' });
        return;
      } catch {}
      // Fallback: hidden input
      trackFeature('ai_external_code_load_dialog', { ok: true, source: 'web_input' });
      try { hiddenFileInputRef.current?.click(); } catch {}
    } catch (e: any) {
      setStatus(e?.message || 'Failed to load external file');
    }
  };

  const handleHiddenFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      setCode(text);
      try { localStorage.setItem('vj-ai-last-code', text); } catch {}
      setStatus(`Loaded external file: ${file.name}`);
      trackFeature('ai_external_code_loaded', { ok: true, source: 'web_input' });
    } catch (err: any) {
      setStatus(err?.message || 'Failed to read selected file');
    } finally {
      try { if (hiddenFileInputRef.current) hiddenFileInputRef.current.value = ''; } catch {}
    }
  };

  const isCodeFile = (name: string): boolean => {
    const lower = String(name || '').toLowerCase();
    return [
      '.js','.mjs','.cjs','.ts','.tsx','.jsx'
    ].some(ext => lower.endsWith(ext));
  };

  const handleEditorDragOver = (e: React.DragEvent) => {
    try {
      if (!e.dataTransfer) return;
      if (Array.from(e.dataTransfer.items || []).some((it) => it.kind === 'file')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDraggingOverEditor(true);
      }
    } catch {}
  };

  const handleEditorDragLeave = () => {
    setDraggingOverEditor(false);
  };

  const handleEditorDrop = async (e: React.DragEvent) => {
    try {
      e.preventDefault();
      setDraggingOverEditor(false);
      const files: File[] = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      const file = files[0];
      if (!isCodeFile(file.name)) { setStatus('Unsupported file type. Please drop a .js/.ts/.tsx/.jsx file'); return; }
      const text = await file.text();
      setCode(text);
      try { localStorage.setItem('vj-ai-last-code', text); } catch {}
      setStatus(`Loaded external file: ${file.name}`);
    } catch (err: any) {
      setStatus(err?.message || 'Failed to load dropped file');
    }
  };

  // Reference options removed

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-gap-3">
      

      <div className="tw-grid tw-grid-cols-1 tw-gap-3">
        <div className="tw-col-span-1 tw-space-y-3">
          <div className="tw-space-y-1">
            <Label className="tw-text-xs">Prompt</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} className="tw-text-xs tw-resize-y tw-w-full tw-appearance-none" />
            <div className="tw-flex tw-items-center tw-gap-2">
              <Label className="tw-text-xs tw-whitespace-nowrap">Prompt ideas</Label>
              <Select
                value={addonSelection}
                onChange={(v) => {
                  const text = addonTextFromValue(String(v));
                  if (text) {
                    setPrompt((p) => (p ? `${p}\n\n${text}` : text));
                  setStatus('Added prompt idea to prompt');
                  }
                  setAddonSelection('');
                }}
                options={[{ value: '', label: 'Choose…' }, ...addonOptions]}
                className="tw-text-xs"
              />
            </div>
          </div>
          <div className="tw-flex tw-gap-2 tw-flex-wrap tw-items-center">
            <Button variant="secondary" onClick={handleGenerate} disabled={thinking || !apiKey}>
              {thinking ? 'Generating…' : 'Generate with AI'}
            </Button>
            <Button variant="secondary" onClick={handleApplyToSelectedSlot} disabled={!code.trim()}>Apply to Slot</Button>
            <Button variant="secondary" onClick={handleSaveToFile} disabled={!code.trim()}>Save</Button>
            <div className="tw-h-6 tw-w-px tw-bg-neutral-600"></div>
            <Button variant="secondary" onClick={handleLoadExternalCode}>Load external code</Button>
            <Button variant="secondary" onClick={handleFixOutput} disabled={!code.trim()}>Fix Output</Button>
          </div>
          <div className="tw-text-xs tw-text-neutral-400">{status}</div>

        </div>
        <div className="tw-col-span-1 tw-flex tw-flex-col tw-min-h-0">
          <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
            <div className="tw-text-xs tw-text-neutral-400">Editable Code</div>
          </div>
          <div className="tw-flex-1 tw-min-h-0">
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onDragOver={handleEditorDragOver}
              onDragLeave={handleEditorDragLeave}
              onDrop={handleEditorDrop}
              rows={8}
              className={`tw-w-full tw-text-xs tw-resize-y tw-appearance-none ${draggingOverEditor ? 'tw-border tw-border-dashed tw-border-neutral-600' : ''}`}
            />
            <input ref={hiddenFileInputRef} type="file" accept=".js,.mjs,.cjs,.ts,.tsx,.jsx" className="tw-hidden" onChange={handleHiddenFileChange} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIEffectsLab;


