import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import floorTextureUrl from "../../public/images/floor1.jpg";
import labWallTextureUrl from "../../public/images/lab1.jpg";
import labWallTextureTwoUrl from "../../public/images/lab2.jpg";
import officeWallTextureUrl from "../../public/images/office1.jpg";
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
const REACTOR_ROOF_START_LEVEL = 4;

const REACTOR_WALL_TEXTURE_PATHS = [
  wallTextureOneUrl,
  wallTextureTwoUrl,
  wallTextureFiveUrl
];
const WALL_TEXTURE_PATHS = [
  ...REACTOR_WALL_TEXTURE_PATHS,
  labWallTextureUrl,
  labWallTextureTwoUrl,
  officeWallTextureUrl
];
const WALL_TOP_TEXTURE_PATH = floorTextureUrl;
const LAB_ROOF_HEIGHT = 3.35;
const LAB_ROOF_PADDING = 8;
const LAB_ROOF_PANEL_SPACING = 2.4;
const EARLY_BACKDROP_PADDING = 8;
const EARLY_BACKDROP_HEIGHT = 5.8;
const EARLY_BACKDROP_TILE_SIZE = 3.2;
const FOAM_EFFECT_DURATION_MS = 1300;
const WATER_NORMAL_TEXTURE_SIZE = 128;
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

const CRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) }
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      vec2 cc = uv - 0.5;
      float dist = dot(cc, cc);
      uv = uv + cc * dist * 0.22;

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      float chromaOffset = 0.0024;
      float r = texture2D(tDiffuse, uv + vec2(chromaOffset, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(chromaOffset, 0.0)).b;
      vec3 color = vec3(r, g, b);

      float scanline = sin(uv.y * resolution.y * 1.45) * 0.065;
      color -= scanline;

      float noise = rand(uv * (time * 34.0 + 1.0)) * 0.035;
      color += noise;

      color *= 0.97 + 0.035 * sin(time * 20.0);

      float vignette = smoothstep(0.82, 0.26, length(cc));
      color *= vignette;

      color = pow(max(color, vec3(0.0)), vec3(0.96));
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

const createWaterReflectorShader = (normalMap: THREE.Texture) => ({
  name: "ReactorWaterReflectorShader",
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    time: { value: 0 },
    normalMap: { value: normalMap }
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;

    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform sampler2D normalMap;
    uniform float time;
    varying vec4 vUv;

    #include <logdepthbuf_pars_fragment>

    float blendOverlay(float base, float blend) {
      return base < 0.5
        ? 2.0 * base * blend
        : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
    }

    vec3 blendOverlay(vec3 base, vec3 blend) {
      return vec3(
        blendOverlay(base.r, blend.r),
        blendOverlay(base.g, blend.g),
        blendOverlay(base.b, blend.b)
      );
    }

    void main() {
      #include <logdepthbuf_fragment>

      vec2 rippleUv = vUv.xy / max(vUv.w, 0.0001);
      vec2 flow = vec2(time * 0.035, time * 0.018);

      vec3 n1 = texture2D(normalMap, rippleUv * 5.8 + flow).rgb;
      vec3 n2 = texture2D(normalMap, rippleUv * 10.5 - flow.yx).rgb;
      vec2 distortion = ((n1.rg + n2.rg) - 1.0) * 0.028;

      vec4 projectedUv = vUv + vec4(distortion * vUv.w, 0.0, 0.0);
      vec4 base = texture2DProj(tDiffuse, projectedUv);
      base.rgb *= vec3(0.66, 0.86, 1.05);
      base.rgb += 0.055;

      float shimmer = sin((rippleUv.x + rippleUv.y) * 48.0 + time * 4.5) * 0.025;
      base.rgb += shimmer;

      vec3 reflected = blendOverlay(base.rgb, color);
      gl_FragColor = vec4(reflected, 1.0);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
});

const createProceduralWaterNormalTexture = (): THREE.DataTexture => {
  const size = WATER_NORMAL_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const waveA = Math.sin((u * 18 + v * 4) * Math.PI * 2);
      const waveB = Math.cos((v * 15 - u * 3) * Math.PI * 2);
      const waveC = Math.sin((u + v) * Math.PI * 34);
      const normalX = waveA * 0.34 + waveC * 0.16;
      const normalY = waveB * 0.34 - waveC * 0.14;
      const offset = (y * size + x) * 4;

      data[offset] = Math.round((normalX * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((normalY * 0.5 + 0.5) * 255);
      data[offset + 2] = 255;
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.needsUpdate = true;
  return texture;
};

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

const getLabTwoWallKeys = (state: GameState): Set<string> => {
  const wallCells = state.maze.cells
    .flatMap((row) => row.filter((cell) => cell.wall))
    .sort(
      (first, second) =>
        hashWallCell(`${state.seed}:lab2`, first.x, first.y) -
        hashWallCell(`${state.seed}:lab2`, second.x, second.y)
    );
  const labTwoCount = Math.ceil(wallCells.length * 0.5);

  return new Set(
    wallCells
      .slice(0, labTwoCount)
      .map((cell) => `${cell.x},${cell.y}`)
  );
};

interface WallTextureSet {
  reactor: [THREE.Texture, THREE.Texture, THREE.Texture];
  lab: [THREE.Texture, THREE.Texture];
  office: THREE.Texture;
}

function useWallTextures(): WallTextureSet {
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

    return {
      reactor: [textures[0], textures[1], textures[2]],
      lab: [textures[3], textures[4]],
      office: textures[5]
    };
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

function SceneBackground({
  earlyLevel,
  viewMode
}: {
  earlyLevel: boolean;
  viewMode: CameraViewMode;
}) {
  const backgroundColor =
    earlyLevel && viewMode === "overhead" ? "#1d2832" : earlyLevel ? "#eef4f2" : "#243342";

  return (
    <color attach="background" args={[backgroundColor]} />
  );
}

function EarlyLevelParallaxBackdrop({ maze }: { maze: GameState["maze"] }) {
  const sourceTexture = useTexture(officeWallTextureUrl);
  const width = Math.max(maze.width + EARLY_BACKDROP_PADDING, 18);
  const depth = Math.max(maze.height + EARLY_BACKDROP_PADDING, 18);
  const backdropExtent = Math.max(width, depth);
  const centerY = EARLY_BACKDROP_HEIGHT / 2 - 0.08;
  const backdropTexture = useMemo(() => {
    const texture = sourceTexture.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(
      Math.max(3, backdropExtent / EARLY_BACKDROP_TILE_SIZE),
      Math.max(2, EARLY_BACKDROP_HEIGHT / EARLY_BACKDROP_TILE_SIZE)
    );
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, [backdropExtent, sourceTexture]);

  useEffect(
    () => () => {
      backdropTexture.dispose();
    },
    [backdropTexture]
  );

  return (
    <group renderOrder={-40}>
      <mesh position={[0, centerY, -depth / 2]}>
        <planeGeometry args={[width, EARLY_BACKDROP_HEIGHT]} />
        <meshBasicMaterial
          map={backdropTexture}
          color="#ffffff"
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, centerY, depth / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, EARLY_BACKDROP_HEIGHT]} />
        <meshBasicMaterial
          map={backdropTexture}
          color="#ffffff"
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-width / 2, centerY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth, EARLY_BACKDROP_HEIGHT]} />
        <meshBasicMaterial
          map={backdropTexture}
          color="#ffffff"
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[width / 2, centerY, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[depth, EARLY_BACKDROP_HEIGHT]} />
        <meshBasicMaterial
          map={backdropTexture}
          color="#ffffff"
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
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

function RobotCRTPostProcessing() {
  const { gl, scene, camera, size } = useThree();
  const passes = useMemo(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const crtPass = new ShaderPass(CRTShader);
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(crtPass);
    composer.addPass(outputPass);

    return { composer, renderPass, crtPass };
  }, [camera, gl, scene]);

  useEffect(() => {
    const pixelRatio = gl.getPixelRatio();
    passes.composer.setSize(size.width, size.height);
    passes.crtPass.uniforms.resolution.value.set(
      size.width * pixelRatio,
      size.height * pixelRatio
    );
  }, [gl, passes, size.height, size.width]);

  useEffect(
    () => () => {
      passes.composer.dispose();
    },
    [passes]
  );

  useFrame(({ clock }) => {
    passes.renderPass.camera = camera;
    passes.crtPass.uniforms.time.value = clock.elapsedTime;
    passes.composer.render();
  }, 1);

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
          color="#9eb8c2"
          depthWrite={false}
          fog={false}
          opacity={0.38}
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh geometry={domeGeometry} renderOrder={-30}>
        <meshBasicMaterial
          color="#3d535a"
          depthWrite={false}
          fog={false}
          opacity={0.9}
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
          color="#536d75"
          opacity={0.72}
        />
      ))}
      {ribPaths.map((points, index) => (
        <DomeTube
          key={`world-rib-${index}`}
          points={points}
          radius={0.038}
          color="#23343b"
          opacity={0.78}
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

const createLabRoofLinePositions = (extent: number): number[] => {
  const half = extent / 2;
  const positions: number[] = [];

  for (
    let position = -half;
    position <= half + 0.01;
    position += LAB_ROOF_PANEL_SPACING
  ) {
    positions.push(Number(position.toFixed(3)));
  }

  return positions;
};

const createLabRoofLightPositions = (
  width: number,
  depth: number
): Array<{ x: number; z: number; rotation: number }> => {
  const columns = width > 18 ? [-width * 0.26, 0, width * 0.26] : [-width * 0.22, width * 0.22];
  const rows = depth > 18 ? [-depth * 0.24, 0, depth * 0.24] : [-depth * 0.2, depth * 0.2];

  return rows.flatMap((z, rowIndex) =>
    columns.map((x) => ({
      x,
      z,
      rotation: rowIndex % 2 === 0 ? 0 : Math.PI / 2
    }))
  );
};

function LabRoof({ maze }: { maze: GameState["maze"] }) {
  const width = Math.max(maze.width + LAB_ROOF_PADDING, 18);
  const depth = Math.max(maze.height + LAB_ROOF_PADDING, 18);
  const xLines = useMemo(() => createLabRoofLinePositions(width), [width]);
  const zLines = useMemo(() => createLabRoofLinePositions(depth), [depth]);
  const stripLights = useMemo(
    () => createLabRoofLightPositions(width, depth),
    [depth, width]
  );

  return (
    <group>
      <mesh position={[0, LAB_ROOF_HEIGHT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color="#e9f5f1"
          emissive="#c9fff3"
          emissiveIntensity={0.12}
          metalness={0.02}
          roughness={0.62}
          side={THREE.DoubleSide}
        />
      </mesh>
      {xLines.map((x) => (
        <mesh key={`lab-roof-x-${x}`} position={[x, LAB_ROOF_HEIGHT - 0.025, 0]}>
          <boxGeometry args={[0.026, 0.018, depth]} />
          <meshBasicMaterial color="#b8c9c8" toneMapped={false} />
        </mesh>
      ))}
      {zLines.map((z) => (
        <mesh key={`lab-roof-z-${z}`} position={[0, LAB_ROOF_HEIGHT - 0.024, z]}>
          <boxGeometry args={[width, 0.018, 0.026]} />
          <meshBasicMaterial color="#b8c9c8" toneMapped={false} />
        </mesh>
      ))}
      {stripLights.map((light) => (
        <group
          key={`lab-light-${light.x}-${light.z}`}
          position={[light.x, LAB_ROOF_HEIGHT - 0.06, light.z]}
          rotation={[0, light.rotation, 0]}
        >
          <mesh>
            <boxGeometry args={[1.8, 0.028, 0.22]} />
            <meshBasicMaterial color="#f7fffb" toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.018, 0]}>
            <boxGeometry args={[2.25, 0.018, 0.46]} />
            <meshBasicMaterial
              color="#aefcff"
              depthWrite={false}
              opacity={0.28}
              toneMapped={false}
              transparent
            />
          </mesh>
        </group>
      ))}
      <pointLight
        position={[0, LAB_ROOF_HEIGHT - 0.25, 0]}
        color="#f0fff9"
        decay={1.2}
        distance={Math.max(width, depth)}
        intensity={0.82}
      />
    </group>
  );
}

function MazeFloor({
  maze,
  earlyOverhead = false
}: {
  maze: GameState["maze"];
  earlyOverhead?: boolean;
}) {
  return (
    <mesh position={[0, -0.065, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[maze.width, maze.height]} />
      <meshStandardMaterial
        color={earlyOverhead ? "#23313b" : "#14212a"}
        roughness={earlyOverhead ? 0.78 : 0.86}
        metalness={0.04}
      />
    </mesh>
  );
}

function ReactorWaterFloor({ maze }: { maze: GameState["maze"] }) {
  const { gl, size } = useThree();
  const waterNormals = useMemo(createProceduralWaterNormalTexture, []);
  const reflector = useMemo(() => {
    const pixelRatio = gl.getPixelRatio();
    const textureWidth = Math.min(
      1024,
      Math.max(512, Math.round(size.width * pixelRatio))
    );
    const textureHeight = Math.min(
      1024,
      Math.max(512, Math.round(size.height * pixelRatio))
    );
    const geometry = new THREE.PlaneGeometry(
      Math.max(maze.width + 0.2, 4),
      Math.max(maze.height + 0.2, 4)
    );
    const water = new Reflector(geometry, {
      textureWidth,
      textureHeight,
      color: 0x88aacc,
      clipBias: 0.003,
      multisample: 2,
      shader: createWaterReflectorShader(waterNormals)
    });

    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.052;
    water.renderOrder = -2;
    return water;
  }, [gl, maze.height, maze.width, size.height, size.width, waterNormals]);

  useFrame(({ clock }) => {
    const material = reflector.material as THREE.ShaderMaterial;
    if (material.uniforms.time) {
      material.uniforms.time.value = clock.elapsedTime;
    }
  });

  useEffect(
    () => () => {
      reflector.geometry.dispose();
      reflector.dispose();
    },
    [reflector]
  );

  useEffect(
    () => () => {
      waterNormals.dispose();
    },
    [waterNormals]
  );

  return <primitive object={reflector} />;
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

interface FoamDeployEffectEvent {
  id: string;
  position: [number, number, number];
  sealedHotspot: boolean;
}

const FOAM_BURST_BUBBLES = [
  { offset: [0, 0] as const, radius: 0.34, lift: 0.54, delay: 0 },
  { offset: [0.28, -0.1] as const, radius: 0.22, lift: 0.38, delay: 0.03 },
  { offset: [-0.24, 0.15] as const, radius: 0.2, lift: 0.42, delay: 0.05 },
  { offset: [0.1, 0.3] as const, radius: 0.18, lift: 0.34, delay: 0.08 },
  { offset: [-0.32, -0.22] as const, radius: 0.16, lift: 0.36, delay: 0.1 },
  { offset: [0.34, 0.24] as const, radius: 0.15, lift: 0.3, delay: 0.12 }
];

function FoamDeployEffect({ event }: { event: FoamDeployEffectEvent }) {
  const startedAt = useRef<number | null>(null);
  const bubbleRefs = useRef<THREE.Mesh[]>([]);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const shockwaveMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (startedAt.current === null) {
      startedAt.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - startedAt.current;

    FOAM_BURST_BUBBLES.forEach((bubble, index) => {
      const mesh = bubbleRefs.current[index];
      if (!mesh) return;

      const localElapsed = elapsed - bubble.delay;
      if (localElapsed < 0) {
        mesh.visible = false;
        return;
      }

      const progress = clamp(localElapsed / 0.82, 0, 1);
      mesh.visible = progress < 1;
      mesh.position.set(
        bubble.offset[0] * progress,
        0.1 + bubble.lift * Math.sin(progress * Math.PI * 0.82),
        bubble.offset[1] * progress
      );
      mesh.scale.setScalar(bubble.radius * THREE.MathUtils.lerp(0.55, 2.2, progress));

      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.78 * (1 - progress));
    });

    if (lightRef.current) {
      lightRef.current.intensity = Math.max(0, 2.4 * (1 - elapsed / 0.7));
    }

    if (shockwaveRef.current && shockwaveMaterialRef.current) {
      const progress = clamp((elapsed - 0.1) / 0.74, 0, 1);
      shockwaveRef.current.visible = event.sealedHotspot && progress < 1;
      const scale = THREE.MathUtils.lerp(0.7, 3.6, progress);
      shockwaveRef.current.scale.set(scale, scale, scale);
      shockwaveMaterialRef.current.opacity = Math.max(0, 0.64 * (1 - progress));
    }
  });

  return (
    <group position={[event.position[0], 0.04, event.position[2]]}>
      {FOAM_BURST_BUBBLES.map((bubble, index) => (
        <mesh
          key={`foam-bubble-${event.id}-${index}`}
          ref={(mesh) => {
            if (mesh) {
              bubbleRefs.current[index] = mesh;
            }
          }}
        >
          <sphereGeometry args={[1, 14, 10]} />
          <meshBasicMaterial
            color={index % 2 === 0 ? "#f0fffb" : "#b8fff2"}
            depthWrite={false}
            opacity={0.72}
            toneMapped={false}
            transparent
          />
        </mesh>
      ))}
      {event.sealedHotspot ? (
        <mesh ref={shockwaveRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.36, 0.52, 64]} />
          <meshBasicMaterial
            ref={shockwaveMaterialRef}
            color="#9cffef"
            depthWrite={false}
            opacity={0.62}
            side={THREE.DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
      ) : null}
      <pointLight
        ref={lightRef}
        color="#cffff7"
        decay={1.7}
        distance={3.4}
        intensity={2.4}
      />
    </group>
  );
}

function FoamDeploymentEffects({ state }: { state: GameState }) {
  const [events, setEvents] = useState<FoamDeployEffectEvent[]>([]);
  const previousState = useRef<GameState | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    },
    []
  );

  useEffect(() => {
    const previous = previousState.current;
    if (!previous || previous.level !== state.level || previous.seed !== state.seed) {
      previousState.current = state;
      setEvents([]);
      return;
    }

    if (
      state.actionsUsed < previous.actionsUsed ||
      state.foamCharges > previous.foamCharges
    ) {
      previousState.current = state;
      setEvents([]);
      return;
    }

    if (state.foamCharges < previous.foamCharges) {
      const sealedHotspot = state.hotspots.find((hotspot) => {
        const previousHotspot = previous.hotspots.find(
          (item) => item.id === hotspot.id
        );
        return hotspot.sealed && previousHotspot && !previousHotspot.sealed;
      });
      const effectPosition = sealedHotspot?.position ?? state.position;
      const id = `${state.seed}-${state.actionsUsed}-${state.foamCharges}-${Date.now()}`;
      const event: FoamDeployEffectEvent = {
        id,
        position: toWorld(state.maze, effectPosition),
        sealedHotspot: Boolean(sealedHotspot)
      };

      setEvents((current) => [...current.slice(-5), event]);
      const timer = window.setTimeout(() => {
        setEvents((current) => current.filter((item) => item.id !== id));
      }, FOAM_EFFECT_DURATION_MS);
      timers.current.push(timer);
    }

    previousState.current = state;
  }, [state]);

  return (
    <>
      {events.map((event) => (
        <FoamDeployEffect key={event.id} event={event} />
      ))}
    </>
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
  const useBrightScene = state.level < REACTOR_ROOF_START_LEVEL;
  const useLabRoof = state.level <= 2;
  const useLabWallTextures = state.level <= 2;
  const labTwoWalls = useMemo(
    () => (useLabWallTextures ? getLabTwoWallKeys(state) : new Set<string>()),
    [state.maze, state.seed, useLabWallTextures]
  );
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
      {viewMode === "robot" ? (
        <fog
          attach="fog"
          args={useBrightScene ? ["#ffffff", 7, 22] : ["#223443", 4.2, 19]}
        />
      ) : null}
      {viewMode === "robot" && useBrightScene ? (
        <EarlyLevelParallaxBackdrop maze={state.maze} />
      ) : null}
      {viewMode === "robot" ? (
        useLabRoof ? (
          <LabRoof maze={state.maze} />
        ) : state.level >= REACTOR_ROOF_START_LEVEL ? (
          <ReactorDome state={state} />
        ) : null
      ) : null}
      <ambientLight
        intensity={
          viewMode === "robot" ? (useBrightScene ? 0.72 : 0.58) : useBrightScene ? 0.48 : 0.72
        }
      />
      {viewMode === "robot" && !useBrightScene ? (
        <hemisphereLight
          color="#d8f7ff"
          groundColor="#47576a"
          intensity={0.34}
        />
      ) : null}
      {viewMode === "robot" && useBrightScene ? (
        <hemisphereLight
          color="#f2fff9"
          groundColor="#889da3"
          intensity={0.5}
        />
      ) : null}
      {viewMode === "robot" ? <RobotHeadlamp state={state} /> : null}
      <directionalLight
        castShadow
        position={[4, 9, 6]}
        intensity={
          viewMode === "robot" ? (useBrightScene ? 1.15 : 0.98) : useBrightScene ? 0.82 : 1.18
        }
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {viewMode === "robot" || viewMode === "overhead" ? (
        <>
          <MazeFloor
            maze={state.maze}
            earlyOverhead={useBrightScene && viewMode === "overhead"}
          />
          {!useBrightScene ? <ReactorWaterFloor maze={state.maze} /> : null}
          {viewMode === "robot" ? <ServicePipes maze={state.maze} /> : null}
        </>
      ) : null}
      {state.maze.cells.flatMap((row) =>
        row.map((cell) => {
          const world = toWorld(state.maze, { x: cell.x, y: cell.y });
          return cell.wall ? (
            <WallBlock
              key={`${cell.x}-${cell.y}`}
              position={world}
              texture={
                useLabWallTextures
                  ? wallTextures.lab[
                      labTwoWalls.has(`${cell.x},${cell.y}`) ? 1 : 0
                    ]
                  : state.level === 3
                    ? wallTextures.office
                  : wallTextures.reactor[
                      getWallTextureIndex(state.seed, cell.x, cell.y)
                    ]
              }
              topTexture={wallTopTexture}
            />
          ) : null;
        })
      )}
      <ExtractionPlatform maze={state.maze} position={state.maze.extraction} />
      {state.hotspots.map((hotspot) => (
        <HotspotMarker key={hotspot.id} maze={state.maze} hotspot={hotspot} />
      ))}
      <FoamDeploymentEffects state={state} />
      {viewMode === "robot" ? <SensorHint state={state} /> : null}
      {viewMode === "overhead" ? <RobotModel state={state} /> : null}
    </>
  );
}

const getRoomLabel = (level: number): { kicker: string; label: string } => {
  if (level === 1) {
    return { kicker: "Level 1", label: "Advanced Robotics" };
  }

  if (level === 2) {
    return { kicker: "Level 2", label: "More Advanced Robotics" };
  }

  if (level === 3) {
    return { kicker: "Level 3", label: "Office Corridor" };
  }

  return { kicker: `Level ${level}`, label: "Reactor Sector" };
};

export default function GameScene({ state, viewMode }: GameSceneProps) {
  const roomLabel = getRoomLabel(state.level);
  const sceneClasses = [
    "scene-shell",
    viewMode === "robot" ? "robot-view" : "",
    state.executionStatus === "success" ? "mission-success" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={sceneClasses}>
      <Canvas shadows dpr={[1, 1.75]} gl={{ antialias: true }}>
        <SceneBackground
          earlyLevel={state.level < REACTOR_ROOF_START_LEVEL}
          viewMode={viewMode}
        />
        <MazeScene state={state} viewMode={viewMode} />
        {viewMode === "robot" ? <RobotCRTPostProcessing /> : null}
      </Canvas>
      {state.executionStatus === "success" ? (
        <div className="extraction-victory-signal" role="status" aria-live="polite">
          <span>Extraction lock</span>
          <strong>Mission complete</strong>
        </div>
      ) : null}
      {viewMode === "robot" ? (
        <div className="robot-feed-overlay" aria-label="Robot camera feed">
          <span className="live-dot" />
          <strong>Robot cam</strong>
          <span>{state.robot.name}</span>
        </div>
      ) : null}
      {viewMode === "robot" ? (
        <div className="robot-room-label" aria-label="Current room">
          <span>{roomLabel.kicker}</span>
          <strong>{roomLabel.label}</strong>
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
