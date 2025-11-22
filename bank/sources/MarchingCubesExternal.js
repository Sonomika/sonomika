// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useEffect, useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Marching Cubes',
  description: 'Exact MarchingCubes look using the three.js addon and external cubemap/texture URLs.',
  category: 'Sources',
  author: 'AI',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'addonUrl', type: 'text', value: 'https://unpkg.com/three@0.160.0/examples/js/objects/MarchingCubes.js' },
    { name: 'envPath', type: 'text', value: 'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/' },
    { name: 'envFormat', type: 'text', value: '.jpg' },
    { name: 'uvGridUrl', type: 'text', value: 'https://threejs.org/examples/textures/uv_grid_opengl.jpg' },
    { name: 'material', type: 'select', value: 'shiny', options: ['shiny','chrome','liquid','matte','flat','textured','colors','multiColors','plastic'] },
    { name: 'speed', type: 'number', value: 1.0, min: 0.1, max: 8.0, step: 0.05 },
    { name: 'numBlobs', type: 'number', value: 10, min: 1, max: 50, step: 1 },
    { name: 'resolution', type: 'number', value: 28, min: 14, max: 100, step: 1 },
    { name: 'isolation', type: 'number', value: 80, min: 10, max: 300, step: 1 },
    { name: 'floor', type: 'boolean', value: true },
    { name: 'wallx', type: 'boolean', value: false },
    { name: 'wallz', type: 'boolean', value: false },
  ],
};

export default function MarchingCubes({
  addonUrl = 'https://unpkg.com/three@0.160.0/examples/jsm/objects/MarchingCubes.js',
  envPath = 'https://threejs.org/examples/textures/cube/SwedishRoyalCastle/',
  envFormat = '.jpg',
  uvGridUrl = 'https://threejs.org/examples/textures/uv_grid_opengl.jpg',
  material: materialName = 'shiny',
  speed = 1.0,
  numBlobs = 10,
  resolution = 28,
  isolation = 80,
  floor = true,
  wallx = false,
  wallz = false,
}){
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const groupRef = useRef(null);
  const effectRef = useRef(null);
  const matsRef = useRef(null);
  const currentMaterialRef = useRef(materialName);
  const [addonReady, setAddonReady] = useState(!!(THREE && THREE.MarchingCubes));
  const timeRef = useRef(0);

  // Load addon (JSM) via fetch->transform->blob so it attaches to window.THREE
  useEffect(() => {
    let revoked = false; let scriptEl = null; let blobUrl = null; let poll = null;
    (async () => {
      if (addonReady || !addonUrl) return;
      try {
        // Normalize legacy addonUrl if user pasted '/examples/js/objects/MarchingCubes.js'
        let url = addonUrl;
        if (/\/examples\/js\/objects\/MarchingCubes\.js/i.test(url)) {
          url = url.replace('/examples/js/objects/', '/examples/jsm/objects/');
        }
        const candidates = [
          url,
          'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/objects/MarchingCubes.js',
          'https://unpkg.com/three@0.160.0/examples/jsm/objects/MarchingCubes.js',
        ];
        let res = null; let okSrc = '';
        for (let i = 0; i < candidates.length; i++) {
          try {
            const r = await fetch(candidates[i], { mode: 'cors' });
            if (r.ok) { res = r; okSrc = candidates[i]; break; }
          } catch {}
        }
        if (!res) return;
        let src = await res.text();
        // strip ESM imports and convert exports to global assignment
        // 1) remove any import lines
        src = src.replace(/^[ \t]*import[^;]+;\s*$/mg, '');
        // 2) convert named export class to assignment
        src = src.replace(/export\s+class\s+MarchingCubes/m, 'class MarchingCubes');
        src = src.replace(/export\s+\{[^}]*MarchingCubes[^}]*\};?/m, '');
        src = src.replace(/export\s+default\s+MarchingCubes\s*;?/m, '');
        // 3) wrap to attach to THREE
        const wrapped = `(function(){ try{ var THREE = (window && window.THREE) || globalThis.THREE; ${src}\n if (THREE && typeof THREE === 'object' && typeof MarchingCubes !== 'undefined') { THREE.MarchingCubes = MarchingCubes; } }catch(e){ console.warn('MarchingCubes attach failed', e); } })();`;
        const blob = new Blob([wrapped], { type: 'text/javascript' });
        blobUrl = URL.createObjectURL(blob);
        scriptEl = document.createElement('script');
        scriptEl.src = blobUrl; scriptEl.async = true;
        scriptEl.onload = () => { if (THREE && THREE.MarchingCubes) setAddonReady(true); };
        document.head.appendChild(scriptEl);
        // Poll in case onload doesn't guarantee global set
        poll = setInterval(() => { if (THREE && THREE.MarchingCubes) { setAddonReady(true); if (poll) { clearInterval(poll); poll=null; } } }, 100);
        setTimeout(()=>{ if (poll) { clearInterval(poll); poll=null; } }, 4000);
      } catch {}
    })();
    return () => {
      try { if (poll) clearInterval(poll); } catch {}
      try { if (scriptEl) document.head.removeChild(scriptEl); } catch {}
      try { if (blobUrl && !revoked) { URL.revokeObjectURL(blobUrl); revoked=true; } } catch {}
    };
  }, [addonUrl, addonReady]);

  // Load cube textures and regular texture
  const assetsRef = useRef({ reflection: null, refraction: null, uv: null });
  useEffect(() => {
    let blobUrls = [];
    const makeBlobUrl = async (url) => {
      try { const r = await fetch(url, { mode: 'cors' }); const b = await r.blob(); const u = URL.createObjectURL(b); blobUrls.push(u); return u; } catch { return ''; }
    };
    const loadCube = async () => {
      const faces = ['px','nx','py','ny','pz','nz'];
      const urls = await Promise.all(faces.map(f => makeBlobUrl(envPath.replace(/\/$/, '/') + f + envFormat)));
      const loaderCube = new THREE.CubeTextureLoader();
      const reflection = loaderCube.load(urls.slice());
      const refraction = loaderCube.load(urls.slice());
      try { refraction.mapping = THREE.CubeRefractionMapping; } catch {}
      try { (reflection).colorSpace = THREE.SRGBColorSpace || (reflection).colorSpace; } catch {}
      try { (refraction).colorSpace = THREE.SRGBColorSpace || (refraction).colorSpace; } catch {}
      // single texture
      const uvUrl = await makeBlobUrl(uvGridUrl);
      const texLoader = new THREE.TextureLoader();
      const uv = texLoader.load(uvUrl, (t)=>{ try { (t).colorSpace = THREE.SRGBColorSpace || (t).colorSpace; } catch {}; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; });
      assetsRef.current = { reflection, refraction, uv };
    };
    loadCube();
    return () => {
      try { const { reflection, refraction, uv } = assetsRef.current || {}; reflection && reflection.dispose && reflection.dispose(); refraction && refraction.dispose && refraction.dispose(); uv && uv.dispose && uv.dispose(); } catch {}
      try { blobUrls.forEach(u => URL.revokeObjectURL(u)); } catch {}
      blobUrls = [];
    };
  }, [envPath, envFormat, uvGridUrl]);

  // Build materials like the example (excluding toon shaders)
  const buildMaterials = () => {
    const { reflection, refraction, uv } = assetsRef.current;
    const M = {};
    M.shiny = new THREE.MeshStandardMaterial({ color: 0x9c0000, envMap: reflection, roughness: 0.1, metalness: 1.0 });
    M.chrome = new THREE.MeshLambertMaterial({ color: 0xffffff, envMap: reflection });
    M.liquid = new THREE.MeshLambertMaterial({ color: 0xffffff, envMap: refraction, refractionRatio: 0.85 });
    M.matte = new THREE.MeshPhongMaterial({ specular: 0x494949, shininess: 1 });
    M.flat = new THREE.MeshLambertMaterial({});
    M.textured = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x111111, shininess: 1, map: uv });
    M.colors = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 2, vertexColors: true });
    M.multiColors = new THREE.MeshPhongMaterial({ shininess: 2, vertexColors: true });
    M.plastic = new THREE.MeshPhongMaterial({ specular: 0xc1c1c1, shininess: 250 });
    return M;
  };

  // Create effect once addon ready and assets loaded
  useEffect(() => {
    if (!addonReady || !(THREE && THREE.MarchingCubes)) return;
    const g = groupRef.current; if (!g) return;
    // materials
    matsRef.current = buildMaterials();
    const mats = matsRef.current;
    const res = Math.max(14, Math.min(100, Math.floor(resolution)));
    const effect = new THREE.MarchingCubes(res, mats[currentMaterialRef.current] || mats.shiny, true, true, 100000);
    effect.position.set(0, 0, 0);
    effect.scale.set(700, 700, 700);
    effect.enableUvs = (currentMaterialRef.current === 'textured');
    effect.enableColors = (currentMaterialRef.current === 'colors' || currentMaterialRef.current === 'multiColors');
    effect.isolation = isolation;
    g.add(effect);
    effectRef.current = effect;
    return () => {
      try { g.remove(effect); } catch {}
      try { effect && effect.geometry && effect.geometry.dispose && effect.geometry.dispose(); } catch {}
      try { const disposed = new Set(); for (const k in mats) { const m = mats[k]; if (m && !disposed.has(m)) { try { m.dispose && m.dispose(); } catch {}; disposed.add(m); } } } catch {}
      matsRef.current = null; effectRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addonReady]);

  // Update material and parameters on props
  useEffect(() => {
    const eff = effectRef.current; const mats = matsRef.current; if (!eff || !mats) return;
    currentMaterialRef.current = materialName;
    eff.material = mats[materialName] || mats.shiny;
    eff.enableUvs = (materialName === 'textured');
    eff.enableColors = (materialName === 'colors' || materialName === 'multiColors');
  }, [materialName]);

  useEffect(() => {
    const eff = effectRef.current; if (!eff) return;
    const res = Math.max(14, Math.min(100, Math.floor(resolution)));
    if (typeof eff.init === 'function') eff.init(res);
  }, [resolution]);

  useEffect(() => {
    const eff = effectRef.current; if (!eff) return; eff.isolation = isolation;
  }, [isolation]);

  // Frame loop: update field like the example
  useFrame((_, delta) => {
    const eff = effectRef.current; if (!eff) return;
    timeRef.current += (delta || 0.016) * Math.max(0.0, speed || 0.0) * 0.5;
    const t = timeRef.current;
    const nb = Math.max(1, Math.min(50, Math.floor(numBlobs)));
    eff.reset();
    const rainbow = [
      new THREE.Color(0xff0000), new THREE.Color(0xffbb00), new THREE.Color(0xffff00), new THREE.Color(0x00ff00),
      new THREE.Color(0x0000ff), new THREE.Color(0x9400bd), new THREE.Color(0xc800eb)
    ];
    const subtract = 12;
    const strength = 1.2 / ((Math.sqrt(nb) - 1) / 4 + 1);
    for (let i = 0; i < nb; i++) {
      const ballx = Math.sin(i + 1.26 * t * (1.03 + 0.5 * Math.cos(0.21 * i))) * 0.27 + 0.5;
      const bally = Math.abs(Math.cos(i + 1.12 * t * Math.cos(1.22 + 0.1424 * i))) * 0.77;
      const ballz = Math.cos(i + 1.32 * t * 0.1 * Math.sin((0.92 + 0.53 * i))) * 0.27 + 0.5;
      if (materialName === 'multiColors') eff.addBall(ballx, bally, ballz, strength, subtract, rainbow[i % 7]);
      else eff.addBall(ballx, bally, ballz, strength, subtract);
    }
    if (floor) eff.addPlaneY(2, 12);
    if (wallz) eff.addPlaneZ(2, 12);
    if (wallx) eff.addPlaneX(2, 12);
    eff.update();
  });

  return React.createElement('group', { ref: groupRef });
}


