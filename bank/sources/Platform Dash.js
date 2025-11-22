// Sonomika template: "Platform Dash" — side-scrolling platformer effect inspired by classic platform games
const React = globalThis.React; const THREE = globalThis.THREE; const r3f = globalThis.r3f; const { useMemo, useRef, useState } = React || {};

export const metadata = {
  name: 'Platform Dash', description: 'Auto-running platformer visual: platforms, coins, enemies and jumps (Super Mario-esque).', category: 'Sources', author: 'AI', version: '1.0.0', isSource: true,
  parameters: [
    { name: 'tilesAcross', type: 'number', value: 40, min: 8, max: 200, step: 1 },
    { name: 'runSpeed', type: 'number', value: 6, min: 1, max: 30, step: 0.5 },
    { name: 'gravity', type: 'number', value: 28, min: 1, max: 80, step: 1 },
    { name: 'jumpStrength', type: 'number', value: 9, min: 2, max: 30, step: 0.5 },
    { name: 'tileSize', type: 'number', value: 0.12, min: 0.02, max: 1.0, step: 0.01 },
    { name: 'heroSize', type: 'number', value: 0.18, min: 0.05, max: 0.6, step: 0.01 },
    { name: 'colorSky', type: 'color', value: '#87CEEB' },
    { name: 'colorGround', type: 'color', value: '#8B5A2B' },
    { name: 'colorTile', type: 'color', value: '#CC7A00' },
    { name: 'colorHero', type: 'color', value: '#FF3366' },
    { name: 'colorCoin', type: 'color', value: '#FFD700' },
    { name: 'spawnEnemies', type: 'boolean', value: true },
    { name: 'enemySpeed', type: 'number', value: 1.8, min: 0.2, max: 6.0, step: 0.1 },
    { name: 'parallax', type: 'number', value: 0.5, min: 0, max: 1, step: 0.05 },
  ],
};

export default function PlatformDashSource({
  tilesAcross = 40, runSpeed = 6, gravity = 28, jumpStrength = 9, tileSize = 0.12, heroSize = 0.18,
  colorSky = '#87CEEB', colorGround = '#8B5A2B', colorTile = '#CC7A00', colorHero = '#FF3366', colorCoin = '#FFD700',
  spawnEnemies = true, enemySpeed = 1.8, parallax = 0.5,
}) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame, useThree } = r3f;
  const groupRef = useRef(null);
  const timeRef = useRef(0);
  const worldOffsetRef = useRef(0);
  const platformsRef = useRef([]);
  const coinsRef = useRef([]);
  const enemiesRef = useRef([]);
  const heroRef = useRef({ x: 0.25, y: 0, vy: 0, width: heroSize, height: heroSize, onGround: false, jumpCooldown: 0 });
  const scoreRef = useRef(0);
  const [tick, setTick] = useState(0);
  const { size } = useThree?.() || { size: { width: 1920, height: 1080 } };

  // Compute world extents and sensible sizes
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
  const planeW = aspect * 2;
  const planeH = 2;
  const cellWorldSize = Math.max(0.001, tileSize); // tile size as world units
  const visibleCols = Math.max(4, Math.floor(planeW / cellWorldSize));
  const worldBuffer = Math.max(6, Math.floor(tilesAcross * 0.5)); // extra columns to keep off-screen
  const halfW = planeW / 2, halfH = planeH / 2;

  // Geometries and materials
  const tileGeom = useMemo(() => new THREE.PlaneGeometry(cellWorldSize, cellWorldSize), [cellWorldSize]);
  const tileMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorTile), transparent: true });
    m.depthTest = false; m.depthWrite = false; m.side = THREE.DoubleSide; m.blending = THREE.AdditiveBlending;
    return m;
  }, [colorTile]);
  const groundMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorGround), transparent: true });
    m.depthTest = false; m.depthWrite = false; m.side = THREE.DoubleSide; return m;
  }, [colorGround]);
  const heroGeom = useMemo(() => new THREE.PlaneGeometry(heroSize, heroSize), [heroSize]);
  const heroMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHero), transparent: true });
    m.depthTest = false; m.depthWrite = false; m.side = THREE.DoubleSide; return m;
  }, [colorHero, heroSize]);
  const coinGeom = useMemo(() => new THREE.CircleGeometry(cellWorldSize * 0.35, 16), [cellWorldSize]);
  const coinMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorCoin), transparent: true });
    m.depthTest = false; m.depthWrite = false; m.side = THREE.DoubleSide; return m;
  }, [colorCoin]);
  const enemyGeom = useMemo(() => new THREE.PlaneGeometry(cellWorldSize * 0.9, cellWorldSize * 0.9), [cellWorldSize]);
  const enemyMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3333ff'), transparent: true });
    m.depthTest = false; m.depthWrite = false; m.side = THREE.DoubleSide; return m;
  }, []);

  // Initialize procedural world
  const initializedRef = useRef(false);
  function initWorld() {
    platformsRef.current = [];
    coinsRef.current = [];
    enemiesRef.current = [];
    worldOffsetRef.current = 0;
    scoreRef.current = 0;

    // Generate an initial strip of platforms: simple randomly gapped ground
    let x = -visibleCols / 2 - worldBuffer;
    const endX = visibleCols / 2 + worldBuffer + tilesAcross;
    while (x < endX) {
      // Decide if this column has ground tile
      const hasGround = (Math.random() > 0.12) || x < 0; // fewer early gaps
      const heightSteps = Math.max(1, Math.floor(planeH / cellWorldSize) - 3);
      const platformHeight = Math.floor(heightSteps / 4) + Math.floor(Math.random() * 2); // small variations
      if (hasGround) {
        platformsRef.current.push({ x, height: platformHeight });
        // place occasional coins above platform
        if (Math.random() < 0.25) {
          coinsRef.current.push({ x, yOffset: platformHeight + 0.8 + Math.random() * 1.2, collected: false });
        }
        // place enemies
        if (spawnEnemies && Math.random() < 0.08 && x > 0) {
          enemiesRef.current.push({ x, y: platformHeight + 0.5, dir: Math.random() > 0.5 ? 1 : -1, speed: enemySpeed * (0.7 + Math.random() * 0.6) });
        }
      }
      x += 1;
    }
  }

  function spawnAheadIfNeeded() {
    // Spawn columns at the right edge as world scrolls
    const rightmost = platformsRef.current.length ? Math.max(...platformsRef.current.map(p => p.x)) : -visibleCols / 2;
    while (rightmost < worldOffsetRef.current + tilesAcross + visibleCols / 2) {
      const nextX = rightmost + 1;
      const hasGround = Math.random() > 0.14;
      if (hasGround) {
        const heightSteps = Math.max(1, Math.floor(planeH / cellWorldSize) - 3);
        const platformHeight = Math.floor(1 + Math.random() * Math.max(1, Math.floor(heightSteps / 3)));
        platformsRef.current.push({ x: nextX, height: platformHeight });
        if (Math.random() < 0.22) coinsRef.current.push({ x: nextX, yOffset: platformHeight + 0.9 + Math.random() * 1.4, collected: false });
        if (spawnEnemies && Math.random() < 0.06 && nextX > 0) enemiesRef.current.push({ x: nextX, y: platformHeight + 0.5, dir: Math.random() > 0.5 ? 1 : -1, speed: enemySpeed * (0.8 + Math.random() * 0.5) });
      } else {
        // gap - maybe a floating coin line
        if (Math.random() < 0.15) {
          const h = Math.floor(1 + Math.random() * 2);
          coinsRef.current.push({ x: nextX, yOffset: h + 1.5, collected: false });
        }
      }
      // move rightmost variable forward
      rightmost = nextX;
    }
  }

  function cleanupLeft() {
    const leftLimit = worldOffsetRef.current - visibleCols / 2 - worldBuffer;
    platformsRef.current = platformsRef.current.filter(p => p.x >= leftLimit);
    coinsRef.current = coinsRef.current.filter(c => c.x >= leftLimit && !c._removed);
    enemiesRef.current = enemiesRef.current.filter(e => e.x >= leftLimit - 2);
  }

  function worldToScreenX(wx) {
    // Given a world column x, convert to world-space position
    const localX = (wx - worldOffsetRef.current) * cellWorldSize;
    return localX;
  }
  function colToScreenPos(xCol, yMult = 0.5) {
    const sx = (xCol - worldOffsetRef.current) * cellWorldSize;
    // platform base is near bottom: set a ground baseline
    const groundY = -halfH + cellWorldSize * 1.0;
    const sy = groundY + yMult * cellWorldSize;
    return [sx, sy, 0];
  }

  function tryAutoJump() {
    // autoplayer logic: jump when next few columns are gap or enemy ahead on same height
    const hero = heroRef.current;
    // hero world column
    const heroCol = Math.round(worldOffsetRef.current + (hero.x + halfW) / cellWorldSize);
    // check next columns
    for (let look = 1; look <= 3; look++) {
      const checkCol = heroCol + look;
      const platform = platformsRef.current.find(p => p.x === checkCol);
      if (!platform) return true; // gap ahead -> jump
      // check enemy on that col near hero vertical
      for (const e of enemiesRef.current) {
        if (Math.round(e.x) === checkCol) {
          // if enemy at same platform height, try to jump early
          return true;
        }
      }
    }
    return false;
  }

  // Initialize once
  useFrame(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      initWorld();
    }
  }, 0);

  // Main simulation frame
  useFrame((_, delta) => {
    if (!initializedRef.current) return;
    timeRef.current += delta;
    const hero = heroRef.current;

    // Scroll world
    const scrollAmount = runSpeed * delta;
    worldOffsetRef.current += scrollAmount;

    // Spawn and cleanup
    spawnAheadIfNeeded();
    cleanupLeft();

    // Update enemies
    for (const e of enemiesRef.current) {
      e.x -= (e.dir * e.speed * delta); // enemy moves relative to world (leftwards world means subtract)
      // bounce when no platform ahead
      const belowCol = Math.round(e.x);
      const frontCol = Math.round(e.x + (e.dir > 0 ? 0.5 : -0.5));
      const hasGroundFront = platformsRef.current.some(p => p.x === frontCol);
      if (!hasGroundFront) e.dir *= -1;
      // keep enemies roughly on platform height (snap)
      const p = platformsRef.current.find(p => p.x === Math.round(e.x));
      if (p) e.y = p.height + 0.5;
    }

    // Hero physics: x is fraction of screen (keep near left-center)
    const screenGoalX = -halfW + planeW * 0.35; // fixed screen x position for hero
    hero.x = (screenGoalX + halfW) / planeW * planeW; // maintain constant; actual horizontal motion is simulated by world offset

    // Vertical physics
    hero.vy -= gravity * delta;
    hero.y += hero.vy * delta;

    // Ground collision: compute platform under hero's column
    const heroWorldCol = Math.round(worldOffsetRef.current + (hero.x + halfW) / cellWorldSize);
    const platformUnder = platformsRef.current.find(p => p.x === heroWorldCol);
    const groundY = -halfH + cellWorldSize * ( (platformUnder ? platformUnder.height : 0) + 0.5 );
    if (hero.y <= groundY) {
      hero.y = groundY;
      hero.vy = 0;
      hero.onGround = true;
      if (hero.jumpCooldown <= 0) {
        // auto-jump decision
        const shouldJump = tryAutoJump() && Math.random() > 0.12;
        if (shouldJump) {
          hero.vy = jumpStrength;
          hero.onGround = false;
          hero.jumpCooldown = 0.18 + Math.random() * 0.12;
        }
      }
    } else {
      hero.onGround = false;
    }
    hero.jumpCooldown = Math.max(0, hero.jumpCooldown - delta);

    // Coins: check collection
    for (const c of coinsRef.current) {
      if (c.collected) continue;
      const dx = (c.x - worldOffsetRef.current) * cellWorldSize - (hero.x - (-halfW));
      const coinY = -halfH + cellWorldSize * 1.0 + (c.yOffset * cellWorldSize);
      const dy = coinY - hero.y;
      if (Math.abs(dx) < (hero.width * 0.5 + cellWorldSize * 0.4) && Math.abs(dy) < (hero.height * 0.5 + cellWorldSize * 0.5)) {
        c.collected = true;
        c._removed = true;
        scoreRef.current += 1;
      }
    }

    // Enemies: collision detection
    for (const e of enemiesRef.current) {
      const ex = (e.x - worldOffsetRef.current) * cellWorldSize;
      const ey = -halfH + cellWorldSize * 1.0 + (e.y * cellWorldSize);
      const dx = ex - (hero.x - (-halfW));
      const dy = ey - hero.y;
      if (Math.abs(dx) < (hero.width * 0.6 + cellWorldSize * 0.45) && Math.abs(dy) < (hero.height * 0.6 + cellWorldSize * 0.45)) {
        // if hero is falling and above enemy -> stomp
        if (hero.vy < -3) {
          // stomp enemy
          e._removed = true;
          scoreRef.current += 3;
          hero.vy = jumpStrength * 0.45; // bounce
        } else {
          // hit by enemy -> reset a little: bump back worldOffset
          worldOffsetRef.current -= Math.min(1.5, runSpeed * 0.9);
          hero.vy = -jumpStrength * 0.2;
        }
      }
    }

    // Remove flagged items
    enemiesRef.current = enemiesRef.current.filter(e => !e._removed);
    coinsRef.current = coinsRef.current.filter(c => !c._removed);

    // Slight parallax: background offset stored indirectly via worldOffsetRef
    setTick(t => (t + 1) % 1000000);
  });

  // Render
  // Background sky rectangle
  const bgGeom = useMemo(() => new THREE.PlaneGeometry(planeW, planeH), [planeW, planeH]);
  const skyMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorSky), transparent: true });
    m.depthTest = false; m.depthWrite = false; m.side = THREE.DoubleSide; return m;
  }, [colorSky]);

  // Prepare arrays for rendering meshes
  const platformMeshes = [];
  for (let i = 0; i < platformsRef.current.length; i++) {
    const p = platformsRef.current[i];
    // stack tiles vertically up to p.height
    for (let h = 0; h < p.height; h++) {
      const px = (p.x - worldOffsetRef.current) * cellWorldSize;
      const py = -halfH + cellWorldSize * (0.5 + h);
      platformMeshes.push({ key: `tile-${i}-${h}-${p.x}`, pos: [px, py, 0] });
    }
  }

  const coinMeshes = [];
  for (let i = 0; i < coinsRef.current.length; i++) {
    const c = coinsRef.current[i];
    if (c.collected) continue;
    const cx = (c.x - worldOffsetRef.current) * cellWorldSize;
    const cy = -halfH + cellWorldSize * 1.0 + (c.yOffset * cellWorldSize);
    coinMeshes.push({ key: `coin-${i}-${c.x}`, pos: [cx, cy, 0] });
  }

  const enemyMeshes = [];
  for (let i = 0; i < enemiesRef.current.length; i++) {
    const e = enemiesRef.current[i];
    const ex = (e.x - worldOffsetRef.current) * cellWorldSize;
    const ey = -halfH + cellWorldSize * 1.0 + (e.y * cellWorldSize);
    enemyMeshes.push({ key: `enemy-${i}-${e.x.toFixed(2)}`, pos: [ex, ey, 0], rot: 0 });
  }

  // Hero mesh position
  const hero = heroRef.current;
  const heroScreenX = (-halfW) + planeW * 0.35; // consistent with simulation
  const heroPos = [heroScreenX, hero.y, 0];

  // Ground strip (a base plane for visual)
  const groundY = -halfH + cellWorldSize * 0.5;
  const groundGeom = useMemo(() => new THREE.PlaneGeometry(planeW, cellWorldSize * 2), [planeW, cellWorldSize]);
  const groundPos = [0, groundY - cellWorldSize * 0.5, 0];

  // Parallax decorative rectangles (clouds/hills)
  const parallaxItems = [];
  const parallaxCount = 6;
  for (let i = 0; i < parallaxCount; i++) {
    const factor = (i / parallaxCount) * parallax;
    const px = ((i * 2.3) % 7 - 3.5) - (worldOffsetRef.current * factor * 0.2);
    const py = halfH * 0.4 - (i % 3) * 0.25;
    parallaxItems.push({ key: `para-${i}`, pos: [px, py, -0.1], scale: 0.8 + (i % 3) * 0.6 });
  }

  return React.createElement('group', { ref: groupRef, position: [0, 0, 0] },
    // Sky background
    React.createElement('mesh', { key: 'sky', geometry: bgGeom, material: skyMat, position: [0, 0, -0.5] }),

    // Parallax shapes
    parallaxItems.map(p => React.createElement('mesh', {
      key: p.key, geometry: new THREE.PlaneGeometry(cellWorldSize * p.scale * 6, cellWorldSize * p.scale * 2),
      material: new THREE.MeshBasicMaterial({ color: new THREE.Color('#CDE9FF'), transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      position: p.pos
    })),

    // Ground base
    React.createElement('mesh', { key: 'ground', geometry: groundGeom, material: groundMat, position: groundPos }),

    // Platform tiles
    platformMeshes.map(pm => React.createElement('mesh', { key: pm.key, geometry: tileGeom, material: tileMat, position: pm.pos })),

    // Coins
    coinMeshes.map(c => React.createElement('mesh', { key: c.key, geometry: coinGeom, material: coinMat, position: c.pos })),

    // Enemies
    enemyMeshes.map(en => React.createElement('mesh', { key: en.key, geometry: enemyGeom, material: enemyMat, position: en.pos })),

    // Hero
    React.createElement('mesh', { key: `hero-${tick}`, geometry: heroGeom, material: heroMat, position: heroPos }),

    // Simple HUD (score) as small tile cluster near top-left
    React.createElement('group', { key: 'hud', position: [-halfW + 0.15, halfH - 0.18, 0] },
      React.createElement('mesh', { key: 'hud-bg', geometry: new THREE.PlaneGeometry(0.6, 0.18), material: new THREE.MeshBasicMaterial({ color: new THREE.Color('#000000'), transparent: true, opacity: 0.25, depthTest: false, depthWrite: false, side: THREE.DoubleSide }) }),
      // Score indicator reproduced by small tiles equal to score modulo a small number
      Array.from({ length: Math.min(12, Math.max(0, scoreRef.current % 100)) }).map((_, i) =>
        React.createElement('mesh', {
          key: `score-${i}`, geometry: new THREE.PlaneGeometry(0.04, 0.04),
          material: new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFFF88'), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
          position: [ -0.25 + i * 0.04, 0, 0.01 ]
        })
      )
    )
  );
}