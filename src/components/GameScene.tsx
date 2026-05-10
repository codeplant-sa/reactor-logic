import React, { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, useTexture } from "@react-three/drei";
import * as THREE from "three";
import floorTextureUrl from "../../public/images/floor1.jpg";
import reactorBackdropUrl from "../../public/images/reactor-backdrop.jpg";
import wallTextureOneUrl from "../../public/images/wall1.jpg";
import wallTextureTwoUrl from "../../public/images/wall2.jpg";
import wallTextureFiveUrl from "../../public/images/wall5.jpg";
import { getNextPosition, isWall, samePosition } from "../game/mazeGenerator";
import { Direction, GameState, Hotspot, Position } from "../game/types";

export type CameraViewMode = "overhead" | "robot";

interface GameSceneProps {
  state: GameState;
  viewMode: CameraViewMode;
}

const directionRotation: Record<Direction, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2
};

const directionVectors: Record<Direction, THREE.Vector3> = {
  north: new THREE.Vector3(0, 0, -1),
  east: new THREE.Vector3(1, 0, 0),
  south: new THREE.Vector3(0, 0, 1),
  west: new THREE.Vector3(-1, 0, 0)
};

const WALL_TEXTURE_PATHS = [
  wallTextureOneUrl,
  wallTextureTwoUrl,
  wallTextureFiveUrl
];
const FLOOR_TEXTURE_PATH = floorTextureUrl;
const REACTOR_BACKDROP_PATH = reactorBackdropUrl;
const BACKDROP_DISTANCE = 22;
const BACKDROP_VERTICAL_OFFSET = 1.65;

useTexture.preload(WALL_TEXTURE_PATHS);
useTexture.preload(FLOOR_TEXTURE_PATH);
useTexture.preload(REACTOR_BACKDROP_PATH);

const toWorld = (maze: GameState["maze"], position: Position): [number, number, number] => [
  position.x - maze.width / 2 + 0.5,
  0,
  position.y - maze.height / 2 + 0.5
];

const getCameraFocus = (maze: GameState["maze"], position: Position): THREE.Vector3 => {
  const focus = new THREE.Vector3(...toWorld(maze, position));
  const centerBias = maze.width <= 9 ? 0.16 : 0.04;
  return focus.lerp(new THREE.Vector3(0, 0, 0), centerBias);
};

const hashWallCell = (seed: string, x: number, y: number): number => {
  const key = `${seed}:${x}:${y}`;
  let hash = 2166136261;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const getWallTextureIndex = (seed: string, x: number, y: number): 0 | 1 | 2 => {
  const bucket = hashWallCell(seed, x, y) % 10;

  if (bucket < 5) {
    return 2;
  }

  return bucket === 5 ? 1 : 0;
};

function useWallTextures() {
  const textures = useTexture(WALL_TEXTURE_PATHS);

  return useMemo(() => {
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
      texture.anisotropy = 4;
      texture.needsUpdate = true;
    });

    return textures;
  }, [textures]);
}

function useBackdropTexture() {
  const texture = useTexture(REACTOR_BACKDROP_PATH);

  return useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, [texture]);
}

function useFloorTexture() {
  const texture = useTexture(FLOOR_TEXTURE_PATH);

  return useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, [texture]);
}

function OverheadCameraRig({ state }: { state: GameState }) {
  const { camera, size } = useThree();
  const levelFocus = useMemo(
    () => getCameraFocus(state.maze, state.maze.start),
    [state.maze]
  );
  const robotFocus = useMemo(
    () => getCameraFocus(state.maze, state.position),
    [state.maze, state.position]
  );
  const cameraFocus = useRef(levelFocus.clone());
  const lastMazeKey = useRef(`${state.seed}:${state.maze.width}:${state.maze.height}`);
  const distance = Math.max(12, Math.max(state.maze.width, state.maze.height) * 1.25);
  const isCompact = size.width < 700;
  const tutorialZoom = isCompact ? 32 : 44;
  const openMazeZoom = isCompact
    ? 38 + Math.min(10, Math.max(0, state.maze.width - 9) * 0.5)
    : 54 + Math.min(12, Math.max(0, state.maze.width - 9) * 0.55);
  const targetZoom = state.maze.width <= 9 ? tutorialZoom : openMazeZoom;

  useFrame(() => {
    const mazeKey = `${state.seed}:${state.maze.width}:${state.maze.height}`;
    const isNewMaze = lastMazeKey.current !== mazeKey;
    if (isNewMaze) {
      lastMazeKey.current = mazeKey;
      cameraFocus.current.copy(levelFocus);
    }

    const visibleWidth = size.width / Math.max(1, camera.zoom || targetZoom);
    const visibleHeight = size.height / Math.max(1, camera.zoom || targetZoom);
    const deadZoneX = Math.max(3.4, visibleWidth * 0.28);
    const deadZoneZ = Math.max(2.8, visibleHeight * 0.24);
    const desiredFocus = cameraFocus.current.clone();
    const offsetX = robotFocus.x - cameraFocus.current.x;
    const offsetZ = robotFocus.z - cameraFocus.current.z;

    if (Math.abs(offsetX) > deadZoneX) {
      desiredFocus.x = robotFocus.x - Math.sign(offsetX) * deadZoneX;
    }

    if (Math.abs(offsetZ) > deadZoneZ) {
      desiredFocus.z = robotFocus.z - Math.sign(offsetZ) * deadZoneZ;
    }

    const focusSpeed =
      state.executionStatus === "running"
        ? 0.018
        : state.executionStatus === "paused" || state.executionStatus === "stepping"
          ? 0.055
          : 0.035;
    cameraFocus.current.lerp(desiredFocus, isNewMaze ? 1 : focusSpeed);

    const desiredPosition = new THREE.Vector3(
      cameraFocus.current.x,
      distance * 1.35,
      cameraFocus.current.z + distance * 0.62
    );
    camera.position.lerp(desiredPosition, isNewMaze ? 1 : 0.08);
    camera.lookAt(camera.position.x, 0, camera.position.z - distance * 0.62);

    if ("zoom" in camera) {
      camera.zoom += (targetZoom - camera.zoom) * (isNewMaze ? 1 : 0.08);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

const getRobotCameraTargets = (
  maze: GameState["maze"],
  position: Position,
  facing: Direction
) => {
  const robotWorld = new THREE.Vector3(...toWorld(maze, position));
  const forward = directionVectors[facing];
  const eye = robotWorld
    .clone()
    .add(forward.clone().multiplyScalar(0.22))
    .add(new THREE.Vector3(0, 0.72, 0));
  const lookAt = eye
    .clone()
    .add(forward.clone().multiplyScalar(5.4));
  lookAt.y = 0.34;

  return { eye, lookAt };
};

function RobotCameraRig({ state }: { state: GameState }) {
  const { camera } = useThree();
  const targets = useMemo(
    () => getRobotCameraTargets(state.maze, state.position, state.facing),
    [state.maze, state.position, state.facing]
  );
  const lookTarget = useRef(targets.lookAt.clone());
  const lastMazeKey = useRef(`${state.seed}:${state.maze.width}:${state.maze.height}`);

  useFrame(() => {
    const mazeKey = `${state.seed}:${state.maze.width}:${state.maze.height}`;
    const isNewMaze = lastMazeKey.current !== mazeKey;
    if (isNewMaze) {
      lastMazeKey.current = mazeKey;
      camera.position.copy(targets.eye);
      lookTarget.current.copy(targets.lookAt);
    }

    const followSpeed = state.executionStatus === "running" ? 0.11 : 0.18;
    const lookSpeed = state.executionStatus === "running" ? 0.13 : 0.22;
    camera.position.lerp(targets.eye, isNewMaze ? 1 : followSpeed);
    lookTarget.current.lerp(targets.lookAt, isNewMaze ? 1 : lookSpeed);
    camera.lookAt(lookTarget.current);

    if ("fov" in camera) {
      camera.fov += (62 - camera.fov) * 0.1;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function RobotHeadlamp({ state }: { state: GameState }) {
  const light = useRef<THREE.PointLight>(null);
  const target = useMemo(() => {
    const robotWorld = new THREE.Vector3(...toWorld(state.maze, state.position));
    return robotWorld
      .clone()
      .add(directionVectors[state.facing].clone().multiplyScalar(0.65))
      .add(new THREE.Vector3(0, 0.78, 0));
  }, [state.maze, state.position, state.facing]);

  useFrame(() => {
    if (!light.current) return;
    light.current.position.lerp(target, 0.2);
  });

  return (
    <pointLight
      ref={light}
      position={target.toArray()}
      color="#b9fff2"
      intensity={1.45}
      distance={5.6}
      decay={1.65}
    />
  );
}

function ReactorBackdrop({ state }: { state: GameState }) {
  const texture = useBackdropTexture();
  const mesh = useRef<THREE.Mesh>(null);
  const drift = useRef(new THREE.Vector2(0, 0));
  const { camera, size } = useThree();

  useFrame(() => {
    if (!mesh.current) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const targetDrift = new THREE.Vector2(
      (state.maze.start.x - state.position.x) * 0.16 +
        (state.position.y - state.maze.start.y) * 0.06,
      Math.min(0.34, Math.max(0, state.pathTrace.length - 1) * 0.012)
    );
    const driftSpeed = state.executionStatus === "running" ? 0.024 : 0.08;
    drift.current.lerp(targetDrift, driftSpeed);

    mesh.current.position
      .copy(camera.position)
      .add(forward.multiplyScalar(BACKDROP_DISTANCE))
      .add(right.multiplyScalar(drift.current.x))
      .add(up.multiplyScalar(BACKDROP_VERTICAL_OFFSET + drift.current.y));
    mesh.current.quaternion.copy(camera.quaternion);

    const fov =
      camera instanceof THREE.PerspectiveCamera
        ? THREE.MathUtils.degToRad(camera.fov)
        : THREE.MathUtils.degToRad(62);
    const height = Math.tan(fov / 2) * BACKDROP_DISTANCE * 2.25;
    const width = height * Math.max(1, size.width / Math.max(1, size.height));
    mesh.current.scale.set(width, height, 1);
  });

  return (
    <mesh ref={mesh} renderOrder={-10}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        color="#d7eef0"
        depthWrite={false}
        fog={false}
        opacity={0.84}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

function FloorTile({
  position,
  variant,
  texture
}: {
  position: [number, number, number];
  variant: number;
  texture: THREE.Texture;
}) {
  return (
    <mesh position={[position[0], -0.04, position[2]]} receiveShadow>
      <boxGeometry args={[0.96, 0.05, 0.96]} />
      <meshStandardMaterial
        map={texture}
        color={variant % 2 === 0 ? "#d4e0e0" : "#bac7c8"}
        roughness={0.9}
        metalness={0.05}
      />
    </mesh>
  );
}

function WallBlock({
  position,
  texture
}: {
  position: [number, number, number];
  texture: THREE.Texture;
}) {
  return (
    <group position={[position[0], 0.48, position[2]]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1, 0.96, 1]} />
        <meshStandardMaterial
          map={texture}
          color="#ffffff"
          roughness={0.78}
          metalness={0.08}
        />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[0.88, 0.07, 0.88]} />
        <meshStandardMaterial
          map={texture}
          color="#ffffff"
          roughness={0.7}
          metalness={0.08}
        />
      </mesh>
    </group>
  );
}

function HotspotMarker({ maze, hotspot }: { maze: GameState["maze"]; hotspot: Hotspot }) {
  const group = useRef<THREE.Group>(null);
  const position = toWorld(maze, hotspot.position);

  useFrame(({ clock }) => {
    if (!group.current || hotspot.sealed) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    group.current.scale.setScalar(pulse);
  });

  if (hotspot.sealed) {
    return (
      <group position={[position[0], 0.04, position[2]]}>
        <mesh>
          <cylinderGeometry args={[0.38, 0.42, 0.08, 20]} />
          <meshStandardMaterial color="#d9fff2" roughness={0.52} />
        </mesh>
        <mesh position={[0.12, 0.08, -0.04]}>
          <sphereGeometry args={[0.13, 12, 8]} />
          <meshStandardMaterial color="#b8f5e4" roughness={0.4} />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={group} position={[position[0], 0.1, position[2]]}>
      <mesh>
        <cylinderGeometry args={[0.32, 0.42, 0.12, 6]} />
        <meshStandardMaterial
          color="#ffb020"
          emissive="#ff4d2e"
          emissiveIntensity={0.75}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <torusGeometry args={[0.36, 0.025, 8, 24]} />
        <meshStandardMaterial color="#ffd166" emissive="#ff9f1c" emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

function ExtractionPlatform({ maze, position }: { maze: GameState["maze"]; position: Position }) {
  const world = toWorld(maze, position);
  return (
    <group position={[world[0], 0.03, world[2]]}>
      <mesh>
        <cylinderGeometry args={[0.48, 0.48, 0.08, 8]} />
        <meshStandardMaterial color="#1f8f70" emissive="#14b88a" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.74, 0.04, 0.18]} />
        <meshStandardMaterial color="#f8d448" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.09, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.74, 0.04, 0.18]} />
        <meshStandardMaterial color="#f8d448" roughness={0.5} />
      </mesh>
    </group>
  );
}

function RobotModel({ state }: { state: GameState }) {
  const group = useRef<THREE.Group>(null);
  const target = useMemo(
    () => new THREE.Vector3(...toWorld(state.maze, state.position)),
    [state.maze, state.position]
  );
  const accent = state.robot.accent;

  useFrame(() => {
    if (!group.current) return;
    group.current.position.lerp(target, 0.22);
    const desired = directionRotation[state.facing];
    let delta = desired - group.current.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    group.current.rotation.y += delta * 0.24;
  });

  return (
    <group ref={group} position={toWorld(state.maze, state.position)}>
      <mesh position={[0, 0.035, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
        <torusGeometry args={[0.5, 0.025, 8, 32]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.45}
          depthTest={false}
        />
      </mesh>
      <mesh position={[0, 0.8, 0]} renderOrder={10}>
        <cylinderGeometry args={[0.025, 0.025, 0.74, 8]} />
        <meshStandardMaterial color="#d7dde4" depthTest={false} />
      </mesh>
      <mesh position={[0, 1.2, 0]} renderOrder={10}>
        <sphereGeometry args={[0.12, 14, 10]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.7}
          depthTest={false}
        />
      </mesh>
      <mesh castShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[0.58, 0.24, 0.66]} />
        <meshStandardMaterial color="#d7dde4" roughness={0.45} metalness={0.24} />
      </mesh>
      <mesh castShadow position={[0, 0.35, -0.05]}>
        <boxGeometry args={[0.42, 0.26, 0.38]} />
        <meshStandardMaterial color={accent} roughness={0.38} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.22, -0.43]}>
        <coneGeometry args={[0.13, 0.28, 3]} />
        <meshStandardMaterial color="#f8d448" emissive="#f8d448" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.35, 0.08, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.24, 12]} />
        <meshStandardMaterial color="#202832" roughness={0.55} />
      </mesh>
      <mesh position={[0.35, 0.08, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.24, 12]} />
        <meshStandardMaterial color="#202832" roughness={0.55} />
      </mesh>
      <mesh position={[-0.35, 0.08, -0.19]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.24, 12]} />
        <meshStandardMaterial color="#202832" roughness={0.55} />
      </mesh>
      <mesh position={[0.35, 0.08, -0.19]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.24, 12]} />
        <meshStandardMaterial color="#202832" roughness={0.55} />
      </mesh>
    </group>
  );
}

function SensorHint({ state }: { state: GameState }) {
  if (!state.robot.sensorHints) {
    return null;
  }
  const next = getNextPosition(state.position, state.facing);
  if (isWall(state.maze, next)) {
    return null;
  }
  const world = toWorld(state.maze, next);
  return (
    <mesh position={[world[0], 0.015, world[2]]}>
      <boxGeometry args={[0.9, 0.03, 0.9]} />
      <meshStandardMaterial
        color="#60a5fa"
        transparent
        opacity={0.32}
        emissive="#1d4ed8"
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}

function ServicePipes({ maze }: { maze: GameState["maze"] }) {
  const width = maze.width;
  const height = maze.height;
  return (
    <group>
      <mesh
        position={[0, 0.9, -height / 2 - 0.12]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.045, 0.045, width, 12]} />
        <meshStandardMaterial color="#8a4f35" roughness={0.5} metalness={0.25} />
      </mesh>
      <mesh position={[-width / 2 - 0.12, 0.68, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, height, 12]} />
        <meshStandardMaterial color="#2f7a76" roughness={0.5} metalness={0.25} />
      </mesh>
    </group>
  );
}

function MazeScene({ state, viewMode }: GameSceneProps) {
  const wallTextures = useWallTextures();
  const floorTexture = useFloorTexture();
  const cameraDistance = Math.max(12, Math.max(state.maze.width, state.maze.height) * 1.25);
  const cameraFocus = useMemo(
    () => getCameraFocus(state.maze, state.maze.start),
    [state.maze]
  );
  const initialCameraPosition = useMemo<[number, number, number]>(
    () => [
      cameraFocus.x,
      cameraDistance * 1.35,
      cameraFocus.z + cameraDistance * 0.62
    ],
    [cameraDistance, cameraFocus.x, cameraFocus.z]
  );
  const initialRobotCamera = useMemo(
    () => getRobotCameraTargets(state.maze, state.position, state.facing),
    [state.seed, viewMode]
  );
  const initialRobotCameraPosition = useMemo<[number, number, number]>(
    () => [
      initialRobotCamera.eye.x,
      initialRobotCamera.eye.y,
      initialRobotCamera.eye.z
    ],
    [initialRobotCamera]
  );

  return (
    <>
      {viewMode === "overhead" ? (
        <>
          <OrthographicCamera
            key={`${state.seed}-overhead`}
            makeDefault
            position={initialCameraPosition}
            zoom={42}
            near={0.1}
            far={100}
          />
          <OverheadCameraRig state={state} />
        </>
      ) : (
        <>
          <PerspectiveCamera
            key={`${state.seed}-robot`}
            makeDefault
            position={initialRobotCameraPosition}
            fov={62}
            near={0.04}
            far={80}
          />
          <RobotCameraRig state={state} />
        </>
      )}
      {viewMode === "robot" ? <fog attach="fog" args={["#071016", 3.2, 15]} /> : null}
      {viewMode === "robot" ? <ReactorBackdrop state={state} /> : null}
      <ambientLight intensity={viewMode === "robot" ? 0.38 : 0.55} />
      {viewMode === "robot" ? <RobotHeadlamp state={state} /> : null}
      <directionalLight
        castShadow
        position={[4, 9, 6]}
        intensity={viewMode === "robot" ? 0.72 : 1.05}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <ServicePipes maze={state.maze} />
      {state.maze.cells.flatMap((row) =>
        row.map((cell) => {
          const world = toWorld(state.maze, { x: cell.x, y: cell.y });
          return cell.wall ? (
            <WallBlock
              key={`${cell.x}-${cell.y}`}
              position={world}
              texture={wallTextures[getWallTextureIndex(state.seed, cell.x, cell.y)]}
            />
          ) : (
            <FloorTile
              key={`${cell.x}-${cell.y}`}
              position={world}
              variant={cell.x + cell.y}
              texture={floorTexture}
            />
          );
        })
      )}
      <ExtractionPlatform maze={state.maze} position={state.maze.extraction} />
      {state.hotspots.map((hotspot) => (
        <HotspotMarker key={hotspot.id} maze={state.maze} hotspot={hotspot} />
      ))}
      <SensorHint state={state} />
      {viewMode === "overhead" ? <RobotModel state={state} /> : null}
    </>
  );
}

export default function GameScene({ state, viewMode }: GameSceneProps) {
  return (
    <div className={`scene-shell ${viewMode === "robot" ? "robot-view" : ""}`}>
      <Canvas shadows dpr={[1, 1.75]} gl={{ antialias: true }}>
        <color attach="background" args={["#101720"]} />
        <MazeScene state={state} viewMode={viewMode} />
      </Canvas>
      {viewMode === "robot" ? (
        <div className="robot-feed-overlay" aria-label="Robot camera feed">
          <span className="live-dot" />
          <strong>Robot cam</strong>
          <span>{state.robot.name}</span>
        </div>
      ) : null}
      <div className="scene-caption">
        <span>{viewMode === "robot" ? "Robot POV" : "Overhead"}</span>
        <span>{state.robot.name}</span>
        <span>
          Facing {state.facing} at {state.position.x}, {state.position.y}
        </span>
      </div>
    </div>
  );
}
