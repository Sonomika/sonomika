import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Label, Select, Textarea, Tabs, TabsList, TabsTrigger, TabsContent, ScrollArea, Separator, Switch } from './ui';
import { useStore } from '../store/store';

interface RefEffectOption {
  id: string;
  name: string;
  fileKey?: string;
  category?: string;
  isSource?: boolean;
}

const DEFAULT_PROMPT = `Create a new React Fiber visual effect as a plain JavaScript ESM (.js) module.
- Use React Three Fiber and THREE.
- Default export a component and attach metadata.
- Support both layer and global contexts via render target pattern.
- Keep file self-contained with no app-specific imports.
- Include a couple of tunable parameters.
`;

const STORAGE_KEY_API = 'vj-ai-openai-api-key';
const STORAGE_KEY_MODEL = 'vj-ai-openai-model';

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
  const [apiKey, setApiKey] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY_API) || ''; } catch { return ''; }
  });
  const [model, setModel] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY_MODEL) || 'gpt-5'; } catch { return 'gpt-5'; }
  });
  const [thinking, setThinking] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [code, setCode] = useState<string>(() => {
    try { return localStorage.getItem('vj-ai-last-code') || ''; } catch { return ''; }
  });
  const [status, setStatus] = useState<string>('');
  const [isSource, setIsSource] = useState<boolean>(false);
  const lastLoadedForEffectRef = useRef<string | null>(null);
  const [addonSelection, setAddonSelection] = useState<string>('');

  // Editor interactions are minimal; controls live in effect parameters

  // Suggested add-on prompt snippets
  const addonOptions = useMemo(() => (
    [
      { value: 'based-on-template', label: 'Based on this template' },
      { value: 'optimize-performance', label: 'Optimize GPU performance and avoid per-frame allocations' },
      { value: 'no-jsx', label: 'Do not use JSX; only React.createElement' },
      { value: 'fiber-global', label: 'Ensure global mode works via render target pattern' },
    ]
  ), []);

  const addonTextFromValue = (val: string): string => {
    switch (val) {
      case 'based-on-template':
        return 'Based on this template.';
      case 'optimize-performance':
        return 'Optimize GPU performance and avoid per-frame allocations; reuse materials and buffers.';
      case 'no-jsx':
        return 'Do not use JSX; return with React.createElement calls only.';
      case 'fiber-global':
        return 'Ensure support for layer and global contexts using the render target pattern.';
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
        setStatus('Could not find source for selected layer effect');
      }
    })();
  }, [selectedEffectId, loadSourceForEffectId]);

  // Reference dropdown removed

  const onSaveApiKey = () => {
    try { localStorage.setItem(STORAGE_KEY_API, apiKey.trim()); setStatus('Saved API key'); } catch {}
  };
  const onSaveModel = (m: string) => {
    setModel(m);
    try { localStorage.setItem(STORAGE_KEY_MODEL, m); } catch {}
  };

  // Generate effect code with OpenAI
  const handleGenerate = async () => {
    if (!apiKey) { setStatus('Enter your OpenAI API key first'); return; }
    setThinking(true);
    setStatus('Generating with AI...');
    try {
      // Lightweight client via fetch to avoid SDK dependency; Electron only recommended
      const truncated = (code && code.trim()) ? (code.length > 50000 ? code.slice(0, 50000) + "\n/* …truncated… */" : code) : '';
      const combined = truncated
        ? `${String(prompt || '')}\n\nExample:\n\`\`\`js\n${truncated}\n\`\`\``
        : String(prompt || '');
      const body: any = {
        model,
        messages: [
          { role: 'user', content: combined }
        ],
      };
      // Some models (e.g., gpt-5) only support the default temperature; skip when not supported
      if (!/^gpt-5/i.test(model)) {
        body.temperature = 0.7;
      }

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenAI error ${resp.status}: ${t}`);
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content || '';
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
      const effect = await discovery.loadUserEffectFromContent(code, `ai-generated-${Date.now()}.js`);
      if (effect) {
        try { localStorage.setItem('vj-ai-last-code', code); } catch {}
        setStatus(`Loaded user effect: ${effect.name}`);
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
      // Use a stable sourceName so repeated applies hot-replace the same effect id
      const effect = await discovery.loadUserEffectFromContent(code, 'ai-live-edit.js');
      if (!effect) { setStatus('Failed to load effect for apply'); return; }
      try { localStorage.setItem('vj-ai-last-code', code); } catch {}
      // Update current layer to reference the user effect
      try {
        const id = effect.id; // e.g., user-ai-live-edit
        (useStore.getState() as any).updateLayer(selectedLayerId, {
          type: 'effect',
          asset: { id, name: id, type: 'effect', isEffect: true },
        });
        // reference selection removed
        lastLoadedForEffectRef.current = effect.id;
        setStatus(`Applied to selected slot: ${effect.name}`);
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
            const slug = String(name)
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              || 'effect';
            return `${slug}.js`;
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

  // Fix broken outputs using AI (or quick-clean fallback)
  const handleFixOutput = async () => {
    try {
      if (!code.trim()) { setStatus('Nothing to fix'); return; }
      const hasApi = !!apiKey && apiKey.trim().length > 0;
      // Always quick-clean first: strip markdown fences
      try {
        const match = /```[a-zA-Z]*\n([\s\S]*?)```/m.exec(code);
        const cleaned = match ? match[1] : code.replace(/^```[a-zA-Z]*\n?|```$/g, '');
        if (cleaned && cleaned !== code) setCode(cleaned);
      } catch {}
      if (!hasApi) { setStatus('Basic clean applied. Add API key to run AI repair.'); return; }
      setThinking(true);
      setStatus('Fixing with AI...');
      const instructions = [
        'Repair this JavaScript ESM module so it runs as a portable external visual effect in our app.',
        '- Output: plain .js ESM code only; no explanations or markdown fences.',
        '- No imports. Use globalThis.React, globalThis.THREE, globalThis.r3f.',
        '- Provide a default exported component function.',
        '- Attach effect metadata via export const metadata (or component.metadata).',
        '- Avoid JSX; use React.createElement or return primitives via React APIs.',
        '- Keep it self-contained and executable.',
      ].join('\n');
      const combined = `${instructions}\n\nExample:\n\`\`\`js\n${code}\n\`\`\``;
      const body: any = {
        model,
        messages: [ { role: 'user', content: combined } ],
      };
      if (!/^gpt-5/i.test(model)) body.temperature = 0.2;
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`OpenAI error ${resp.status}: ${t}`);
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content || '';
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

  // Reference options removed

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-gap-3">
      

      <div className="tw-grid tw-grid-cols-1 tw-gap-3">
        <div className="tw-col-span-1 tw-space-y-3">
          <div className="tw-space-y-1">
            <Label className="tw-text-xs">OpenAI API Key</Label>
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="tw-text-xs" />
            <div className="tw-flex tw-gap-2">
              <button className={btnClass} onClick={onSaveApiKey}>Save Key</button>
              <Select value={model} onChange={(v) => onSaveModel(String(v))} options={[
                { value: 'gpt-5', label: 'gpt-5' },
                { value: 'gpt-5-mini', label: 'gpt-5-mini' },
                { value: 'gpt-4o', label: 'gpt-4o' },
                { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
                { value: 'o4-mini', label: 'o4-mini' },
              ]} className="tw-text-xs" />
            </div>
          </div>
          <div className="tw-space-y-1">
            <Label className="tw-text-xs">Prompt</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} className="tw-text-xs" />
            <div className="tw-flex tw-items-center tw-gap-2">
              <Label className="tw-text-xs">Add‑on</Label>
              <Select
                value={addonSelection}
                onChange={(v) => {
                  const text = addonTextFromValue(String(v));
                  if (text) {
                    setPrompt((p) => (p ? `${p}\n\n${text}` : text));
                    setStatus('Added add‑on to prompt');
                  }
                  setAddonSelection('');
                }}
                options={[{ value: '', label: 'Choose…' }, ...addonOptions]}
                className="tw-text-xs"
              />
            </div>
          </div>
          <div className="tw-flex tw-gap-2">
            <button className={btnClass} onClick={handleGenerate} disabled={thinking || !apiKey}>
              {thinking ? 'Generating…' : 'Generate with AI'}
            </button>
            <button className={btnClass} onClick={() => setPrompt(DEFAULT_PROMPT)}>Reset Prompt</button>
          </div>
          <div className="tw-text-xs tw-text-neutral-400">{status}</div>
        </div>
        <div className="tw-col-span-1 tw-flex tw-flex-col tw-min-h-0">
          <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
            <div className="tw-text-xs tw-text-neutral-400">Editable Code</div>
            <div className="tw-flex tw-gap-2 tw-flex-wrap">
              <button className={btnClass} onClick={handleLoadAsNewEffect} disabled={!code.trim()}>Load as New</button>
              <button className={btnClass} onClick={handleApplyToSelectedSlot} disabled={!code.trim()}>Apply to Slot</button>
              <button className={btnClass} onClick={handleFixOutput} disabled={!code.trim()}>Fix Output</button>
              <button className={btnClass} onClick={handleSaveToFile} disabled={!code.trim()}>Save…</button>
            </div>
          </div>
          <div className="tw-flex-1 tw-min-h-0">
            <Textarea value={code} onChange={(e) => setCode(e.target.value)} className="tw-w-full tw-h-full tw-min-h-[260px] tw-text-xs" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIEffectsLab;


