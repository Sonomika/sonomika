// sonomika template
const React = globalThis.React;
const THREE = globalThis.THREE;
const r3f = globalThis.r3f;
const { useRef, useMemo, useEffect } = React || {};

export const metadata = {
  name: 'Matrix Numbers',
  description: 'Floating numbers with dynamic connections in 3D space.',
  category: 'Sources',
  author: 'VJ',
  version: '1.0.0',
  folder: 'sources',
  isSource: true,
  parameters: [
    { name: 'nodeCount', type: 'number', value: 140, min: 30, max: 200, step: 10 },
    { name: 'connectionDistance', type: 'number', value: 7.0, min: 2.0, max: 8.0, step: 0.5 },
    { name: 'numberSize', type: 'number', value: 0.9, min: 0.2, max: 1.5, step: 0.1 },
    { name: 'animationSpeed', type: 'number', value: 0.4, min: 0.1, max: 3.0, step: 0.1 },
    { name: 'colorIntensity', type: 'number', value: 1.6, min: 0.3, max: 2.0, step: 0.1 },
    { name: 'spaceSize', type: 'number', value: 13, min: 4, max: 15, step: 1 },
    { name: 'numberChangeSpeed', type: 'number', value: 1.2, min: 0.2, max: 3.0, step: 0.1 },
  ],
};

// Create text texture for a number
function createNumberTexture(number, color, size) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = Math.max(64, size * 128);
  canvas.width = fontSize;
  canvas.height = fontSize;
  
  // Clear canvas with transparent background (no black box)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
  ctx.fillText(number.toString(), canvas.width / 2, canvas.height / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function MatrixNumbersSource({ opacity = 1, nodeCount = 140, connectionDistance = 7.0, numberSize = 0.9, animationSpeed = 0.4, colorIntensity = 1.6, spaceSize = 13, flowSpeed = 2.0, numberChangeSpeed = 1.2 }) {
  if (!React || !THREE || !r3f) return null;
  const { useFrame } = r3f;
  const groupRef = useRef(null);
  const nodesRef = useRef([]);
  const linesRef = useRef(null);
  const spritesRef = useRef([]);
  const spriteGroupRef = useRef(null);

  const initialNodes = useMemo(() => {
    const arr = [];
    for (let i = 0; i < nodeCount; i++) {
      const position = new THREE.Vector3((Math.random()-0.5)*spaceSize, (Math.random()-0.5)*spaceSize, (Math.random()-0.5)*spaceSize);
      const velocity = new THREE.Vector3((Math.random()-0.5)*animationSpeed*0.5, (Math.random()-0.5)*animationSpeed*0.5, (Math.random()-0.5)*animationSpeed*0.5);
      const number = Math.floor(Math.random()*10);
      const color = new THREE.Color().setHSL(0.3 + Math.random()*0.1, 0.8, 0.5 + Math.random()*0.3);
      arr.push({ id: i, position, velocity, number, color, phase: Math.random()*Math.PI*2, lastNumberChange: 0, size: numberSize*(0.8+Math.random()*0.4) });
    }
    nodesRef.current = arr; return arr;
  }, [nodeCount, spaceSize, numberSize, animationSpeed]);

  const connectionLines = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    // Make lines more visible with brighter color and higher opacity
    const material = new THREE.LineBasicMaterial({ 
      color: 0x00ff44, 
      transparent: true, 
      opacity: 0.5, 
      depthTest: true, 
      depthWrite: false,
      linewidth: 1
    });
    // Allocate enough space for potential connections (each node could connect to all others)
    const maxConnections = nodeCount * (nodeCount - 1) / 2;
    const positions = new Float32Array(maxConnections * 6);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.LineSegments(geometry, material);
  }, [nodeCount]);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    if (!nodesRef.current.length) return;
    nodesRef.current.forEach((node, idx) => {
      node.position.add(node.velocity.clone().multiplyScalar(delta));
      const floating = new THREE.Vector3(
        Math.sin(time*animationSpeed + node.phase)*0.1,
        Math.cos(time*animationSpeed*1.3 + node.phase)*0.1,
        Math.sin(time*animationSpeed*0.7 + node.phase)*0.1
      );
      if (Math.abs(node.position.x) > spaceSize/2) { node.velocity.x *= -1; node.position.x = Math.sign(node.position.x) * (spaceSize/2 - 0.1); }
      if (Math.abs(node.position.y) > spaceSize/2) { node.velocity.y *= -1; node.position.y = Math.sign(node.position.y) * (spaceSize/2 - 0.1); }
      if (Math.abs(node.position.z) > spaceSize/2) { node.velocity.z *= -1; node.position.z = Math.sign(node.position.z) * (spaceSize/2 - 0.1); }
      if (time - node.lastNumberChange > numberChangeSpeed) { 
        node.number = Math.floor(Math.random()*10); 
        node.lastNumberChange = time;
        // Update sprite texture when number changes
        const sprite = spritesRef.current[idx];
        if (sprite && sprite.userData.texture) {
          sprite.userData.texture.dispose();
          sprite.userData.texture = createNumberTexture(node.number, node.color, node.size);
          sprite.userData.material.map = sprite.userData.texture;
          sprite.userData.material.needsUpdate = true;
        }
      }
      const bpm = (globalThis && globalThis.VJ_BPM) || 120;
      const bpmPulse = Math.sin(time * (bpm/60) * Math.PI * 2 + idx * 0.5) * 0.3 + 0.7;
      node.currentOpacity = opacity * bpmPulse * colorIntensity;
      
      // Update sprite position and opacity
      const sprite = spritesRef.current[idx];
      if (sprite) {
        sprite.position.copy(node.position);
        sprite.scale.set(node.size, node.size, 1);
        if (sprite.userData.material) {
          sprite.userData.material.opacity = node.currentOpacity || opacity;
        }
      }
    });

    if (linesRef.current) {
      const positions = [];
      const connected = new Set(); // Track which nodes have connections
      
      // First pass: connect nodes within connectionDistance
      for (let i=0;i<nodesRef.current.length;i++) {
        for (let j=i+1;j<nodesRef.current.length;j++) {
          const a = nodesRef.current[i]; 
          const b = nodesRef.current[j]; 
          const dist = a.position.distanceTo(b.position);
          if (dist < connectionDistance) { 
            positions.push(a.position.x, a.position.y, a.position.z, b.position.x, b.position.y, b.position.z);
            connected.add(i);
            connected.add(j);
          }
        }
      }
      
      // Second pass: ensure every node has at least one connection
      // Connect each unconnected node to its nearest neighbor
      for (let i=0;i<nodesRef.current.length;i++) {
        if (!connected.has(i)) {
          let nearestIdx = -1;
          let nearestDist = Infinity;
          const a = nodesRef.current[i];
          
          for (let j=0;j<nodesRef.current.length;j++) {
            if (i === j) continue;
            const b = nodesRef.current[j];
            const dist = a.position.distanceTo(b.position);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestIdx = j;
            }
          }
          
          if (nearestIdx >= 0) {
            const b = nodesRef.current[nearestIdx];
            positions.push(a.position.x, a.position.y, a.position.z, b.position.x, b.position.y, b.position.z);
            connected.add(i);
            connected.add(nearestIdx);
          }
        }
      }
      
      const attr = linesRef.current.geometry.getAttribute('position');
      if (attr) { 
        // Update positions in the buffer
        const neededLength = positions.length;
        const bufferLength = attr.array.length;
        
        if (neededLength <= bufferLength) {
          // Buffer is large enough, just update values
          for (let i=0;i<neededLength;i++) { 
            attr.array[i] = positions[i]; 
          }
          // Zero out unused positions
          for (let i=neededLength;i<bufferLength;i++) {
            attr.array[i] = 0;
          }
        } else {
          // Buffer too small - create new one (shouldn't happen often)
          const newArray = new Float32Array(neededLength);
          for (let i=0;i<neededLength;i++) {
            newArray[i] = positions[i];
          }
          linesRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(newArray, 3));
        }
        
        attr.needsUpdate = true; 
        linesRef.current.geometry.setDrawRange(0, positions.length / 3); 
      }
      if (linesRef.current.material && linesRef.current.material.opacity !== undefined) { 
        linesRef.current.material.opacity = 0.5 * opacity * colorIntensity; 
      }
    }
  });

  // Create sprites for numbers
  useEffect(() => {
    if (!nodesRef.current.length) return;
    
    const spriteGroup = new THREE.Group();
    spriteGroupRef.current = spriteGroup;
    const sprites = [];
    
    nodesRef.current.forEach((node) => {
      const texture = createNumberTexture(node.number, node.color, node.size);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(node.position);
      sprite.scale.set(node.size, node.size, 1);
      sprite.userData.nodeId = node.id;
      sprite.userData.texture = texture;
      sprite.userData.material = material;
      spriteGroup.add(sprite);
      sprites.push(sprite);
    });
    
    spritesRef.current = sprites;
    if (groupRef.current) {
      groupRef.current.add(spriteGroup);
    }
    
    return () => {
      // Cleanup
      sprites.forEach((sprite) => {
        if (sprite.userData.texture) sprite.userData.texture.dispose();
        if (sprite.userData.material) sprite.userData.material.dispose();
        spriteGroup.remove(sprite);
      });
      if (groupRef.current && spriteGroup.parent === groupRef.current) {
        groupRef.current.remove(spriteGroup);
      }
      spritesRef.current = [];
    };
  }, [nodeCount, numberSize]);

  return React.createElement('group', { ref: groupRef }, 
    React.createElement('primitive', { object: connectionLines, ref: linesRef }),
    spriteGroupRef.current ? React.createElement('primitive', { object: spriteGroupRef.current }) : null
  );
}


