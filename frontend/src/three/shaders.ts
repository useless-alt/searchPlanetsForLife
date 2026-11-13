/** Процедурные GLSL-шейдеры: без текстур и внешних моделей. */

const NOISE = `
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = dot(hash33(i + vec3(0.0, 0.0, 0.0)), vec3(1.0));
  float n100 = dot(hash33(i + vec3(1.0, 0.0, 0.0)), vec3(1.0));
  float n010 = dot(hash33(i + vec3(0.0, 1.0, 0.0)), vec3(1.0));
  float n110 = dot(hash33(i + vec3(1.0, 1.0, 0.0)), vec3(1.0));
  float n001 = dot(hash33(i + vec3(0.0, 0.0, 1.0)), vec3(1.0));
  float n101 = dot(hash33(i + vec3(1.0, 0.0, 1.0)), vec3(1.0));
  float n011 = dot(hash33(i + vec3(0.0, 1.0, 1.0)), vec3(1.0));
  float n111 = dot(hash33(i + vec3(1.0, 1.0, 1.0)), vec3(1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * vnoise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}
`;

export const planetVertex = `
varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;
void main() {
  vObjPos = position;
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const planetFragment = `
precision mediump float;
uniform float uTime;
uniform float uSeed;
uniform vec3 uBase;
uniform vec3 uAccent;
uniform vec3 uWater;
uniform vec3 uLightPos;
uniform float uType;
varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;
${NOISE}

void main() {
  vec3 p = vObjPos * 2.6 + vec3(uSeed);
  float h = fbm(p);
  float detail = fbm(p * 3.4);
  vec3 color = uBase;
  vec3 emissive = vec3(0.0);

  if (uType < 0.5) {
    // Землеподобная: океан + континенты + полярные шапки
    float land = smoothstep(0.47, 0.56, h);
    color = mix(uWater, uBase, land);
    color = mix(color, uAccent, smoothstep(0.62, 0.82, h) * 0.55);
    float ice = smoothstep(0.74, 0.92, abs(vObjPos.y));
    color = mix(color, vec3(0.88, 0.95, 1.0), ice);
  } else if (uType < 1.5) {
    // Пустынная
    float dunes = sin(vObjPos.y * 18.0 + detail * 6.0) * 0.5 + 0.5;
    color = mix(uBase, uAccent, dunes * 0.5 + h * 0.4);
    color = mix(color, vec3(0.96, 0.82, 0.62), smoothstep(0.66, 0.9, h) * 0.35);
  } else if (uType < 2.5) {
    // Лавовая
    float cracks = smoothstep(0.52, 0.63, h);
    color = mix(vec3(0.05, 0.03, 0.03), uBase, detail);
    emissive = uAccent * cracks * 1.5;
  } else if (uType < 3.5) {
    // Ледяная
    color = mix(uBase, uAccent, smoothstep(0.43, 0.68, h));
    color = mix(color, vec3(0.95, 0.99, 1.0), smoothstep(0.72, 0.9, detail) * 0.4);
  } else {
    // Газовые/мини-нептуны: полосы
    float bands = sin(vObjPos.y * 13.0 + fbm(p * 0.8) * 4.0 + uSeed) * 0.5 + 0.5;
    color = mix(uBase, uAccent, bands * 0.7 + detail * 0.3);
    if (uType > 5.5) {
      color = mix(color, vec3(1.0, 0.94, 0.82), smoothstep(0.7, 0.95, bands) * 0.25);
    }
  }

  vec3 lightDir = normalize(uLightPos - vPosW);
  float diff = max(dot(normalize(vNormalW), lightDir), 0.0);
  float rim = pow(1.0 - max(dot(normalize(vNormalW), normalize(cameraPosition - vPosW)), 0.0), 2.4);
  vec3 lit = color * (0.16 + diff * 1.05);
  lit += emissive * (0.55 + diff * 0.65);
  lit += uAccent * rim * 0.08;
  gl_FragColor = vec4(lit, 1.0);
}
`;

export const cloudFragment = `
precision mediump float;
uniform float uTime;
uniform float uSeed;
uniform vec3 uColor;
uniform vec3 uLightPos;
varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vPosW;
${NOISE}

void main() {
  float clouds = fbm(vObjPos * 3.1 + vec3(uSeed + uTime * 0.012));
  float alpha = smoothstep(0.56, 0.76, clouds) * 0.75;
  if (alpha < 0.02) discard;
  vec3 lightDir = normalize(uLightPos - vPosW);
  float diff = max(dot(normalize(vNormalW), lightDir), 0.0);
  vec3 color = uColor * (0.22 + diff * 1.05);
  gl_FragColor = vec4(color, alpha);
}
`;

export const atmosphereVertex = `
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const atmosphereFragment = `
precision mediump float;
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 viewDir = normalize(cameraPosition - vPosW);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 2.2);
  gl_FragColor = vec4(uColor * fresnel * uIntensity, fresnel * 0.55 * uIntensity);
}
`;

export const starFragment = `
precision mediump float;
uniform float uTime;
uniform vec3 uColor;
uniform float uSeed;
varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vPosW;
${NOISE}

void main() {
  float plasma = fbm(vObjPos * 5.0 + vec3(uSeed, uTime * 0.05, 0.0));
  float granulation = fbm(vObjPos * 14.0 - vec3(0.0, uTime * 0.03, uSeed));
  float brightness = 0.78 + plasma * 0.45 + granulation * 0.18;
  vec3 viewDir = normalize(cameraPosition - vPosW);
  float limb = pow(max(dot(normalize(vNormalW), viewDir), 0.0), 0.35);
  vec3 color = uColor * brightness * (0.65 + 0.45 * limb);
  gl_FragColor = vec4(color, 1.0);
}
`;

export const starVertex = `
varying vec3 vObjPos;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vObjPos = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
