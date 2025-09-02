// OpenAI API Service for Effect Generation
// This service handles communication with OpenAI API to generate custom effects

export interface EffectGenerationRequest {
  prompt: string;
  category: 'visual-effects' | 'sources';
  existingEffects?: string[]; // For context about existing effects
  useRepoContext?: boolean;   // Include docs/effects context in the prompt
  referenceBlocks?: Array<{ path: string; text: string }>; // explicit user-selected refs
}

export interface GeneratedEffectCode {
  id: string;
  name: string;
  description: string;
  category: 'visual-effects' | 'sources';
  code: string;
  parameters: Array<{
    name: string;
    type: 'number' | 'string' | 'boolean' | 'color';
    value: any;
    min?: number;
    max?: number;
    step?: number;
  }>;
  shaderCode?: {
    vertexShader: string;
    fragmentShader: string;
  };
  metadata: {
    author: string;
    version: string;
    replacesVideo: boolean;
    canBeGlobal: boolean;
  };
}

export class OpenAIService {
  private static instance: OpenAIService;
  private apiKey: string | null = null;
  private lastRequestPayload: any | null = null;
  private lastResponseRaw: string | null = null;
  private resolveModel(): string {
    try {
      const env: any = (import.meta as any).env || {};
      const envModel = env.VITE_OPENAI_MODEL || env.OPENAI_MODEL;
      const winModel = (typeof window !== 'undefined') ? (window as any).__OPENAI_MODEL__ : undefined;
      const lsModel = (typeof window !== 'undefined') ? window.localStorage?.getItem('openai_model') : undefined;
      return (winModel || envModel || lsModel || 'gpt-5') as string;
    } catch {
      return 'gpt-5';
    }
  }

  private constructor() {}

  static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }
    return OpenAIService.instance;
  }

  // Expose last request payload for debug UI (safe: contains only prompt content)
  getLastRequestPayload(): any | null {
    return this.lastRequestPayload;
  }

  // Expose last raw response for debug UI
  getLastResponseRaw(): string | null {
    return this.lastResponseRaw;
  }

  // Load API key from secure storage
  async loadApiKey(): Promise<string | null> {
    try {
      if (typeof window !== 'undefined' && (window as any).authStorage) {
        const key = (window as any).authStorage.loadSync('openai_api_key');
        this.apiKey = key;
        return key;
      }
      // Fallback to localStorage (web builds)
      try {
        const ls = (typeof window !== 'undefined') ? window.localStorage : null;
        const key = ls?.getItem('openai_api_key') || null;
        if (key) {
          this.apiKey = key;
          return key;
        }
      } catch {}
    } catch (error) {
      console.warn('Failed to load OpenAI API key:', error);
    }
    return null;
  }

  // Test API connection
  async testConnection(): Promise<boolean> {
    const key = await this.loadApiKey();
    if (!key) return false;

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

  // Generate effect code using OpenAI API
  async generateEffect(request: EffectGenerationRequest): Promise<GeneratedEffectCode> {
    const key = await this.loadApiKey();
    if (!key) {
      throw new Error('OpenAI API key not found. Please configure it in settings.');
    }

    // Create the system prompt for effect generation
    const systemPrompt = this.createSystemPrompt(request.category);
    
    // Build repo context if requested (deep retrieval pipeline)
    const repoContext = request.useRepoContext ? await this.buildDeepRepoContext(request.prompt) : undefined;

    // Create the user prompt
    const userPrompt = this.createUserPrompt(request, repoContext);

    try {
      const model = this.resolveModel();
      const isResponsesAPI = /^gpt-5/i.test(model);
      const body: any = isResponsesAPI
        ? {
            model,
            instructions: systemPrompt,
            input: userPrompt,
            max_output_tokens: 1200,
          }
        : {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 1200,
            temperature: 0.6,
          };

      // Save debug snapshot
      this.lastRequestPayload = body;

      const url = isResponsesAPI ? 'https://api.openai.com/v1/responses' : 'https://api.openai.com/v1/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let detail = '';
        try { detail = await response.text(); } catch {}
        // Auto-fallback: retry once without repo context if request was too large
        if (/429|too large|length|tokens/i.test(detail) && request.useRepoContext) {
          return await this.generateEffect({ ...request, useRepoContext: false });
        }
        throw new Error(`OpenAI API error ${response.status}: ${detail?.slice(0,500) || 'Unknown error'}`);
      }

      const rawText = await response.text();
      this.lastResponseRaw = rawText || null;
      const data = (() => { try { return JSON.parse(rawText || '{}'); } catch { return {}; } })();
      const extractText = (d: any): string | null => {
        try {
          if (!d) return null;
          if (isResponsesAPI) {
            if (typeof d.output_text === 'string' && d.output_text.trim()) return d.output_text;
            if (Array.isArray(d.output)) {
              for (const item of d.output) {
                const t = (item?.content?.[0]?.text) || (item?.content?.text) || item?.text;
                if (typeof t === 'string' && t.trim()) return t;
              }
            }
            const maybe = d?.response?.output_text || d?.data?.[0]?.content?.[0]?.text;
            if (typeof maybe === 'string' && maybe.trim()) return maybe;
            return null;
          } else {
            const t = d?.choices?.[0]?.message?.content;
            return (typeof t === 'string' && t.trim()) ? t : null;
          }
        } catch { return null; }
      };
      const generatedContent = extractText(data);

      if (!generatedContent) {
        throw new Error('No content generated by OpenAI');
      }

      // Parse the generated code
      return this.parseGeneratedCode(generatedContent, request);
    } catch (error) {
      console.error('Effect generation failed:', error);
      throw error;
    }
  }

  private createSystemPrompt(category: 'visual-effects' | 'sources'): string {
    const isSource = category === 'sources';
    
    return `You are an expert VJ effect developer specializing in React Three.js and WebGL shaders. You generate complete, working effect components for a VJ application.

CRITICAL REQUIREMENTS:
1. Generate ONLY valid React TypeScript code that follows the exact template structure
2. Use React Three Fiber (@react-three/fiber) and Three.js
3. Effects must work identically in both layer and global contexts
4. Use the provided template structure exactly
5. Include proper metadata and registration
6. Generate working GLSL shaders (vertex and fragment)
7. Include tunable parameters with proper types and ranges
8. Follow the project's naming conventions and patterns

${isSource ? 'SOURCE EFFECTS' : 'VISUAL EFFECTS'}:
${isSource ? 
  'Sources generate new visual content from scratch (particles, patterns, noise, etc.)' :
  'Visual effects modify existing content (video, images, other effects)'
}

TEMPLATE STRUCTURE:
\`\`\`typescript
import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerEffect } from '../../utils/effectRegistry';

interface Props {
  videoTexture?: THREE.Texture;
  isGlobal?: boolean;
}

const [EffectName]: React.FC<Props> = ({ videoTexture, isGlobal = false }) => {
  const { gl, scene, camera, size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const fallback = useMemo(() => new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat), []);
  const target = useMemo(() => (isGlobal ? new THREE.WebGLRenderTarget(Math.max(1,size.width), Math.max(1,size.height)) : null), [isGlobal, size.width, size.height]);
  useEffect(() => () => target?.dispose(), [target]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      inputBuffer: { value: fallback },
      resolution: { value: new THREE.Vector2(Math.max(1,size.width), Math.max(1,size.height)) },
      uTime: { value: 0 },
      uBpm: { value: 120 },
      uOpacity: { value: 1.0 },
      // Add your custom parameters here
    },
    vertexShader: \`[VERTEX SHADER]\`,
    fragmentShader: \`[FRAGMENT SHADER]\`,
    transparent: true, depthTest: false, depthWrite: false,
  }), []);

  useFrame((state) => {
    if (isGlobal && target && materialRef.current) {
      const prev = gl.getRenderTarget();
      const vis = meshRef.current?.visible;
      if (meshRef.current) meshRef.current.visible = false;
      try { gl.setRenderTarget(target); gl.render(scene, camera); } finally { gl.setRenderTarget(prev); if (meshRef.current && vis!==undefined) meshRef.current.visible = vis; }
      materialRef.current.uniforms.inputBuffer.value = target.texture;
    } else if (!isGlobal && videoTexture && materialRef.current) {
      materialRef.current.uniforms.inputBuffer.value = videoTexture;
    }
    
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * 1000;
    }
  });

  useEffect(() => { 
    if (materialRef.current) materialRef.current.uniforms.resolution.value.set(Math.max(1,size.width), Math.max(1,size.height)); 
    if (isGlobal && target) target.setSize(Math.max(1,size.width), Math.max(1,size.height)); 
  }, [size, isGlobal, target]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
};

([EffectName] as any).metadata = {
  name: '[Effect Name]',
  description: '[Description]',
  category: '${isSource ? 'Sources' : 'Video Effects'}',
  icon: '', 
  author: 'AI Generator', 
  version: '1.0.0',
  replacesVideo: ${isSource ? 'true' : 'false'}, 
  canBeGlobal: true,
  parameters: [
    // Add parameter definitions here
  ],
};

registerEffect('[kebab-case-id]', [EffectName]);
export default [EffectName];
\`\`\`

SHADER GUIDELINES:
- Use standard GLSL syntax
- Include time, BPM, and resolution uniforms
- For visual effects: use inputBuffer texture for input
- For sources: generate content from scratch
- Use proper color space and blending
- Include smooth animations and transitions
- Make effects responsive to BPM and time

PARAMETER GUIDELINES:
- Use descriptive names (e.g., uIntensity, uSpeed, uColor)
- Provide reasonable min/max values and step sizes
- Use appropriate types (number, color, boolean)
- Include default values

RESPONSE FORMAT:
Return ONLY the complete TypeScript code following the template exactly. Do not include explanations or markdown formatting.`;
  }

  private createUserPrompt(
    request: EffectGenerationRequest,
    repoContext?: { guideSnippet?: string; effectsSummary?: string; blocks?: Array<{ path: string; startLine: number; endLine: number; text: string }>; totalSize?: number }
  ): string {
    const { prompt, category, existingEffects } = request;
    
    let userPrompt = `Generate a ${category === 'sources' ? 'generative source effect' : 'visual effect'} with the following description:

"${prompt}"

`;

    if (existingEffects && existingEffects.length > 0) {
      userPrompt += `\nExisting effects for context:\n${existingEffects.join(', ')}\n\n`;
    }

    if (repoContext) {
      // Transparency: list ranges
      try {
        const header: string[] = [];
        if (repoContext.blocks && repoContext.blocks.length > 0) {
          header.push('\nCONTEXT SNIPPETS (trimmed, safe):');
          repoContext.blocks.forEach((b) => {
            header.push(`- ${b.path}:${b.startLine}-${b.endLine}`);
          });
          userPrompt += header.join('\n') + '\n\n';

          // Attach snippets
          repoContext.blocks.forEach((b) => {
            userPrompt += `FILE: ${b.path}:${b.startLine}-${b.endLine}\n`;
            userPrompt += '```\n' + b.text + '\n```\n\n';
          });
        } else {
          if (repoContext.guideSnippet) {
            userPrompt += `\nPROJECT RULES (from EFFECTS_GUIDE.md, trimmed):\n${repoContext.guideSnippet}\n\n`;
          }
          if (repoContext.effectsSummary) {
            userPrompt += `\nAVAILABLE EFFECTS (auto-discovered):\n${repoContext.effectsSummary}\n\n`;
          }
        }
      } catch {}
    }

    userPrompt += `Requirements:
- Create a unique, creative effect that matches the description
- Use appropriate GLSL shaders for the visual result
- Include 2-4 tunable parameters for customization
- Make the effect responsive to time and BPM
- Ensure smooth, professional-quality visuals
- Follow the exact template structure provided

Generate the complete TypeScript code now:`;

    return userPrompt;
  }

  // Deep retrieval pipeline: docs/EFFECTS_GUIDE.md + src/effects/** (safe subset), chunked and scored
  private async buildDeepRepoContext(query: string): Promise<{
    guideSnippet?: string;
    effectsSummary?: string;
    blocks?: Array<{ path: string; startLine: number; endLine: number; text: string }>;
    totalSize?: number;
  }> {
    const result: { guideSnippet?: string; effectsSummary?: string; blocks?: Array<{ path: string; startLine: number; endLine: number; text: string }>; totalSize?: number } = {};
    const blocks: Array<{ path: string; startLine: number; endLine: number; text: string; score: number; size: number }> = [];

    try {
      // 1) Load EFFECTS_GUIDE.md
      try {
        const guideMods: Record<string, any> = (import.meta as any).glob('../../docs/EFFECTS_GUIDE.md', { as: 'raw', eager: true });
        const gkeys = Object.keys(guideMods || {});
        if (gkeys.length > 0) {
          const raw: string = guideMods[gkeys[0]] as string;
          result.guideSnippet = raw.slice(0, 4000);
          // Also chunk it a bit for retrieval
          chunkIntoBlocks(raw, 'docs/EFFECTS_GUIDE.md').forEach((b) => blocks.push({ ...b, score: scoreBlock(b.text, query), size: b.text.length }));
        }
      } catch {}

      // 2) Load effects files
      try {
        const effectMods: Record<string, any> = (import.meta as any).glob('../../src/effects/**/*.tsx', { as: 'raw', eager: true });
        const eKeys = Object.keys(effectMods || {});
        const names: string[] = [];
        eKeys.forEach((key) => {
          names.push(key.replace(/^.*src\//, 'src/'));
          const raw: string = effectMods[key] as string;
          const stripped = stripCommentsAndWhitespace(raw);
          chunkIntoBlocks(stripped, key.replace(/^.*src\//, 'src/')).forEach((b) => blocks.push({ ...b, score: scoreBlock(b.text, query), size: b.text.length }));
        });
        result.effectsSummary = names.slice(0, 100).map((n) => `- ${n}`).join('\n');
      } catch {}

      // 3) Select top-K under size cap (tighten to reduce TPM)
      const SIZE_CAP = 120 * 1024; // 120 KB
      const selected: Array<{ path: string; startLine: number; endLine: number; text: string }> = [];
      let total = 0;
      blocks
        .sort((a, b) => b.score - a.score)
        .some((b) => {
          if (total + b.size > SIZE_CAP) return false;
          selected.push({ path: b.path, startLine: b.startLine, endLine: b.endLine, text: b.text });
          total += b.size;
          return false;
        });

      result.blocks = selected;
      result.totalSize = total;
    } catch {}

    return result;

    // Helpers
    function stripCommentsAndWhitespace(src: string): string {
      try {
        // Remove /* */ and // comments, collapse blank lines
        const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
        const noLine = noBlock.replace(/(^|\s)\/\/.*$/gm, '');
        return noLine.replace(/\n{3,}/g, '\n\n');
      } catch {
        return src;
      }
    }

    // Explicit user-selected references (highest priority)
    if (request.referenceBlocks && request.referenceBlocks.length > 0) {
      userPrompt += `\nUSER-SELECTED REFERENCES (trimmed):\n`;
      request.referenceBlocks.forEach((b) => {
        const clipped = (b.text || '').slice(0, 40 * 1024); // cap ~40KB per file
        userPrompt += `FILE: ${b.path}\n`;
        userPrompt += '```\n' + clipped + '\n```\n\n';
      });
    }

    function chunkIntoBlocks(text: string, path: string, maxLines = 200): Array<{ path: string; startLine: number; endLine: number; text: string }> {
      const lines = text.split('\n');
      const out: Array<{ path: string; startLine: number; endLine: number; text: string }> = [];
      for (let i = 0; i < lines.length; i += maxLines) {
        const chunk = lines.slice(i, i + maxLines);
        out.push({ path, startLine: i + 1, endLine: i + chunk.length, text: chunk.join('\n') });
      }
      return out;
    }

    function scoreBlock(block: string, q: string): number {
      const terms = (q || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const hay = block.toLowerCase();
      let s = 0;
      terms.forEach((t) => { if (t.length > 2) s += (hay.match(new RegExp(t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')) || []).length; });
      // Mild preference for files that include shader/material keywords
      if (/shader|fragmentShader|vertexShader|uniforms|useFrame|@react-three\/fiber|three/.test(hay)) s += 2;
      return s;
    }
  }

  private parseGeneratedCode(content: string, request: EffectGenerationRequest): GeneratedEffectCode {
    try {
      // Extract the code from the response
      const codeMatch = content.match(/```typescript\n([\s\S]+?)\n```/) || 
                       content.match(/```\n([\s\S]+?)\n```/) ||
                       [null, content];
      
      const code = codeMatch[1] || content;

      // Extract metadata from the code
      const metadataMatch = code.match(/\.metadata\s*=\s*{([\s\S]+?)}/);
      const nameMatch = code.match(/name:\s*['"`]([^'"`]+)['"`]/);
      const descriptionMatch = code.match(/description:\s*['"`]([^'"`]+)['"`]/);
      const parametersMatch = code.match(/parameters:\s*\[([\s\S]+?)\]/);

      const name = nameMatch?.[1] || request.prompt.split(' ').slice(0, 3).join(' ');
      const description = descriptionMatch?.[1] || request.prompt;
      
      // Parse parameters
      const parameters: Array<{
        name: string;
        type: 'number' | 'string' | 'boolean' | 'color';
        value: any;
        min?: number;
        max?: number;
        step?: number;
      }> = [];

      if (parametersMatch) {
        const paramText = parametersMatch[1];
        const paramMatches = paramText.match(/\{[^}]+\}/g);
        if (paramMatches) {
          paramMatches.forEach(paramStr => {
            const nameMatch = paramStr.match(/name:\s*['"`]([^'"`]+)['"`]/);
            const typeMatch = paramStr.match(/type:\s*['"`]([^'"`]+)['"`]/);
            const valueMatch = paramStr.match(/value:\s*([^,}]+)/);
            const minMatch = paramStr.match(/min:\s*([^,}]+)/);
            const maxMatch = paramStr.match(/max:\s*([^,}]+)/);
            const stepMatch = paramStr.match(/step:\s*([^,}]+)/);

            if (nameMatch && typeMatch && valueMatch) {
              parameters.push({
                name: nameMatch[1],
                type: typeMatch[1] as any,
                value: this.parseValue(valueMatch[1]),
                min: minMatch ? parseFloat(minMatch[1]) : undefined,
                max: maxMatch ? parseFloat(maxMatch[1]) : undefined,
                step: stepMatch ? parseFloat(stepMatch[1]) : undefined,
              });
            }
          });
        }
      }

      // Generate unique ID
      const id = `ai-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

      return {
        id,
        name,
        description,
        category: request.category,
        code,
        parameters,
        metadata: {
          author: 'AI Generator',
          version: '1.0.0',
          replacesVideo: request.category === 'sources',
          canBeGlobal: true,
        },
      };
    } catch (error) {
      console.error('Failed to parse generated code:', error);
      throw new Error('Failed to parse generated effect code');
    }
  }

  private parseValue(valueStr: string): any {
    const trimmed = valueStr.trim();
    
    // Try to parse as number
    if (!isNaN(Number(trimmed))) {
      return Number(trimmed);
    }
    
    // Try to parse as boolean
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    
    // Try to parse as string (remove quotes)
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    
    return trimmed;
  }
}

export default OpenAIService;
