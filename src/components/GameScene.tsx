import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, useTexture } from "@react-three/drei";
import * as THREE from "three";
import floorTextureUrl from "../../public/images/floor1.jpg";
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

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ROBOT_CAMERA_MAX_PAN = THREE.MathUtils.degToRad(30);
const ROBOT_CAMERA_MAX_VERTICAL_PAN = 0.58;
const ROBOT_CAMERA_PAN_RESPONSE = 9;
const ROBOT_CAMERA_RECENTER_RESPONSE = 5.5;
const RADIATION_BLADE_ANGLES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];

const WALL_TEXTURE_PATHS = [
  wallTextureOneUrl,
  wallTextureTwoUrl,
  wallTextureFiveUrl
];
const WALL_TOP_TEXTURE_PATH = floorTextureUrl;
const DOME_BASE_HEIGHT = 1.28;
const DOME_CAP_HEIGHT = 11.4;
const DOME_MIN_RADIUS = 19;
const DOME_RADIUS_PADDING = 12;
const DOME_OPENING_RADIUS_X = 0.16;
const DOME_OPENING_RADIUS_Z = 0.11;
const DOME_DISTANCE = 31;
const DOME_VERTICAL_OFFSET = 12.55;
const DOME_SCALE_VERTICAL_COMPENSATION = 3.4;
const DOME_HORIZONTAL_PARALLAX = 1.15;
const DOME_VERTICAL_PARALLAX = 0.55;
const DOME_WIDTH = 33;
const DOME_HEIGHT = 18;
const DOME_CENTER_Y = 3.0;
const DOME_DEPTH = 8.2;
const DOME_Y_MIN = -6.4;
const DOME_Y_MAX = 10.2;
const OPENING_CENTER = new THREE.Vector2(0.15, 8.3);
const OPENING_RADIUS_X = 4.6;
const OPENING_RADIUS_Y = 1.85;
const DOME_RING_SCALES = [0.24, 0.38, 0.52, 0.66, 0.8, 0.94];
const DOME_RIB_ANGLES = [
  -156, -132, -108, -84, -60, -36, -12, 12, 36, 60, 84, 108, 132, 156
];
const DOME_BEACONS = [
  [-0.55, -0.18],
  [0.42, -0.12],
  [0.62, 0.2],
  [-0.72, 0.18]
] as const;
const DOME_STRIP_LIGHTS = [
  [-0.78, 0.36, -0.32],
  [0.75, 0.34, 0.34],
  [-0.58, -0.48, 0.12],
  [0.62, -0.42, -0.16]
] as const;

useTexture.preload(WALL_TEXTURE_PATHS);
useTexture.preload(WALL_TOP_TEXTURE_PATH);

const toWorld = (maze: GameState["maze"], position: Position): [number, number, number] => [
  position.x - maze.width / 2 + 0.5,
  0,
  position.y - maze.height / 2 + 0.5
];

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

function useWallTopTexture() {
  const texture = useTexture(WALL_TOP_TEXTURE_PATH);

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
  const distance = Math.max(18, Math.max(state.maze.width, state.maze.height) * 2.2);
  const horizontalPadding = size.width < 700 ? 2.4 : 2.8;
  const verticalPadding = size.height < 560 ? 2.8 : 3.2;
  const targetZoom = Math.max(
    12,
    Math.min(
      size.width / Math.max(1, state.maze.width + horizontalPadding),
      size.height / Math.max(1, state.maze.height + verticalPadding)
    )
  );

  useFrame(() => {
    camera.position.set(0, distance, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);

    if (camera instanceof THREE.OrthographicCamera && camera.zoom !== targetZoom) {
      camera.zoom = targetZoom;
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

const getRobotLookTarget = (
  eye: THREE.Vector3,
  facing: Direction,
  panAngle: number,
  verticalPan: number
): THREE.Vector3 => {
  const forward = directionVectors[facing]
    .clone()
    .applyAxisAngle(WORLD_UP, panAngle);
  const lookAt = eye.clone().add(forward.multiplyScalar(5.4));
  lookAt.y = 0.34 + verticalPan;
  return lookAt;
};

interface RobotCameraPan {
  horizontal: number;
  vertical: number;
}

const writeRobotCameraPan = (
  camera: THREE.Camera,
  pan: RobotCameraPan
) => {
  camera.userData.robotCameraPan = pan;
};

const readRobotCameraPan = (camera: THREE.Camera): RobotCameraPan => {
  const value = camera.userData.robotCameraPan;

  if (
    value &&
    typeof value === "object" &&
    typeof value.horizontal === "number" &&
    typeof value.vertical === "number"
  ) {
    return value as RobotCameraPan;
  }

  return { horizontal: 0, vertical: 0 };
};

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

function RobotCameraRig({ state }: { state: GameState }) {
  const { camera } = useThree();
  const targets = useMemo(
    () => getRobotCameraTargets(state.maze, state.position, state.facing),
    [state.maze, state.position, state.facing]
  );
  const lookTarget = useRef(targets.lookAt.clone());
  const lastMazeKey = useRef(`${state.seed}:${state.maze.width}:${state.maze.height}`);
  const lastFacing = useRef(state.facing);
  const panAngle = useRef(0);
  const verticalPan = useRef(0);
  const panKeys = useRef({ left: false, right: false, up: false, down: false });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        isEditableKeyboardTarget(event.target) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        panKeys.current.left = true;
        event.preventDefault();
      }

      if (event.key === "ArrowRight") {
        panKeys.current.right = true;
        event.preventDefault();
      }

      if (event.key === "ArrowUp") {
        panKeys.current.up = true;
        event.preventDefault();
      }

      if (event.key === "ArrowDown") {
        panKeys.current.down = true;
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        panKeys.current.left = false;
      }

      if (event.key === "ArrowRight") {
        panKeys.current.right = false;
      }

      if (event.key === "ArrowUp") {
        panKeys.current.up = false;
      }

      if (event.key === "ArrowDown") {
        panKeys.current.down = false;
      }
    };

    const resetPanKeys = () => {
      panKeys.current.left = false;
      panKeys.current.right = false;
      panKeys.current.up = false;
      panKeys.current.down = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", resetPanKeys);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", resetPanKeys);
    };
  }, []);

  useFrame((_, delta) => {
    const mazeKey = `${state.seed}:${state.maze.width}:${state.maze.height}`;
    const isNewMaze = lastMazeKey.current !== mazeKey;
    if (isNewMaze) {
      lastMazeKey.current = mazeKey;
      camera.position.copy(targets.eye);
      lookTarget.current.copy(targets.lookAt);
      panAngle.current = 0;
      verticalPan.current = 0;
    }

    if (lastFacing.current !== state.facing) {
      lastFacing.current = state.facing;
      panAngle.current *= 0.35;
    }

    const panInput =
      (panKeys.current.left ? 1 : 0) - (panKeys.current.right ? 1 : 0);
    const targetPan = panInput * ROBOT_CAMERA_MAX_PAN;
    const panResponse =
      panInput === 0 ? ROBOT_CAMERA_RECENTER_RESPONSE : ROBOT_CAMERA_PAN_RESPONSE;
    panAngle.current = THREE.MathUtils.damp(
      panAngle.current,
      targetPan,
      panResponse,
      delta
    );
    const verticalInput =
      (panKeys.current.up ? 1 : 0) - (panKeys.current.down ? 1 : 0);
    const targetVerticalPan = verticalInput * ROBOT_CAMERA_MAX_VERTICAL_PAN;
    const verticalResponse =
      verticalInput === 0 ? ROBOT_CAMERA_RECENTER_RESPONSE : ROBOT_CAMERA_PAN_RESPONSE;
    verticalPan.current = THREE.MathUtils.damp(
      verticalPan.current,
      targetVerticalPan,
      verticalResponse,
      delta
    );
    writeRobotCameraPan(camera, {
      horizontal: panAngle.current,
      vertical: verticalPan.current
    });

    const followSpeed = state.executionStatus === "running" ? 0.11 : 0.18;
    const lookSpeed = state.executionStatus === "running" ? 0.13 : 0.22;
    const pannedLookTarget = getRobotLookTarget(
      targets.eye,
      state.facing,
      panAngle.current,
      verticalPan.current
    );
    camera.position.lerp(targets.eye, isNewMaze ? 1 : followSpeed);
    lookTarget.current.lerp(pannedLookTarget, isNewMaze ? 1 : lookSpeed);
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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const domeNoise = (x: number, y: number): number =>
  Math.sin(x * 0.74 + y * 0.42) * 0.08 +
  Math.sin(x * 1.82 - y * 0.58) * 0.035;

const getDomeZ = (x: number, y: number): number => {
  const normalizedX = x / (DOME_WIDTH * 0.5);
  const normalizedY = (y - DOME_CENTER_Y) / (DOME_HEIGHT * 0.5);
  const radial = clamp(
    Math.sqrt(normalizedX * normalizedX * 0.82 + normalizedY * normalizedY * 1.08),
    0,
    1.18
  );
  const recess = Math.max(0, 1 - radial * radial);
  return -2.15 - recess * DOME_DEPTH + domeNoise(x, y);
};

const getDomePoint = (x: number, y: number, lift = 0): THREE.Vector3 =>
  new THREE.Vector3(x, y, getDomeZ(x, y) + lift);

const isInCrackedOpening = (
  x: number,
  y: number,
  scale = 1
): boolean => {
  const angle = Math.atan2(y - OPENING_CENTER.y, x - OPENING_CENTER.x);
  const jaggedScale =
    scale *
    (1 +
      Math.sin(angle * 5.3) * 0.1 +
      Math.cos(angle * 9.1) * 0.07);
  const normalizedX =
    (x - OPENING_CENTER.x) / (OPENING_RADIUS_X * jaggedScale);
  const normalizedY =
    (y - OPENING_CENTER.y) / (OPENING_RADIUS_Y * jaggedScale);

  return normalizedX * normalizedX + normalizedY * normalizedY < 1;
};

const createRoofDomeGeometry = (): THREE.BufferGeometry => {
  const columns = 72;
  const rows = 34;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const y = THREE.MathUtils.lerp(DOME_Y_MIN, DOME_Y_MAX, v);
    const centeredY = (y - DOME_CENTER_Y) / (DOME_HEIGHT * 0.5);
    const widthFalloff = 1 - Math.pow(Math.abs(centeredY), 1.7) * 0.12;
    const halfWidth = (DOME_WIDTH * 0.5) * clamp(widthFalloff, 0.72, 1);

    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const x = THREE.MathUtils.lerp(-halfWidth, halfWidth, u);
      const z = getDomeZ(x, y);
      const radial = clamp(
        Math.sqrt(
          Math.pow(x / (DOME_WIDTH * 0.5), 2) +
            Math.pow((y - DOME_CENTER_Y) / (DOME_HEIGHT * 0.55), 2)
        ),
        0,
        1
      );
      const panelPulse =
        Math.floor((u + 0.02) * 16) % 2 === Math.floor((v + 0.01) * 9) % 2
          ? 0.03
          : -0.015;
      const shade = clamp(0.18 + (1 - radial) * 0.2 + v * 0.06 + panelPulse, 0, 1);

      vertices.push(x, y, z);
      color.setRGB(0.035 + shade * 0.07, 0.048 + shade * 0.085, 0.05 + shade * 0.08);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const first = row * (columns + 1) + column;
      const second = first + columns + 1;
      const x0 = vertices[first * 3];
      const y0 = vertices[first * 3 + 1];
      const x1 = vertices[(first + 1) * 3];
      const y1 = vertices[(second + 1) * 3 + 1];
      const centerX = (x0 + x1) * 0.5;
      const centerY = (y0 + y1) * 0.5;

      if (isInCrackedOpening(centerX, centerY, 1.04)) {
        continue;
      }

      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createOpeningPoints = (): THREE.Vector3[] =>
  Array.from({ length: 30 }, (_item, index) => {
    const angle = (index / 30) * Math.PI * 2;
    const jagged =
      1 +
      Math.sin(angle * 4.7) * 0.1 +
      Math.cos(angle * 8.2) * 0.08 +
      (index % 5 === 0 ? 0.14 : 0);
    const x =
      OPENING_CENTER.x +
      Math.cos(angle) * OPENING_RADIUS_X * jagged +
      Math.sin(angle * 2.4) * 0.22;
    const y =
      OPENING_CENTER.y +
      Math.sin(angle) * OPENING_RADIUS_Y * jagged +
      Math.cos(angle * 3.1) * 0.1;
    return getDomePoint(x, y, 0.16);
  });

const createOpeningFillGeometry = (
  rimPoints: THREE.Vector3[]
): THREE.BufferGeometry => {
  const center = new THREE.Vector3(OPENING_CENTER.x, OPENING_CENTER.y, -8.25);
  const vertices = center.toArray();
  const indices: number[] = [];

  rimPoints.forEach((point) => {
    vertices.push(point.x, point.y, point.z - 1.25);
  });

  for (let index = 0; index < rimPoints.length; index += 1) {
    const next = index === rimPoints.length - 1 ? 1 : index + 2;
    indices.push(0, index + 1, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createDomeTubeGeometry = (
  points: THREE.Vector3[],
  radius: number,
  closed = false
): THREE.TubeGeometry =>
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, closed, "catmullrom", 0.24),
    Math.max(16, points.length * 5),
    radius,
    6,
    closed
  );

const pushPath = (paths: THREE.Vector3[][], path: THREE.Vector3[]) => {
  if (path.length > 1) {
    paths.push(path);
  }
};

const createDomeRingPaths = (): THREE.Vector3[][] => {
  const paths: THREE.Vector3[][] = [];
  const centerY = DOME_CENTER_Y + 0.18;

  DOME_RING_SCALES.forEach((scale) => {
    let current: THREE.Vector3[] = [];

    for (let segment = 0; segment <= 128; segment += 1) {
      const angle = (segment / 128) * Math.PI * 2;
      const x = Math.cos(angle) * (DOME_WIDTH * 0.5) * scale;
      const y = centerY + Math.sin(angle) * (DOME_HEIGHT * 0.48) * scale;

      if (
        y >= DOME_Y_MIN &&
        y <= DOME_Y_MAX &&
        !isInCrackedOpening(x, y, 1.12)
      ) {
        current.push(getDomePoint(x, y, 0.11));
      } else {
        pushPath(paths, current);
        current = [];
      }
    }

    pushPath(paths, current);
  });

  return paths;
};

const createDomeRibPaths = (): THREE.Vector3[][] => {
  const paths: THREE.Vector3[][] = [];
  const radiusX = DOME_WIDTH * 0.5;
  const radiusY = DOME_HEIGHT * 0.48;

  DOME_RIB_ANGLES.forEach((degrees) => {
    const angle = THREE.MathUtils.degToRad(degrees);
    let current: THREE.Vector3[] = [];

    for (let step = 0; step <= 56; step += 1) {
      const scale = THREE.MathUtils.lerp(0.18, 1.03, step / 56);
      const x = Math.cos(angle) * radiusX * scale;
      const y = DOME_CENTER_Y + 0.18 + Math.sin(angle) * radiusY * scale;

      if (
        y >= DOME_Y_MIN &&
        y <= DOME_Y_MAX &&
        !isInCrackedOpening(x, y, 1.08)
      ) {
        current.push(getDomePoint(x, y, 0.13));
      } else {
        pushPath(paths, current);
        current = [];
      }
    }

    pushPath(paths, current);
  });

  return paths;
};

const createCablePaths = (): THREE.Vector3[][] =>
  [
    [-2.7, 7.55, 2.1, -0.36],
    [-1.2, 7.38, 1.65, 0.22],
    [0.7, 7.42, 2.35, -0.12],
    [2.4, 7.55, 1.85, 0.28]
  ].map(([x, y, length, sway]) => [
    getDomePoint(x, y, 0.34),
    getDomePoint(x + sway, y - length * 0.38, 0.25),
    getDomePoint(x - sway * 0.45, y - length, 0.16)
  ]);

const createCrackPaths = (): THREE.Vector3[][] =>
  [
    [
      [-4.0, 7.85],
      [-5.0, 7.25],
      [-5.75, 6.7]
    ],
    [
      [3.5, 7.75],
      [4.7, 7.15],
      [5.65, 6.92]
    ],
    [
      [-1.55, 7.25],
      [-2.08, 6.45],
      [-2.75, 5.95]
    ],
    [
      [1.35, 7.22],
      [1.55, 6.35],
      [2.1, 5.85]
    ],
    [
      [0.25, 9.1],
      [0.05, 9.62],
      [-0.38, 10.08]
    ]
  ].map((path) => path.map(([x, y]) => getDomePoint(x, y, 0.19)));

function DomeTube({
  points,
  radius,
  color,
  opacity,
  closed = false,
  renderOrder = -18
}: {
  points: THREE.Vector3[];
  radius: number;
  color: string;
  opacity: number;
  closed?: boolean;
  renderOrder?: number;
}) {
  const geometry = useMemo(
    () => createDomeTubeGeometry(points, radius, closed),
    [closed, points, radius]
  );

  if (points.length < 2) {
    return null;
  }

  return (
    <mesh geometry={geometry} renderOrder={renderOrder}>
      <meshBasicMaterial
        color={color}
        depthWrite={false}
        fog={false}
        opacity={opacity}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}

function DomeBeacon({ x, y }: { x: number; y: number }) {
  const point = getDomePoint(x, y, 0.3);

  return (
    <group position={point.toArray()}>
      <mesh renderOrder={-13}>
        <sphereGeometry args={[0.16, 16, 8]} />
        <meshBasicMaterial
          color="#ff5b4a"
          fog={false}
          toneMapped={false}
        />
      </mesh>
      <mesh renderOrder={-14}>
        <sphereGeometry args={[0.58, 20, 10]} />
        <meshBasicMaterial
          color="#ff2f28"
          depthWrite={false}
          fog={false}
          opacity={0.18}
          toneMapped={false}
          transparent
        />
      </mesh>
      <pointLight color="#ff4a3c" decay={2} distance={3.8} intensity={0.45} />
    </group>
  );
}

function DomeStripLight({
  x,
  y,
  angle
}: {
  x: number;
  y: number;
  angle: number;
}) {
  const point = getDomePoint(x, y, 0.26);

  return (
    <group position={point.toArray()} rotation={[0, 0, angle]}>
      <mesh renderOrder={-13}>
        <boxGeometry args={[0.18, 1.2, 0.06]} />
        <meshBasicMaterial color="#d8fbff" fog={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={-14}>
        <boxGeometry args={[0.42, 1.55, 0.04]} />
        <meshBasicMaterial
          color="#9cecff"
          depthWrite={false}
          fog={false}
          opacity={0.2}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  );
}

function CameraLockedReactorDome({ state }: { state: GameState }) {
  const group = useRef<THREE.Group>(null);
  const drift = useRef(new THREE.Vector2(0, 0));
  const parallaxDrift = useRef(new THREE.Vector2(0, 0));
  const { camera, size } = useThree();
  const domeGeometry = useMemo(createRoofDomeGeometry, []);
  const openingPoints = useMemo(createOpeningPoints, []);
  const openingGeometry = useMemo(
    () => createOpeningFillGeometry(openingPoints),
    [openingPoints]
  );
  const ringPaths = useMemo(createDomeRingPaths, []);
  const ribPaths = useMemo(createDomeRibPaths, []);
  const cablePaths = useMemo(createCablePaths, []);
  const crackPaths = useMemo(createCrackPaths, []);

  useFrame(() => {
    if (!group.current) return;

    const robotPan = readRobotCameraPan(camera);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const robotWorld = new THREE.Vector3(...toWorld(state.maze, state.position));
    const startWorld = new THREE.Vector3(...toWorld(state.maze, state.maze.start));
    const travel = robotWorld.sub(startWorld);
    const lateralTravel = travel.dot(right);
    const forwardTravel = travel.dot(forward);
    const targetDrift = new THREE.Vector2(
      clamp(-lateralTravel * 0.42, -3.2, 3.2),
      clamp(forwardTravel * 0.34, -1.4, 2)
    );
    const driftSpeed = state.executionStatus === "running" ? 0.07 : 0.12;
    drift.current.lerp(targetDrift, driftSpeed);
    parallaxDrift.current.lerp(
      new THREE.Vector2(
        robotPan.horizontal * DOME_HORIZONTAL_PARALLAX,
        -robotPan.vertical * DOME_VERTICAL_PARALLAX
      ),
      0.12
    );
    const fov =
      camera instanceof THREE.PerspectiveCamera
        ? THREE.MathUtils.degToRad(camera.fov)
        : THREE.MathUtils.degToRad(62);
    const visibleWidth =
      Math.tan(fov / 2) *
      DOME_DISTANCE *
      2 *
      (size.width / Math.max(1, size.height));
    const domeScale = clamp(visibleWidth / (DOME_WIDTH * 0.74), 1, 2.7);
    const travelScale = clamp(1 + forwardTravel * 0.025, 0.94, 1.16);
    const finalScale = domeScale * travelScale;

    group.current.position
      .copy(camera.position)
      .add(forward.multiplyScalar(DOME_DISTANCE))
      .add(right.multiplyScalar(drift.current.x + parallaxDrift.current.x))
      .add(
        up.multiplyScalar(
          DOME_VERTICAL_OFFSET +
            drift.current.y +
            parallaxDrift.current.y -
            (finalScale - 1) * DOME_SCALE_VERTICAL_COMPENSATION
        )
      );

    group.current.quaternion.copy(camera.quaternion);
    group.current.scale.setScalar(finalScale);
  });

  return (
    <group ref={group}>
      <mesh geometry={openingGeometry} renderOrder={-34}>
        <meshBasicMaterial
          color="#7f98a2"
          depthWrite={false}
          fog={false}
          opacity={0.34}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh geometry={domeGeometry} renderOrder={-30}>
        <meshBasicMaterial
          color="#243235"
          depthWrite={false}
          fog={false}
          opacity={0.94}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          vertexColors
        />
      </mesh>
      {ringPaths.map((points, index) => (
        <DomeTube
          key={`ring-${index}`}
          points={points}
          radius={index % 2 === 0 ? 0.028 : 0.021}
          color="#283940"
          opacity={0.7}
        />
      ))}
      {ribPaths.map((points, index) => (
        <DomeTube
          key={`rib-${index}`}
          points={points}
          radius={0.032}
          color="#101a1f"
          opacity={0.86}
        />
      ))}
      <DomeTube
        points={openingPoints}
        radius={0.09}
        color="#070c0f"
        opacity={0.96}
        closed
        renderOrder={-15}
      />
      {crackPaths.map((points, index) => (
        <DomeTube
          key={`crack-${index}`}
          points={points}
          radius={0.025}
          color="#05090b"
          opacity={0.92}
          renderOrder={-14}
        />
      ))}
      {cablePaths.map((points, index) => (
        <DomeTube
          key={`cable-${index}`}
          points={points}
          radius={0.018}
          color="#071014"
          opacity={0.95}
          renderOrder={-12}
        />
      ))}
      {DOME_BEACONS.map(([x, y]) => (
        <DomeBeacon key={`beacon-${x}-${y}`} x={x} y={y} />
      ))}
      {DOME_STRIP_LIGHTS.map(([x, y, angle]) => (
        <DomeStripLight key={`strip-${x}-${y}`} x={x} y={y} angle={angle} />
      ))}
    </group>
  );
}

interface WorldDomeMetrics {
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  baseHeight: number;
  capHeight: number;
}

const WORLD_DOME_OPENING_CENTER = new THREE.Vector2(0.22, -0.08);

const getWorldDomeMetrics = (maze: GameState["maze"]): WorldDomeMetrics => {
  const largestMazeSide = Math.max(maze.width, maze.height);

  return {
    centerX: 0,
    centerZ: 0,
    radiusX: Math.max(DOME_MIN_RADIUS, maze.width * 1.7 + DOME_RADIUS_PADDING),
    radiusZ: Math.max(DOME_MIN_RADIUS, maze.height * 1.7 + DOME_RADIUS_PADDING),
    baseHeight: DOME_BASE_HEIGHT,
    capHeight: Math.max(8.2, largestMazeSide * 0.38 + 5.6)
  };
};

const worldDomeNoise = (x: number, z: number): number =>
  Math.sin(x * 0.38 + z * 0.31) * 0.06 +
  Math.sin(x * 0.92 - z * 0.47) * 0.03;

const getWorldDomeY = (
  x: number,
  z: number,
  metrics: WorldDomeMetrics
): number => {
  const normalizedX = (x - metrics.centerX) / metrics.radiusX;
  const normalizedZ = (z - metrics.centerZ) / metrics.radiusZ;
  const radial = clamp(
    Math.sqrt(normalizedX * normalizedX + normalizedZ * normalizedZ),
    0,
    1
  );

  return (
    metrics.baseHeight +
    metrics.capHeight * Math.sqrt(Math.max(0, 1 - radial * radial)) +
    worldDomeNoise(x, z) * (1 - radial)
  );
};

const getWorldDomePoint = (
  x: number,
  z: number,
  metrics: WorldDomeMetrics,
  lift = 0
): THREE.Vector3 => new THREE.Vector3(x, getWorldDomeY(x, z, metrics) + lift, z);

const getWorldDomePointFromNormalized = (
  normalizedX: number,
  normalizedZ: number,
  metrics: WorldDomeMetrics,
  lift = 0
): THREE.Vector3 =>
  getWorldDomePoint(
    metrics.centerX + normalizedX * metrics.radiusX,
    metrics.centerZ + normalizedZ * metrics.radiusZ,
    metrics,
    lift
  );

const isInWorldDomeOpening = (
  x: number,
  z: number,
  metrics: WorldDomeMetrics,
  scale = 1
): boolean => {
  const normalizedX = (x - metrics.centerX) / metrics.radiusX;
  const normalizedZ = (z - metrics.centerZ) / metrics.radiusZ;
  const angle = Math.atan2(
    normalizedZ - WORLD_DOME_OPENING_CENTER.y,
    normalizedX - WORLD_DOME_OPENING_CENTER.x
  );
  const jaggedScale =
    scale *
    (1 +
      Math.sin(angle * 5.3) * 0.1 +
      Math.cos(angle * 8.6) * 0.07);
  const openingX =
    (normalizedX - WORLD_DOME_OPENING_CENTER.x) /
    (DOME_OPENING_RADIUS_X * jaggedScale);
  const openingZ =
    (normalizedZ - WORLD_DOME_OPENING_CENTER.y) /
    (DOME_OPENING_RADIUS_Z * jaggedScale);

  return openingX * openingX + openingZ * openingZ < 1;
};

const createWorldDomeGeometry = (
  metrics: WorldDomeMetrics
): THREE.BufferGeometry => {
  const rings = 40;
  const segments = 144;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();

  for (let ring = 0; ring <= rings; ring += 1) {
    const radius = ring / rings;

    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const x = metrics.centerX + Math.cos(angle) * metrics.radiusX * radius;
      const z = metrics.centerZ + Math.sin(angle) * metrics.radiusZ * radius;
      const y = getWorldDomeY(x, z, metrics);
      const panelPulse =
        Math.floor((segment / segments + 0.02) * 18) % 2 ===
        Math.floor((radius + 0.01) * 9) % 2
          ? 0.035
          : -0.012;
      const shade = clamp(0.16 + (1 - radius) * 0.17 + panelPulse, 0, 1);

      vertices.push(x, y, z);
      color.setRGB(
        0.034 + shade * 0.07,
        0.046 + shade * 0.085,
        0.048 + shade * 0.08
      );
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const first = ring * (segments + 1) + segment;
      const second = first + segments + 1;
      const centerX = (vertices[first * 3] + vertices[(first + 1) * 3]) * 0.5;
      const centerZ = (vertices[first * 3 + 2] + vertices[(second + 1) * 3 + 2]) * 0.5;

      if (isInWorldDomeOpening(centerX, centerZ, metrics, 1.05)) {
        continue;
      }

      indices.push(first, first + 1, second, first + 1, second + 1, second);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createWorldDomeOpeningPoints = (
  metrics: WorldDomeMetrics
): THREE.Vector3[] =>
  Array.from({ length: 32 }, (_item, index) => {
    const angle = (index / 32) * Math.PI * 2;
    const jagged =
      1 +
      Math.sin(angle * 4.7) * 0.1 +
      Math.cos(angle * 8.2) * 0.08 +
      (index % 5 === 0 ? 0.14 : 0);
    const normalizedX =
      WORLD_DOME_OPENING_CENTER.x +
      Math.cos(angle) * DOME_OPENING_RADIUS_X * jagged +
      Math.sin(angle * 2.4) * 0.012;
    const normalizedZ =
      WORLD_DOME_OPENING_CENTER.y +
      Math.sin(angle) * DOME_OPENING_RADIUS_Z * jagged +
      Math.cos(angle * 3.1) * 0.008;

    return getWorldDomePointFromNormalized(normalizedX, normalizedZ, metrics, 0.06);
  });

const createWorldOpeningFillGeometry = (
  rimPoints: THREE.Vector3[],
  metrics: WorldDomeMetrics
): THREE.BufferGeometry => {
  const center = getWorldDomePointFromNormalized(
    WORLD_DOME_OPENING_CENTER.x,
    WORLD_DOME_OPENING_CENTER.y,
    metrics,
    0.12
  );
  const vertices = center.toArray();
  const indices: number[] = [];

  rimPoints.forEach((point) => {
    vertices.push(point.x, point.y + 0.02, point.z);
  });

  for (let index = 0; index < rimPoints.length; index += 1) {
    const next = index === rimPoints.length - 1 ? 1 : index + 2;
    indices.push(0, index + 1, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createWorldDomeRingPaths = (
  metrics: WorldDomeMetrics
): THREE.Vector3[][] => {
  const paths: THREE.Vector3[][] = [];

  DOME_RING_SCALES.forEach((scale) => {
    let current: THREE.Vector3[] = [];

    for (let segment = 0; segment <= 144; segment += 1) {
      const angle = (segment / 144) * Math.PI * 2;
      const x = metrics.centerX + Math.cos(angle) * metrics.radiusX * scale;
      const z = metrics.centerZ + Math.sin(angle) * metrics.radiusZ * scale;

      if (!isInWorldDomeOpening(x, z, metrics, 1.12)) {
        current.push(getWorldDomePoint(x, z, metrics, 0.06));
      } else {
        pushPath(paths, current);
        current = [];
      }
    }

    pushPath(paths, current);
  });

  return paths;
};

const createWorldDomeRibPaths = (
  metrics: WorldDomeMetrics
): THREE.Vector3[][] => {
  const paths: THREE.Vector3[][] = [];

  DOME_RIB_ANGLES.forEach((degrees) => {
    const angle = THREE.MathUtils.degToRad(degrees);
    let current: THREE.Vector3[] = [];

    for (let step = 0; step <= 64; step += 1) {
      const scale = THREE.MathUtils.lerp(0.16, 1.02, step / 64);
      const x = metrics.centerX + Math.cos(angle) * metrics.radiusX * scale;
      const z = metrics.centerZ + Math.sin(angle) * metrics.radiusZ * scale;

      if (!isInWorldDomeOpening(x, z, metrics, 1.08)) {
        current.push(getWorldDomePoint(x, z, metrics, 0.08));
      } else {
        pushPath(paths, current);
        current = [];
      }
    }

    pushPath(paths, current);
  });

  return paths;
};

const createWorldCablePaths = (metrics: WorldDomeMetrics): THREE.Vector3[][] =>
  [
    [0.16, -0.17, 0.08, -0.02],
    [0.22, -0.18, 0.07, 0.014],
    [0.28, -0.14, 0.08, -0.01],
    [0.33, -0.09, 0.07, 0.018]
  ].map(([normalizedX, normalizedZ, length, sway]) => [
    getWorldDomePointFromNormalized(normalizedX, normalizedZ, metrics, 0.12),
    getWorldDomePointFromNormalized(
      normalizedX + sway,
      normalizedZ - length * 0.38,
      metrics,
      0.08
    ),
    getWorldDomePointFromNormalized(
      normalizedX - sway * 0.45,
      normalizedZ - length,
      metrics,
      0.04
    )
  ]);

const createWorldCrackPaths = (metrics: WorldDomeMetrics): THREE.Vector3[][] =>
  [
    [
      [0.13, -0.14],
      [0.07, -0.2],
      [0.02, -0.26]
    ],
    [
      [0.32, -0.13],
      [0.4, -0.18],
      [0.46, -0.24]
    ],
    [
      [0.18, -0.2],
      [0.14, -0.28],
      [0.09, -0.34]
    ],
    [
      [0.26, -0.19],
      [0.28, -0.28],
      [0.34, -0.34]
    ],
    [
      [0.22, 0.03],
      [0.2, 0.09],
      [0.16, 0.15]
    ]
  ].map((path) =>
    path.map(([normalizedX, normalizedZ]) =>
      getWorldDomePointFromNormalized(normalizedX, normalizedZ, metrics, 0.08)
    )
  );

function WorldDomeBeacon({
  normalizedX,
  normalizedZ,
  metrics
}: {
  normalizedX: number;
  normalizedZ: number;
  metrics: WorldDomeMetrics;
}) {
  const point = getWorldDomePointFromNormalized(
    normalizedX,
    normalizedZ,
    metrics,
    0.12
  );

  return (
    <group position={point.toArray()}>
      <mesh renderOrder={-13}>
        <sphereGeometry args={[0.16, 16, 8]} />
        <meshBasicMaterial color="#ff5b4a" fog={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={-14}>
        <sphereGeometry args={[0.58, 20, 10]} />
        <meshBasicMaterial
          color="#ff2f28"
          depthWrite={false}
          fog={false}
          opacity={0.18}
          toneMapped={false}
          transparent
        />
      </mesh>
      <pointLight color="#ff4a3c" decay={2} distance={3.8} intensity={0.45} />
    </group>
  );
}

function WorldDomeStripLight({
  normalizedX,
  normalizedZ,
  angle,
  metrics
}: {
  normalizedX: number;
  normalizedZ: number;
  angle: number;
  metrics: WorldDomeMetrics;
}) {
  const point = getWorldDomePointFromNormalized(
    normalizedX,
    normalizedZ,
    metrics,
    0.12
  );

  return (
    <group position={point.toArray()} rotation={[0, angle, 0]}>
      <mesh renderOrder={-13}>
        <boxGeometry args={[0.18, 0.06, 1.2]} />
        <meshBasicMaterial color="#d8fbff" fog={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={-14}>
        <boxGeometry args={[0.42, 0.04, 1.55]} />
        <meshBasicMaterial
          color="#9cecff"
          depthWrite={false}
          fog={false}
          opacity={0.2}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  );
}

function ReactorDome({ state }: { state: GameState }) {
  const metrics = useMemo(
    () => getWorldDomeMetrics(state.maze),
    [state.maze.height, state.maze.width]
  );
  const domeGeometry = useMemo(
    () => createWorldDomeGeometry(metrics),
    [metrics]
  );
  const openingPoints = useMemo(
    () => createWorldDomeOpeningPoints(metrics),
    [metrics]
  );
  const openingGeometry = useMemo(
    () => createWorldOpeningFillGeometry(openingPoints, metrics),
    [metrics, openingPoints]
  );
  const ringPaths = useMemo(() => createWorldDomeRingPaths(metrics), [metrics]);
  const ribPaths = useMemo(() => createWorldDomeRibPaths(metrics), [metrics]);
  const cablePaths = useMemo(() => createWorldCablePaths(metrics), [metrics]);
  const crackPaths = useMemo(() => createWorldCrackPaths(metrics), [metrics]);

  return (
    <group>
      <mesh geometry={openingGeometry} renderOrder={-34}>
        <meshBasicMaterial
          color="#7f98a2"
          depthWrite={false}
          fog={false}
          opacity={0.32}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh geometry={domeGeometry} renderOrder={-30}>
        <meshBasicMaterial
          color="#243235"
          depthWrite={false}
          fog={false}
          opacity={0.94}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
          vertexColors
        />
      </mesh>
      {ringPaths.map((points, index) => (
        <DomeTube
          key={`world-ring-${index}`}
          points={points}
          radius={index % 2 === 0 ? 0.035 : 0.026}
          color="#283940"
          opacity={0.68}
        />
      ))}
      {ribPaths.map((points, index) => (
        <DomeTube
          key={`world-rib-${index}`}
          points={points}
          radius={0.038}
          color="#101a1f"
          opacity={0.86}
        />
      ))}
      <DomeTube
        points={openingPoints}
        radius={0.11}
        color="#070c0f"
        opacity={0.96}
        closed
        renderOrder={-15}
      />
      {crackPaths.map((points, index) => (
        <DomeTube
          key={`world-crack-${index}`}
          points={points}
          radius={0.03}
          color="#05090b"
          opacity={0.92}
          renderOrder={-14}
        />
      ))}
      {cablePaths.map((points, index) => (
        <DomeTube
          key={`world-cable-${index}`}
          points={points}
          radius={0.022}
          color="#071014"
          opacity={0.95}
          renderOrder={-12}
        />
      ))}
      {DOME_BEACONS.map(([normalizedX, normalizedZ]) => (
        <WorldDomeBeacon
          key={`world-beacon-${normalizedX}-${normalizedZ}`}
          normalizedX={normalizedX}
          normalizedZ={normalizedZ}
          metrics={metrics}
        />
      ))}
      {DOME_STRIP_LIGHTS.map(([normalizedX, normalizedZ, angle]) => (
        <WorldDomeStripLight
          key={`world-strip-${normalizedX}-${normalizedZ}`}
          normalizedX={normalizedX}
          normalizedZ={normalizedZ}
          angle={angle}
          metrics={metrics}
        />
      ))}
    </group>
  );
}

function MazeFloor({ maze }: { maze: GameState["maze"] }) {
  return (
    <mesh position={[0, -0.065, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[maze.width, maze.height]} />
      <meshStandardMaterial
        color="#14212a"
        roughness={0.86}
        metalness={0.04}
      />
    </mesh>
  );
}

function WallBlock({
  position,
  texture,
  topTexture
}: {
  position: [number, number, number];
  texture: THREE.Texture;
  topTexture: THREE.Texture;
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
          map={topTexture}
          color="#dbe9e8"
          roughness={0.7}
          metalness={0.08}
        />
      </mesh>
    </group>
  );
}

function HotspotMarker({ maze, hotspot }: { maze: GameState["maze"]; hotspot: Hotspot }) {
  const group = useRef<THREE.Group>(null);
  const aura = useRef<THREE.Mesh>(null);
  const position = toWorld(maze, hotspot.position);

  useFrame(({ clock }) => {
    if (hotspot.sealed) return;

    const pulse = 1 + Math.sin(clock.elapsedTime * 4.2) * 0.045;
    if (group.current) {
      group.current.scale.setScalar(pulse);
    }

    if (aura.current) {
      const auraPulse = 1.06 + Math.sin(clock.elapsedTime * 2.4) * 0.08;
      aura.current.scale.setScalar(auraPulse);
    }
  });

  if (hotspot.sealed) {
    return (
      <group position={[position[0], 0.035, position[2]]}>
        <mesh>
          <cylinderGeometry args={[0.42, 0.46, 0.08, 18]} />
          <meshStandardMaterial
            color="#d9fff2"
            roughness={0.58}
            metalness={0.02}
          />
        </mesh>
        <mesh position={[0.11, 0.08, -0.05]}>
          <sphereGeometry args={[0.13, 12, 8]} />
          <meshStandardMaterial
            color="#b8f5e4"
            emissive="#75e6d0"
            emissiveIntensity={0.12}
            roughness={0.42}
          />
        </mesh>
        <mesh position={[-0.13, 0.075, 0.07]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial color="#f0fffb" roughness={0.5} />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={group} position={[position[0], 0.005, position[2]]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[0.48, 0.42, 0.08, 6]} />
        <meshStandardMaterial
          color="#142816"
          emissive="#0f8f45"
          emissiveIntensity={0.3}
          roughness={0.68}
          metalness={0.16}
        />
      </mesh>
      <mesh position={[0, 0.028, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.025, 8, 36]} />
        <meshStandardMaterial
          color="#c8f55f"
          emissive="#58e96b"
          emissiveIntensity={0.85}
          roughness={0.35}
        />
      </mesh>
      {RADIATION_BLADE_ANGLES.map((angle) => (
        <mesh
          key={angle}
          position={[Math.sin(angle) * 0.16, 0.05, Math.cos(angle) * 0.16]}
          rotation={[-Math.PI / 2, 0, -angle]}
        >
          <circleGeometry args={[0.17, 3]} />
          <meshStandardMaterial
            color="#b6f34a"
            emissive="#39ff88"
            emissiveIntensity={0.95}
            roughness={0.42}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      <mesh ref={aura} position={[0, 0.12, 0]}>
        <sphereGeometry args={[0.44, 18, 12]} />
        <meshBasicMaterial
          color="#39ff88"
          depthWrite={false}
          opacity={0.14}
          transparent
        />
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
  const wallTopTexture = useWallTopTexture();
  const initialOverheadPosition = useMemo<[number, number, number]>(
    () => [
      0,
      Math.max(18, Math.max(state.maze.width, state.maze.height) * 2.2),
      0
    ],
    [state.maze.height, state.maze.width]
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
            position={initialOverheadPosition}
            up={[0, 0, -1]}
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
      {viewMode === "robot" ? <ReactorDome state={state} /> : null}
      <ambientLight intensity={viewMode === "robot" ? 0.38 : 0.55} />
      {viewMode === "robot" ? <RobotHeadlamp state={state} /> : null}
      <directionalLight
        castShadow
        position={[4, 9, 6]}
        intensity={viewMode === "robot" ? 0.72 : 1.05}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {viewMode === "robot" ? (
        <>
          <MazeFloor maze={state.maze} />
          <ServicePipes maze={state.maze} />
        </>
      ) : null}
      {state.maze.cells.flatMap((row) =>
        row.map((cell) => {
          const world = toWorld(state.maze, { x: cell.x, y: cell.y });
          return cell.wall ? (
            <WallBlock
              key={`${cell.x}-${cell.y}`}
              position={world}
              texture={wallTextures[getWallTextureIndex(state.seed, cell.x, cell.y)]}
              topTexture={wallTopTexture}
            />
          ) : null;
        })
      )}
      <ExtractionPlatform maze={state.maze} position={state.maze.extraction} />
      {state.hotspots.map((hotspot) => (
        <HotspotMarker key={hotspot.id} maze={state.maze} hotspot={hotspot} />
      ))}
      {viewMode === "robot" ? <SensorHint state={state} /> : null}
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
