import { createBlock } from "./blocks";
import { Direction, Maze, Position, ProgramBlock } from "./types";

type DistanceMap = Map<string, number>;

type ReachableCell = {
  position: Position;
  distance: number;
  sort: number;
};

type MazeProfile = {
  side: number;
  loopChance: number;
  clearingCount: number;
  clearingMinSize: number;
  clearingMaxSize: number;
  randomOpenChance: number;
  aisleCount: number;
};

const directionOrder: Direction[] = ["north", "east", "south", "west"];

const directionVectors: Record<Direction, Position> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 }
};

export const positionKey = (position: Position): string =>
  `${position.x},${position.y}`;

export const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

export const getNextPosition = (
  position: Position,
  direction: Direction
): Position => ({
  x: position.x + directionVectors[direction].x,
  y: position.y + directionVectors[direction].y
});

export const turnLeft = (direction: Direction): Direction =>
  directionOrder[(directionOrder.indexOf(direction) + 3) % directionOrder.length];

export const turnRight = (direction: Direction): Direction =>
  directionOrder[(directionOrder.indexOf(direction) + 1) % directionOrder.length];

export const directionBetween = (from: Position, to: Position): Direction => {
  if (to.x > from.x) return "east";
  if (to.x < from.x) return "west";
  if (to.y > from.y) return "south";
  return "north";
};

export const isInside = (maze: Maze, position: Position): boolean =>
  position.x >= 0 &&
  position.y >= 0 &&
  position.x < maze.width &&
  position.y < maze.height;

export const isWall = (maze: Maze, position: Position): boolean => {
  if (!isInside(maze, position)) {
    return true;
  }
  return maze.cells[position.y][position.x].wall;
};

const hashSeed = (seed: string): number => {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = <T,>(items: T[], random: () => number): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const normalizeSeed = (seed: string | undefined, level: number): string =>
  seed?.trim() || `kuroshio-${level}-${Math.floor(Math.random() * 1_000_000)}`;

export const bfsDistances = (maze: Maze, start: Position): DistanceMap => {
  const distances: DistanceMap = new Map([[positionKey(start), 0]]);
  const queue: Position[] = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const distance = distances.get(positionKey(current)) ?? 0;

    directionOrder.forEach((direction) => {
      const next = getNextPosition(current, direction);
      const key = positionKey(next);
      if (!isWall(maze, next) && !distances.has(key)) {
        distances.set(key, distance + 1);
        queue.push(next);
      }
    });
  }

  return distances;
};

export const findPath = (
  maze: Maze,
  start: Position,
  target: Position
): Position[] => {
  const queue: Position[] = [start];
  const parents = new Map<string, string | null>([[positionKey(start), null]]);
  const positions = new Map<string, Position>([[positionKey(start), start]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (samePosition(current, target)) {
      break;
    }

    directionOrder.forEach((direction) => {
      const next = getNextPosition(current, direction);
      const key = positionKey(next);
      if (!isWall(maze, next) && !parents.has(key)) {
        parents.set(key, positionKey(current));
        positions.set(key, next);
        queue.push(next);
      }
    });
  }

  const targetKey = positionKey(target);
  if (!parents.has(targetKey)) {
    return [];
  }

  const path: Position[] = [];
  let cursor: string | null = targetKey;
  while (cursor) {
    path.push(positions.get(cursor)!);
    cursor = parents.get(cursor) ?? null;
  }

  return path.reverse();
};

const createMazeSkeleton = (width: number, height: number) =>
  Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_cell, x) => ({ x, y, wall: true }))
  );

const oddSide = (side: number): number => (side % 2 === 0 ? side + 1 : side);

const getMazeProfile = (difficulty: number): MazeProfile => {
  if (difficulty <= 2) {
    return {
      side: 9,
      loopChance: 0.11,
      clearingCount: 0,
      clearingMinSize: 0,
      clearingMaxSize: 0,
      randomOpenChance: 0,
      aisleCount: 0
    };
  }

  const side = oddSide(Math.min(31, 15 + (difficulty - 3) * 2));
  const openScale = Math.min(1, (difficulty - 3) / 7);

  return {
    side,
    loopChance: 0.24 + openScale * 0.22,
    clearingCount: Math.min(10, 4 + Math.floor((difficulty - 3) / 2)),
    clearingMinSize: 3,
    clearingMaxSize: Math.min(9, 5 + Math.floor(difficulty / 3)),
    randomOpenChance: 0.22 + openScale * 0.18,
    aisleCount: Math.min(5, 1 + Math.floor((difficulty - 3) / 2))
  };
};

const carveMaze = (
  cells: ReturnType<typeof createMazeSkeleton>,
  random: () => number,
  loopChance: number
) => {
  const width = cells[0].length;
  const height = cells.length;
  const stack: Position[] = [{ x: 1, y: 1 }];
  cells[1][1].wall = false;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = shuffle(directionOrder, random)
      .map((direction) => ({
        direction,
        next: {
          x: current.x + directionVectors[direction].x * 2,
          y: current.y + directionVectors[direction].y * 2
        }
      }))
      .filter(
        ({ next }) =>
          next.x > 0 &&
          next.y > 0 &&
          next.x < width - 1 &&
          next.y < height - 1 &&
          cells[next.y][next.x].wall
      );

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const chosen = candidates[0];
    const between = {
      x: current.x + directionVectors[chosen.direction].x,
      y: current.y + directionVectors[chosen.direction].y
    };
    cells[between.y][between.x].wall = false;
    cells[chosen.next.y][chosen.next.x].wall = false;
    stack.push(chosen.next);
  }

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      if (random() < loopChance) {
        const neighbors = shuffle(directionOrder, random);
        const direction = neighbors[0];
        const wall = {
          x: x + directionVectors[direction].x,
          y: y + directionVectors[direction].y
        };
        if (wall.x > 0 && wall.y > 0 && wall.x < width - 1 && wall.y < height - 1) {
          cells[wall.y][wall.x].wall = false;
        }
      }
    }
  }
};

const carveRectangle = (
  cells: ReturnType<typeof createMazeSkeleton>,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  const width = cells[0].length;
  const height = cells.length;
  const minX = Math.max(1, Math.min(x1, x2));
  const maxX = Math.min(width - 2, Math.max(x1, x2));
  const minY = Math.max(1, Math.min(y1, y2));
  const maxY = Math.min(height - 2, Math.max(y1, y2));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      cells[y][x].wall = false;
    }
  }
};

const countOpenNeighbors = (
  cells: ReturnType<typeof createMazeSkeleton>,
  position: Position
): number =>
  directionOrder.filter((direction) => {
    const next = getNextPosition(position, direction);
    return (
      next.y > 0 &&
      next.y < cells.length - 1 &&
      next.x > 0 &&
      next.x < cells[0].length - 1 &&
      !cells[next.y][next.x].wall
    );
  }).length;

const carveOpenResponseZones = (
  cells: ReturnType<typeof createMazeSkeleton>,
  random: () => number,
  profile: MazeProfile
) => {
  if (profile.clearingCount === 0) {
    return;
  }

  const width = cells[0].length;
  const height = cells.length;

  carveRectangle(cells, 1, 1, 3, 3);

  for (let index = 0; index < profile.clearingCount; index += 1) {
    const clearingWidth =
      profile.clearingMinSize +
      Math.floor(random() * (profile.clearingMaxSize - profile.clearingMinSize + 1));
    const clearingHeight =
      profile.clearingMinSize +
      Math.floor(random() * (profile.clearingMaxSize - profile.clearingMinSize + 1));
    const centerX = 2 + Math.floor(random() * Math.max(1, width - 4));
    const centerY = 2 + Math.floor(random() * Math.max(1, height - 4));
    const halfWidth = Math.floor(clearingWidth / 2);
    const halfHeight = Math.floor(clearingHeight / 2);

    carveRectangle(
      cells,
      centerX - halfWidth,
      centerY - halfHeight,
      centerX + halfWidth,
      centerY + halfHeight
    );
  }

  for (let index = 0; index < profile.aisleCount; index += 1) {
    if (random() < 0.5) {
      const y = 1 + Math.floor(random() * (height - 2));
      const aisleHeight = random() < 0.28 ? 1 : 0;
      carveRectangle(cells, 1, y - aisleHeight, width - 2, y + aisleHeight);
    } else {
      const x = 1 + Math.floor(random() * (width - 2));
      const aisleWidth = random() < 0.28 ? 1 : 0;
      carveRectangle(cells, x - aisleWidth, 1, x + aisleWidth, height - 2);
    }
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (
        cells[y][x].wall &&
        countOpenNeighbors(cells, { x, y }) > 0 &&
        random() < profile.randomOpenChance
      ) {
        cells[y][x].wall = false;
      }
    }
  }
};

const approximateParActions = (maze: Maze): number => {
  const points = [maze.start, ...maze.hotspots.map((hotspot) => hotspot.position), maze.extraction];
  const distances = points.map((point) => bfsDistances(maze, point));
  const hotspotCount = maze.hotspots.length;
  const allVisitedMask = (1 << hotspotCount) - 1;
  const memo = new Map<string, number>();

  const distanceBetween = (fromIndex: number, toIndex: number) => {
    const key = positionKey(points[toIndex]);
    return distances[fromIndex].get(key) ?? Number.POSITIVE_INFINITY;
  };

  const visit = (currentIndex: number, mask: number): number => {
    const memoKey = `${currentIndex}|${mask}`;
    if (memo.has(memoKey)) {
      return memo.get(memoKey)!;
    }

    if (mask === allVisitedMask) {
      return distanceBetween(currentIndex, hotspotCount + 1);
    }

    let best = Number.POSITIVE_INFINITY;
    for (let hotspotIndex = 0; hotspotIndex < hotspotCount; hotspotIndex += 1) {
      const bit = 1 << hotspotIndex;
      if ((mask & bit) === 0) {
        const targetIndex = hotspotIndex + 1;
        best = Math.min(
          best,
          distanceBetween(currentIndex, targetIndex) +
            visit(targetIndex, mask | bit)
        );
      }
    }
    memo.set(memoKey, best);
    return best;
  };

  const movementDistance = visit(0, 0);
  const turnEstimate = Math.ceil(movementDistance * 0.35);
  return Math.max(8, movementDistance + turnEstimate + hotspotCount);
};

const selectSpreadHotspotCells = (
  maze: Maze,
  openCells: ReachableCell[],
  extraction: Position,
  hotspotCount: number,
  random: () => number
): ReachableCell[] => {
  const exitDistances = bfsDistances(maze, extraction);
  const minExitDistance = Math.max(4, Math.floor(Math.min(maze.width, maze.height) / 3));
  const minHotspotDistance = Math.max(
    2,
    Math.floor(Math.min(maze.width, maze.height) / Math.max(3, hotspotCount + 1))
  );

  const candidates = openCells
    .filter(
      ({ position }) =>
        !samePosition(position, maze.start) && !samePosition(position, extraction)
    )
    .map((cell) => ({
      ...cell,
      key: positionKey(cell.position),
      exitDistance: exitDistances.get(positionKey(cell.position)) ?? 0,
      jitter: random()
    }));

  let pool =
    candidates.filter(
      (cell) => cell.distance > 2 && cell.exitDistance >= minExitDistance
    ).length >= hotspotCount
      ? candidates.filter(
          (cell) => cell.distance > 2 && cell.exitDistance >= minExitDistance
        )
      : candidates;

  const selected: Array<(typeof candidates)[number]> = [];
  const selectedDistanceMaps: DistanceMap[] = [];

  while (selected.length < hotspotCount && pool.length > 0) {
    const ranked = pool
      .map((cell) => {
        const distanceFromSelected =
          selectedDistanceMaps.length === 0
            ? Math.max(cell.distance, cell.exitDistance)
            : Math.min(
                ...selectedDistanceMaps.map(
                  (distances) => distances.get(cell.key) ?? 0
                )
              );
        const exitCrowdingPenalty = Math.max(0, minExitDistance - cell.exitDistance) * 3;
        const score =
          cell.distance * 0.35 +
          cell.exitDistance * 0.85 +
          distanceFromSelected * 1.8 +
          cell.jitter * maze.width -
          exitCrowdingPenalty;

        return { cell, score };
      })
      .sort((a, b) => b.score - a.score);

    const shortlistSize = Math.min(
      ranked.length,
      Math.max(2, Math.ceil(ranked.length * 0.18))
    );
    const chosen = ranked[Math.floor(random() * shortlistSize)].cell;
    selected.push(chosen);
    selectedDistanceMaps.push(bfsDistances(maze, chosen.position));

    const remainingNeeded = hotspotCount - selected.length;
    const withoutChosen = pool.filter((cell) => cell.key !== chosen.key);
    const spreadPool = withoutChosen.filter((cell) =>
      selectedDistanceMaps.every(
        (distances) => (distances.get(cell.key) ?? 0) >= minHotspotDistance
      )
    );

    pool = spreadPool.length >= remainingNeeded ? spreadPool : withoutChosen;
  }

  return selected.slice(0, hotspotCount);
};

export const generateMaze = (level: number, requestedSeed?: string): Maze => {
  const difficulty = Math.max(1, level);
  const seed = normalizeSeed(requestedSeed, difficulty);
  const random = mulberry32(hashSeed(seed));
  const profile = getMazeProfile(difficulty);
  const width = profile.side;
  const height = width;
  const cells = createMazeSkeleton(width, height);
  carveMaze(cells, random, profile.loopChance);
  carveOpenResponseZones(cells, random, profile);

  const start = { x: 1, y: 1 };
  const provisionalMaze: Maze = {
    width,
    height,
    cells,
    start,
    extraction: start,
    hotspots: [],
    parActions: 0,
    seed,
    baseRadiation: 0,
    initialFoam: 0,
    meltdownTicks: 0,
    difficulty
  };

  const distances = bfsDistances(provisionalMaze, start);
  const openCells = [...distances.entries()]
    .map(([key, distance]) => {
      const [x, y] = key.split(",").map(Number);
      return { position: { x, y }, distance, sort: distance + random() * 3 };
    })
    .filter(({ distance }) => distance > 2);

  const hotspotCount = Math.min(5, Math.max(1, 1 + Math.floor(difficulty / 2)));
  const farCells = [...openCells].sort((a, b) => b.sort - a.sort);
  const extraction =
    farCells.find(({ position }) => !samePosition(position, start))?.position ??
    { x: width - 2, y: height - 2 };

  const hotspotCandidates = selectSpreadHotspotCells(
    provisionalMaze,
    openCells,
    extraction,
    hotspotCount,
    random
  );

  const hotspots = hotspotCandidates.slice(0, hotspotCount).map((candidate, index) => ({
    id: `hotspot-${index + 1}`,
    position: candidate.position,
    radiationValue: 12 + difficulty * 2 + Math.floor(random() * 10),
    sealed: false
  }));

  const baseRadiation = 24 + difficulty * 4;
  const initialFoam = hotspotCount + 1;
  const maze: Maze = {
    ...provisionalMaze,
    extraction,
    hotspots,
    baseRadiation,
    initialFoam,
    parActions: 0,
    meltdownTicks: 0
  };

  const parActions = approximateParActions(maze);
  const meltdownTicks = Math.max(
    parActions + 16,
    Math.floor(parActions * 1.45) + 8 - Math.min(6, difficulty)
  );

  return {
    ...maze,
    parActions,
    meltdownTicks
  };
};

const addTurnsToward = (
  commands: ProgramBlock[],
  current: Direction,
  target: Direction
): Direction => {
  let facing = current;
  const rightSteps =
    (directionOrder.indexOf(target) - directionOrder.indexOf(facing) + 4) % 4;
  if (rightSteps === 3) {
    commands.push(createBlock("turnLeft"));
    facing = turnLeft(facing);
  } else {
    for (let index = 0; index < rightSteps; index += 1) {
      commands.push(createBlock("turnRight"));
      facing = turnRight(facing);
    }
  }
  return facing;
};

export const buildPracticeProgram = (
  maze: Maze,
  initialFacing: Direction = "east"
): ProgramBlock[] => {
  const commands: ProgramBlock[] = [];
  let current = maze.start;
  let facing = initialFacing;
  const remaining = [...maze.hotspots];

  while (remaining.length > 0) {
    remaining.sort((a, b) => {
      const aPath = findPath(maze, current, a.position);
      const bPath = findPath(maze, current, b.position);
      return aPath.length - bPath.length;
    });
    const nextHotspot = remaining.shift()!;
    const path = findPath(maze, current, nextHotspot.position);

    for (let index = 1; index < path.length; index += 1) {
      const desired = directionBetween(path[index - 1], path[index]);
      facing = addTurnsToward(commands, facing, desired);
      commands.push(createBlock("moveForward"));
    }
    commands.push(createBlock("deployFoam"));
    current = nextHotspot.position;
  }

  const extractionPath = findPath(maze, current, maze.extraction);
  for (let index = 1; index < extractionPath.length; index += 1) {
    const desired = directionBetween(extractionPath[index - 1], extractionPath[index]);
    facing = addTurnsToward(commands, facing, desired);
    commands.push(createBlock("moveForward"));
  }

  return commands;
};
