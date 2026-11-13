import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Eye, HelpCircle, Maximize2, Orbit, RotateCcw, Sparkles } from 'lucide-react';
import type { PlanetEntity } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { cn, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { blackbodyColor } from './blackbody';
import {
  atmosphereFragment,
  atmosphereVertex,
  cloudFragment,
  planetFragment,
  planetVertex,
  starFragment,
  starVertex,
} from './shaders';

type PlanetKind = 'earth' | 'desert' | 'lava' | 'ice' | 'mini' | 'iceGiant' | 'gas';

const KIND_COLORS: Record<PlanetKind, { base: string; accent: string; water: string; type: number }> = {
  earth: { base: '#3f8f5f', accent: '#9fbf7f', water: '#154c8a', type: 0 },
  desert: { base: '#b5793f', accent: '#e0b071', water: '#6b4a26', type: 1 },
  lava: { base: '#5c2418', accent: '#ff5a1f', water: '#2a0d08', type: 2 },
  ice: { base: '#bfe9ff', accent: '#6fb7d9', water: '#e8f7ff', type: 3 },
  mini: { base: '#4f7fbf', accent: '#8fc3e8', water: '#234a7a', type: 4 },
  iceGiant: { base: '#5aa9d6', accent: '#aee6ff', water: '#2b6d94', type: 5 },
  gas: { base: '#b58a5a', accent: '#f3e3c0', water: '#6e4e2f', type: 6 },
};

const AU_SCALE = 60;
const OVERVIEW_MIN = 2.4;
const OVERVIEW_RANGE = 8.0;
const OVERVIEW_REF = 10;

export function classifyPlanet(radius: number, ts: number | null): PlanetKind {
  if (radius < 1.6) {
    if (ts === null) return 'earth';
    if (ts < 230) return 'ice';
    if (ts < 330) return 'earth';
    if (ts < 450) return 'desert';
    return 'lava';
  }
  if (radius < 4) return 'mini';
  if (radius < 8) return 'iceGiant';
  return 'gas';
}

function overviewRadius(a: number): number {
  const value = Math.max(a, 0.004);
  return OVERVIEW_MIN + (OVERVIEW_RANGE * Math.log10(1 + value / 0.03)) / Math.log10(1 + OVERVIEW_REF / 0.03);
}

function planetSize(radius: number, real: boolean): number {
  if (real) return radius * 4.26e-5 * AU_SCALE;
  return 0.24 * Math.pow(radius, 0.38);
}

function starSize(starRadius: number | null, real: boolean): number {
  const r = starRadius ?? 1;
  if (real) return r * 0.00465 * AU_SCALE;
  return 1.7 + 0.45 * Math.log10(r + 1);
}

function seeded(seed: number): () => number {
  let state = Math.floor(seed * 1_000_000) + 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function Dust({ center, radius, seed }: { center: [number, number, number]; radius: number; seed: number }) {
  const geometry = useMemo(() => {
    const random = seeded(seed);
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const shell = radius * (1.15 + random() * 0.9);
      positions[i * 3] = shell * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = shell * Math.cos(phi);
      positions[i * 3 + 2] = shell * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [radius, seed]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points position={center} geometry={geometry}>
      <pointsMaterial size={radius * 0.09} color="#6b7280" transparent opacity={0.45} depthWrite={false} />
    </points>
  );
}

function CameraRig({
  real,
  planetPosition,
  planetRadius,
  orbitRadius,
  resetToken,
  controlsRef,
}: {
  real: boolean;
  planetPosition: [number, number, number];
  planetRadius: number;
  orbitRadius: number;
  resetToken: number;
  controlsRef: React.RefObject<OrbitControlsImpl>;
}) {
  const { camera } = useThree();
  const destination = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const flying = useRef(true);
  const lastReset = useRef(-1);

  useEffect(() => {
    if (real) {
      const point = new THREE.Vector3(...planetPosition);
      target.current.copy(point);
      const distance = Math.max(planetRadius * 6.5, 0.012);
      destination.current.copy(point).add(new THREE.Vector3(distance, distance * 0.45, distance * 0.9));
    } else {
      target.current.set(0, 0, 0);
      const distance = Math.max(12, orbitRadius * 2.1);
      destination.current.set(0, distance * 0.55, distance);
    }
    flying.current = true;
    lastReset.current = resetToken;
  }, [real, planetPosition, planetRadius, orbitRadius, resetToken]);

  useFrame((_, delta) => {
    if (!flying.current) return;
    const step = 1 - Math.pow(0.002, Math.min(delta, 0.05) * 4);
    camera.position.lerp(destination.current, step);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(target.current, step);
      controls.update();
    }
    if (camera.position.distanceTo(destination.current) < Math.max(0.0005, planetRadius * 0.02)) {
      camera.position.copy(destination.current);
      if (controls) {
        controls.target.copy(target.current);
        controls.update();
      }
      flying.current = false;
    }
  });

  return null;
}

function SceneDispose() {
  const { scene } = useThree();
  useEffect(
    () => () => {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) {
          const map = (material as THREE.MeshBasicMaterial).map;
          if (map) map.dispose();
          material.dispose();
        }
      });
    },
    [scene],
  );
  return null;
}

function StubLabel({
  missing,
  position,
  name,
}: {
  missing: string[];
  position: [number, number, number];
  name: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <group position={position}>
      <Dust center={[0, 0, 0]} radius={0.3} seed={name.length * 1.37 + 2.1} />
      <mesh
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.25, 24, 24]} />
        <meshStandardMaterial color="#2b3038" roughness={0.9} metalness={0.1} />
      </mesh>
      <Html position={[0, 0.42, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col items-center gap-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-500/50 bg-space-900/90 text-sm text-slate-300">
            ?
          </span>
          <span className="whitespace-nowrap rounded border border-slate-500/30 bg-space-950/85 px-1.5 py-0.5 text-[9px] text-slate-400">
            недостаточно данных для отрисовки
          </span>
          {hovered && (
            <span className="max-w-[220px] rounded border border-slate-500/30 bg-space-950/95 px-2 py-1 text-[9px] leading-relaxed text-slate-300">
              {name}: не хватает {missing.join(', ')}
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

function SystemContent({ entity, real, showOrbit, showHz, resetToken }: {
  entity: PlanetEntity;
  real: boolean;
  showOrbit: boolean;
  showHz: boolean;
  resetToken: number;
}) {
  const bound = useAppStore((s) => s.model.hzBound);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const c = entity.computed;

  const starTeff = c.starTeff;
  const starRadius = c.starRadius;
  const starKnown = starTeff !== null || starRadius !== null;
  const starColor = blackbodyColor(starTeff);

  const a = c.semiMajorAxis;
  const orbitRadius = a === null ? OVERVIEW_MIN : real ? a * AU_SCALE : overviewRadius(a);
  const e = Math.min(0.95, Math.max(0, c.eccentricity ?? 0));
  const b = orbitRadius * Math.sqrt(Math.max(0.0001, 1 - e * e));
  const angle = 0.9;
  const px = orbitRadius * (Math.cos(angle) - e);
  const pz = b * Math.sin(angle);
  const planetPosition: [number, number, number] = [px, 0, pz];

  const radiusUsed = c.radiusUsed;
  const ts = c.ts;
  // Заглушка — только при k < 3 или отсутствии R/T_s; без a планету всё равно можно показать.
  const insufficient = c.insufficientData || radiusUsed === null || ts === null;
  const kind = radiusUsed !== null ? classifyPlanet(radiusUsed, ts) : null;
  const colors = kind ? KIND_COLORS[kind] : null;
  const planetR = radiusUsed !== null ? planetSize(radiusUsed, real) : 0.25;
  const starR = starSize(starRadius, real);
  const locked = (c.period !== null && c.period < 10) || (starTeff !== null && starTeff < 3900);

  const orbitPoints = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i <= 180; i += 1) {
      const E = (i / 180) * Math.PI * 2;
      points.push([orbitRadius * (Math.cos(E) - e), 0, b * Math.sin(E)]);
    }
    return points;
  }, [orbitRadius, e, b]);

  const hzIn = bound === 'optimistic' ? c.dInOpt : c.dIn;
  const hzOut = bound === 'optimistic' ? c.dOutOpt : c.dOut;
  const hzInner = hzIn === null ? null : real ? hzIn * AU_SCALE : overviewRadius(hzIn);
  const hzOuter = hzOut === null ? null : real ? hzOut * AU_SCALE : overviewRadius(hzOut);
  const hzVisible = showHz && hzInner !== null && hzOuter !== null && hzOuter > hzInner;

  const planetRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (planetRef.current) {
      if (locked) planetRef.current.rotation.y = -angle;
      else planetRef.current.rotation.y += delta * 0.12;
    }
    if (cloudRef.current) cloudRef.current.rotation.y += delta * (locked ? 0.004 : 0.018);
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSeed: { value: entity.id.length * 0.37 + (radiusUsed ?? 1) * 0.11 },
      uBase: { value: new THREE.Color(colors?.base ?? '#333') },
      uAccent: { value: new THREE.Color(colors?.accent ?? '#555') },
      uWater: { value: new THREE.Color(colors?.water ?? '#222') },
      uLightPos: { value: new THREE.Vector3(0, 0, 0) },
      uType: { value: colors?.type ?? 0 },
    }),
    [colors, entity.id, radiusUsed],
  );

  const cloudUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSeed: { value: (radiusUsed ?? 1) * 2.1 },
      uColor: { value: new THREE.Color('#e8f2ff') },
      uLightPos: { value: new THREE.Vector3(0, 0, 0) },
    }),
    [radiusUsed],
  );

  const atmosphereUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(blackbodyColor(starTeff)) },
      uIntensity: { value: 1.1 },
    }),
    [starTeff],
  );

  const starUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSeed: { value: 1.7 },
      uColor: { value: new THREE.Color(starColor) },
    }),
    [starColor],
  );

  return (
    <>
      <color attach="background" args={['#03050a']} />
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 0, 0]} intensity={2.4} color={starColor} distance={0} decay={0} />

      <CameraRig
        real={real}
        planetPosition={planetPosition}
        planetRadius={planetR}
        orbitRadius={orbitRadius}
        resetToken={resetToken}
        controlsRef={controlsRef}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.07}
        minDistance={real ? Math.max(planetR * 1.15, 0.002) : 2.6}
        maxDistance={real ? 500000 : 90}
        zoomSpeed={0.8}
        rotateSpeed={0.55}
      />

      {showOrbit && a !== null && (
        <Line points={orbitPoints} color="#284a5c" lineWidth={1} transparent opacity={0.65} />
      )}

      {hzVisible && hzInner !== null && hzOuter !== null && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[hzInner, hzOuter, 128]} />
            <meshBasicMaterial
              color="#10b981"
              transparent
              opacity={0.075}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <Line
            points={Array.from({ length: 129 }, (_, i) => {
              const t = (i / 128) * Math.PI * 2;
              return [hzInner * Math.cos(t), 0, hzInner * Math.sin(t)] as [number, number, number];
            })}
            color="#10b981"
            lineWidth={1}
            transparent
            opacity={0.3}
          />
          <Line
            points={Array.from({ length: 129 }, (_, i) => {
              const t = (i / 128) * Math.PI * 2;
              return [hzOuter * Math.cos(t), 0, hzOuter * Math.sin(t)] as [number, number, number];
            })}
            color="#10b981"
            lineWidth={1}
            transparent
            opacity={0.3}
          />
        </group>
      )}

      {/* Звезда */}
      {starKnown ? (
        <group>
          <mesh>
            <sphereGeometry args={[starR, 64, 64]} />
            <shaderMaterial
              vertexShader={starVertex}
              fragmentShader={starFragment}
              uniforms={starUniforms}
            />
          </mesh>
          <mesh scale={1.22}>
            <sphereGeometry args={[starR, 48, 48]} />
            <shaderMaterial
              vertexShader={atmosphereVertex}
              fragmentShader={atmosphereFragment}
              uniforms={atmosphereUniforms}
              transparent
              blending={THREE.AdditiveBlending}
              side={THREE.BackSide}
              depthWrite={false}
            />
          </mesh>
          <Html position={[0, starR * 1.4, 0]} center style={{ pointerEvents: 'none' }}>
            <span className="whitespace-nowrap rounded border border-amber-300/30 bg-space-950/80 px-1.5 py-0.5 text-[9px] text-amber-100">
              {entity.hostName ?? 'Звезда'} · {starTeff !== null ? `${formatNumber(starTeff, 0)} K` : 'T_eff ?'}
            </span>
          </Html>
        </group>
      ) : (
        <group>
          <mesh>
            <sphereGeometry args={[starR, 32, 32]} />
            <meshStandardMaterial color="#2b3038" roughness={1} />
          </mesh>
          <Dust center={[0, 0, 0]} radius={starR} seed={3.7} />
          <Html position={[0, starR * 1.4, 0]} center style={{ pointerEvents: 'none' }}>
            <span className="rounded border border-slate-500/30 bg-space-950/80 px-1.5 py-0.5 text-[9px] text-slate-400">
              звезда: параметры неизвестны
            </span>
          </Html>
        </group>
      )}

      {/* Планета или заглушка */}
      {insufficient ? (
        <StubLabel
          missing={
            c.missing.length > 0
              ? c.missing
              : ['радиус R', 'температура поверхности T_s', 'большая полуось a']
          }
          position={planetPosition}
          name={entity.names[0] ?? 'Планета'}
        />
      ) : (
        <group position={planetPosition}>
          <mesh ref={planetRef}>
            <sphereGeometry args={[planetR, 72, 72]} />
            <shaderMaterial
              vertexShader={planetVertex}
              fragmentShader={planetFragment}
              uniforms={uniforms}
            />
          </mesh>
          {kind !== 'lava' && kind !== 'ice' && (
            <mesh ref={cloudRef} scale={1.014}>
              <sphereGeometry args={[planetR, 56, 56]} />
              <shaderMaterial
                vertexShader={planetVertex}
                fragmentShader={cloudFragment}
                uniforms={cloudUniforms}
                transparent
                depthWrite={false}
              />
            </mesh>
          )}
          <mesh scale={1.07}>
            <sphereGeometry args={[planetR, 48, 48]} />
            <shaderMaterial
              vertexShader={atmosphereVertex}
              fragmentShader={atmosphereFragment}
              uniforms={atmosphereUniforms}
              transparent
              blending={THREE.AdditiveBlending}
              side={THREE.BackSide}
              depthWrite={false}
            />
          </mesh>
          {(kind === 'gas' || kind === 'iceGiant') && (
            <mesh rotation={[Math.PI / 2.35, 0.18, 0]}>
              <ringGeometry args={[planetR * 1.5, planetR * 2.5, 96]} />
              <meshBasicMaterial
                color={kind === 'gas' ? '#d8bfa0' : '#9fd8f2'}
                transparent
                opacity={0.34}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          )}
          <Html position={[0, planetR * 1.75, 0]} center style={{ pointerEvents: 'none' }}>
            <span className="whitespace-nowrap rounded border border-emerald-300/25 bg-space-950/80 px-1.5 py-0.5 text-[9px] text-emerald-100">
              {entity.names[0]}
              {radiusUsed !== null ? ` · ${formatNumber(radiusUsed, 2)} R⊕` : ''}
              {ts !== null ? ` · ${formatNumber(ts, 0)} K` : ''}
            </span>
          </Html>
        </group>
      )}

      <SceneDispose />
    </>
  );
}

export function SystemScene({ entity }: { entity: PlanetEntity | null }) {
  const [real, setReal] = useState(false);
  const [showOrbit, setShowOrbit] = useState(true);
  const [showHz, setShowHz] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const setNotice = useAppStore((s) => s.setNotice);

  if (!entity) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-space-950/40 p-6 text-center">
        <Orbit className="h-7 w-7 text-slate-600" />
        <p className="text-sm text-slate-300">Выберите планету</p>
        <p className="max-w-xs text-[11px] text-slate-500">
          Сцена системы строится по закреплённой планете. Клик по строке таблицы или метке на карте
          откроет карточку и сцену.
        </p>
      </div>
    );
  }

  const levelB = entity.computed.levelB;
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/[0.07] bg-[#03050a]">
      <Canvas
        camera={{ position: [0, 10, 16], fov: 48, near: 0.001, far: 600000 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        key={entity.id}
      >
        <SystemContent
          entity={entity}
          real={real}
          showOrbit={showOrbit}
          showHz={showHz}
          resetToken={resetToken}
          key={entity.id}
        />
      </Canvas>

      <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
        <span className="rounded border border-white/10 bg-space-950/80 px-1.5 py-0.5 text-[9px] text-slate-400 backdrop-blur">
          Сцена системы · {entity.names[0]}
        </span>
        {levelB && (
          <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200 backdrop-blur">
            Реконструкция по расчётной модели
          </span>
        )}
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1">
        <div className="flex overflow-hidden rounded-lg border border-white/10 bg-space-950/80 backdrop-blur">
          {[
            [false, 'Обзорный'],
            [true, '1:1'],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setReal(Boolean(value))}
              className={cn(
                'px-2 py-1 text-[10px] transition',
                real === value ? 'bg-accent/20 text-accent-soft' : 'text-slate-400 hover:bg-white/5',
              )}
            >
              {label as string}
            </button>
          ))}
        </div>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7 bg-space-950/80"
          onClick={() => {
            setResetToken((v) => v + 1);
            setNotice('Камера сцены сброшена');
          }}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>

      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/[0.06] bg-space-950/75 px-2 py-1 text-[9px] text-slate-400 backdrop-blur">
        <button
          type="button"
          onClick={() => setShowOrbit((v) => !v)}
          className={cn('inline-flex items-center gap-1', showOrbit ? 'text-sky-300' : 'text-slate-500')}
        >
          <Orbit className="h-3 w-3" /> Орбита
        </button>
        <button
          type="button"
          onClick={() => setShowHz((v) => !v)}
          className={cn('inline-flex items-center gap-1', showHz ? 'text-emerald-300' : 'text-slate-500')}
        >
          <Sparkles className="h-3 w-3" /> Зона обитаемости
        </button>
        <span className="inline-flex items-center gap-1">
          {real ? <Maximize2 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {real
            ? '1:1 — реальные пропорции; видна планета или звезда'
            : 'Обзорный — логарифмическое сжатие расстояний'}
        </span>
        {entity.computed.hzExtrapolated && (
          <span className="rounded border border-sky-400/30 bg-sky-400/10 px-1 py-0.5 text-sky-200">
            ЗО: экстраполяция
          </span>
        )}
        {entity.computed.insufficientData && (
          <span className="ml-auto inline-flex items-center gap-1 text-amber-200">
            <HelpCircle className="h-3 w-3" /> недостаточно данных
          </span>
        )}
      </div>
    </div>
  );
}
