import * as THREE from 'three';

export interface ShaderToyUniforms {
  [uniform: string]: THREE.IUniform<any> | any;
  iTime: { value: number };
  iResolution: { value: THREE.Vector3 };
  iMouse: { value: THREE.Vector4 };
  iDate: { value: THREE.Vector4 };
  iFrameRate: { value: number };
  iChannel0: { value: THREE.Texture | null };
  iChannel1: { value: THREE.Texture | null };
  iChannel2: { value: THREE.Texture | null };
  iChannel3: { value: THREE.Texture | null };
}

export interface ShaderToyConfig {
  shaderCode: string;
  uniforms?: Partial<ShaderToyUniforms>;
  vertexShader?: string;
  fragmentShader?: string;
}

/**
 * Converts ShaderToy shader code to Three.js compatible shader
 */
export function convertShaderToyToThreeJS(config: ShaderToyConfig): {
  vertexShader: string;
  fragmentShader: string;
  uniforms: ShaderToyUniforms;
} {
  const {
    shaderCode,
    uniforms = {},
    vertexShader = `
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader = ''
  } = config;

  // Default ShaderToy uniforms
  const defaultUniforms: ShaderToyUniforms = {
    iTime: { value: 0.0 },
    iResolution: { value: new THREE.Vector3(1, 1, 1) },
    iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
    iDate: { value: new THREE.Vector4(0, 0, 0, 0) },
    iFrameRate: { value: 60.0 },
    iChannel0: { value: null },
    iChannel1: { value: null },
    iChannel2: { value: null },
    iChannel3: { value: null }
  };

  // Merge with provided uniforms
  const finalUniforms = { ...defaultUniforms, ...uniforms };

  // Process the shader code
  let processedShaderCode = shaderCode;

  // Replace ShaderToy-specific patterns
  processedShaderCode = processedShaderCode.replace(/void\s+mainImage\s*\(/g, 'void mainImage(');
  processedShaderCode = processedShaderCode.replace(/out\s+vec4\s+fragColor/g, 'out vec4 fragColor');
  processedShaderCode = processedShaderCode.replace(/in\s+vec2\s+fragCoord/g, 'in vec2 fragCoord');

  // Create the fragment shader
  const finalFragmentShader = `
    uniform float iTime;
    uniform vec3 iResolution;
    uniform vec4 iMouse;
    uniform vec4 iDate;
    uniform float iFrameRate;
    uniform sampler2D iChannel0;
    uniform sampler2D iChannel1;
    uniform sampler2D iChannel2;
    uniform sampler2D iChannel3;
    varying vec2 vUv;
    
    ${processedShaderCode}
    
    void main() {
      mainImage(gl_FragColor, gl_FragCoord.xy);
    }
  `;

  return {
    vertexShader,
    fragmentShader: finalFragmentShader,
    uniforms: finalUniforms
  };
}

/**
 * Creates a ShaderToy-compatible material
 */
export function createShaderToyMaterial(config: ShaderToyConfig): THREE.ShaderMaterial {
  const { vertexShader, fragmentShader, uniforms } = convertShaderToyToThreeJS(config);

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
}

/**
 * Updates ShaderToy uniforms with current state
 */
export function updateShaderToyUniforms(
  material: THREE.ShaderMaterial,
  time: number,
  resolution: { width: number; height: number },
  mouse?: { x: number; y: number; pressed: boolean }
): void {
  if (material.uniforms.iTime) {
    material.uniforms.iTime.value = time;
  }

  if (material.uniforms.iResolution) {
    material.uniforms.iResolution.value.set(resolution.width, resolution.height, 1);
  }

  if (material.uniforms.iMouse && mouse) {
    material.uniforms.iMouse.value.set(mouse.x, mouse.y, mouse.pressed ? 1 : 0, 0);
  }

  if (material.uniforms.iDate) {
    const now = new Date();
    material.uniforms.iDate.value.set(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
    );
  }
}

/**
 * Loads a ShaderToy shader from a URL or string
 */
export async function loadShaderToyShader(urlOrCode: string): Promise<string> {
  if (urlOrCode.startsWith('http')) {
    // Load from URL
    const response = await fetch(urlOrCode);
    return await response.text();
  } else {
    // Return the code directly
    return urlOrCode;
  }
}
