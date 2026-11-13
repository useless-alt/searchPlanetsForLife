import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Html, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PlanetEntity, RankedPlanet } from '@/types';
import { fieldNumber } from '@/lib/calc/solver';
import { cn, formatNumber } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Compass, MousePointer2, RotateCcw } from 'lucide-react';
import { equatorialToScene } from './coords';

interface MapPoint {
  id: string;
  name: string;
  position: [number, number, number];
  rank: number | null;
  entity: PlanetEntity;
}

function toPoint(entity: PlanetEntity, rank: number | null): MapPoint | null {
  const ra = fieldNumber(entity.fields, 'ra');
  const dec = fieldNumber(entity.fields, 'dec');
  const dist = fieldNumber(entity.fields, 'dist');
  if (ra === null || dec === null || dist === null) return null;
  const position = equatorialToScene(ra, dec, dist);
  if (!position) return null;
  return { id: entity.id, name: entity.names[0] ?? 'Без имени', position, rank, entity };
}

const INITIAL_CAMERA: [number, number, number] = [0, -2900, 3800];
const INITIAL_TARGET: [number, number, number] = [0, 0, 0];

function CameraRig({
  focus,
  resetToken,
  controlsRef,
}: {
  focus: [number, number, number] | null;
  resetToken: number;
  controlsRef: React.RefObject<OrbitControlsImpl>;
}) {
  const { camera } = useThree();
  const destination = useRef(new THREE.Vector3(...INITIAL_CAMERA));
  const target = useRef(new THREE.Vector3(...INITIAL_TARGET));
  const flying = useRef(false);
  const lastReset = useRef(resetToken);

  useEffect(() => {
    if (lastReset.current !== resetToken) {
      lastReset.current = resetToken;
      destination.current.set(...INITIAL_CAMERA);
      target.current.set(...INITIAL_TARGET);
      flying.current = true;
      return;
    }
    if (!focus) return;
    const point = new THREE.Vector3(...focus);
    const direction = point.clone().normalize();
    if (!Number.isFinite(direction.x) || direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
    const distance = Math.max(160, Math.min(900, point.length() * 0.32));
    destination.current.copy(point.clone().add(direction.multiplyScalar(distance)));
    destination.current.z += distance * 0.35;
    target.current.copy(point);
    flying.current = true;
  }, [focus, resetToken]);

  useFrame((_, delta) => {
    if (!flying.current) return;
    const step = 1 - Math.pow(0.001, Math.min(delta, 0.05) * 4);
    camera.position.lerp(destination.current, step);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(target.current, step);
      controls.update();
    }
    if (camera.position.distanceTo(destination.current) < 2) {
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

function Marker({
  point,
  selected,
  onSelect,
  onHover,
  hovered,
}: {
  point: MapPoint | null;
  selected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  hovered: boolean;
}) {
  if (!point) return null;
  const color = selected ? '#fbbf24' : '#10b981';
  const labelOpacity = hovered || selected ? 1 : 0.55;
  return (
    <group position={point.position}>
      <Billboard>
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onSelect(point.id);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            onHover(point.id);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = 'auto';
          }}
        >
          <circleGeometry args={[selected ? 12 : 7, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
        </mesh>
        <mesh raycast={() => null}>
          <ringGeometry args={[selected ? 14 : 8, selected ? 16 : 9, 24]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.95 : 0.6} depthWrite={false} />
        </mesh>
        <mesh raycast={() => null}>
          <circleGeometry args={[selected ? 4 : 2.6, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </Billboard>
      <Html position={[0, 12, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div
          className={cn(
            'whitespace-nowrap rounded border px-1 py-0.5 text-[8px] leading-none backdrop-blur-sm',
            selected
              ? 'border-amber-300/60 bg-amber-400/15 text-amber-100'
              : 'border-emerald-300/20 bg-space-950/50 text-emerald-100',
          )}
          style={{ opacity: labelOpacity }}
        >
          {point.name}
          {point.rank !== null && <span className="ml-1 text-emerald-400/70">#{point.rank}</span>}
        </div>
      </Html>
    </group>
  );
}

function MapContent({
  points,
  allPoints,
  pinnedId,
  resetToken,
  onSelect,
}: {
  points: MapPoint[];
  allPoints: MapPoint[];
  pinnedId: string | null;
  resetToken: number;
  onSelect: (id: string) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const backgroundGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(allPoints.length * 3);
    allPoints.forEach((p, i) => {
      positions[i * 3] = p.position[0];
      positions[i * 3 + 1] = p.position[1];
      positions[i * 3 + 2] = p.position[2];
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [allPoints]);

  useEffect(() => () => backgroundGeometry.dispose(), [backgroundGeometry]);

  const topIds = new Set(points.map((p) => p.id));
  const pinnedPoint = pinnedId ? allPoints.find((p) => p.id === pinnedId) ?? null : null;
  const focus = pinnedPoint?.position ?? null;

  return (
    <>
      <color attach="background" args={['#04060b']} />
      <Stars radius={9000} depth={2600} count={2800} factor={60} saturation={0} fade speed={0.35} />
      <ambientLight intensity={0.8} />
      <OrbitControls
        ref={controlsRef}
        enablePan
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.55}
        zoomSpeed={0.75}
        minDistance={120}
        maxDistance={12000}
      />
      <CameraRig focus={focus} resetToken={resetToken} controlsRef={controlsRef} />

      <gridHelper args={[7200, 30, '#0d1a26', '#09121b']} rotation={[Math.PI / 2, 0, 0]}>
        <lineBasicMaterial attach="material" transparent opacity={0.45} />
      </gridHelper>

      <points geometry={backgroundGeometry}>
        <pointsMaterial
          size={5}
          color="#5b7c9d"
          transparent
          opacity={0.38}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      {Array.from({ length: 50 }, (_, index) => {
        const point = points[index] ?? null;
        return (
          <Marker
            key={index}
            point={point}
            selected={Boolean(point && point.id === pinnedId)}
            hovered={Boolean(point && hovered === point.id)}
            onSelect={onSelect}
            onHover={setHovered}
          />
        );
      })}

      {pinnedPoint && !topIds.has(pinnedPoint.id) && (
        <Marker
          point={pinnedPoint}
          selected
          hovered={hovered === pinnedPoint.id}
          onSelect={onSelect}
          onHover={setHovered}
        />
      )}

      {/* Земля — начало координат */}
      <mesh>
        <sphereGeometry args={[9, 12, 12]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
      <Html position={[0, 16, 0]} center style={{ pointerEvents: 'none' }}>
        <span className="rounded border border-sky-400/30 bg-sky-400/10 px-1 py-0.5 text-[8px] text-sky-200">
          Земля (0,0,0)
        </span>
      </Html>
    </>
  );
}

export function GalaxyMap({
  entities,
  top,
  resetToken,
}: {
  entities: PlanetEntity[];
  top: RankedPlanet[];
  resetToken: number;
}) {
  const pinnedId = useAppStore((s) => s.pinnedId);
  const setPinned = useAppStore((s) => s.setPinned);
  const resetMap = useAppStore((s) => s.resetMap);
  const [webglError] = useState<string | null>(null);

  const allPoints = useMemo(
    () =>
      entities
        .map((e) => toPoint(e, null))
        .filter((p): p is MapPoint => p !== null),
    [entities],
  );

  const topPoints = useMemo(
    () =>
      top
        .map((r) => toPoint(r.entity, r.rank))
        .filter((p): p is MapPoint => p !== null),
    [top],
  );

  const uniqueAll = useMemo(() => {
    const map = new Map<string, MapPoint>();
    for (const p of allPoints) map.set(p.id, p);
    return [...map.values()];
  }, [allPoints]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/[0.07] bg-[#04060b]">
      {webglError ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm text-slate-200">WebGL недоступен</p>
          <p className="max-w-xs text-[11px] text-slate-500">
            {webglError}. Таблица и расчёты продолжают работать.
          </p>
        </div>
      ) : (
        <Canvas
          camera={{ position: INITIAL_CAMERA, fov: 48, near: 1, far: 30000 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.setClearColor('#04060b');
          }}
        >
          <MapContent
            points={topPoints}
            allPoints={uniqueAll}
            pinnedId={pinnedId}
            resetToken={resetToken}
            onSelect={(id) => setPinned(id, { openCard: true })}
          />
        </Canvas>
      )}

      <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
        <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-space-950/75 px-1.5 py-0.5 text-[9px] text-slate-400 backdrop-blur">
          <Compass className="h-3 w-3 text-accent" /> Карта Галактики · экваториальная J2000
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-space-950/75 px-1.5 py-0.5 text-[9px] text-slate-500 backdrop-blur">
          <MousePointer2 className="h-3 w-3" /> клик по метке закрепляет планету
        </span>
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 bg-space-950/70" onClick={resetMap}>
          <RotateCcw className="h-3 w-3" /> Обзор
        </Button>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/[0.06] bg-space-950/70 px-2 py-1 text-[9px] text-slate-500 backdrop-blur">
        <span className="text-emerald-400">● Топ-50</span>
        <span className="text-amber-300">● выбранная</span>
        <span className="text-sky-400">● Земля</span>
        <span>r′ = 900 · log10(1 + r), направление сохранено</span>
        <span className="ml-auto">
          на карте: {uniqueAll.length.toLocaleString('ru-RU')} из {entities.length.toLocaleString('ru-RU')} · без координат:{' '}
          {entities.length - uniqueAll.length}
        </span>
      </div>
    </div>
  );
}
