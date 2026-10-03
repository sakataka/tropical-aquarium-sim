import type { AquariumScene, FishInstance, FishSpeciesDefinition, SurfaceFrame, TankDefinition, Vec2 } from "./types";
import { sampleSurface, worldPoint } from "./surfaceMotion";

type Goal = NonNullable<FishInstance["terrainGoal"]>;
type Context = { scene: AquariumScene; tank: TankDefinition; frame: SurfaceFrame; species: FishSpeciesDefinition };

export function resolveTerrainGoal(goal: Goal, context: Context) {
  const { scene, tank, frame, species } = context;
  if (goal.sceneId !== scene.id) return undefined;
  const shelter = scene.terrain?.shelters?.find((s) => s.id === goal.shelterId);
  if (shelter) {
    const point = worldPoint(shelter, tank, frame);
    return { position: { x: point.x, y: point.y }, depth: point.depth };
  }
  const surface = scene.terrain?.surfaces.find((s) => s.id === goal.surfaceId);
  if (!surface) return undefined;
  const sampled = sampleSurface(surface, goal.progress ?? .5, tank, frame);
  // 口・腹の接地点が表面に寄るよう、中心は少しだけ上へ置く。
  return { ...sampled, position: { x: sampled.position.x,
    y: sampled.position.y - species.realBodyLengthCm * .16 } };
}

export function chooseTerrainGoal(kind: "hide" | "rest" | "forage", fish: FishInstance,
  context: Context, random: () => number): Goal | undefined {
  const { scene, tank } = context;
  const candidates: Goal[] = kind === "hide"
    ? (scene.terrain?.shelters ?? []).map((s) => ({ sceneId: scene.id, shelterId: s.id }))
    : (scene.terrain?.surfaces ?? []).filter((s) => kind === "rest" ? s.material === "sand" : s.material !== "sand")
      .flatMap((s) => [.2, .5, .8].map((progress) =>
        ({ sceneId: scene.id, surfaceId: s.id, progress })));
  const visible = candidates.map((goal) => ({ goal, point: resolveTerrainGoal(goal, context)! }))
    .filter(({ point }) => point.position.x >= tank.safeMarginCm &&
      point.position.x <= tank.widthCm - tank.safeMarginCm &&
      point.position.y >= tank.safeMarginCm && point.position.y <= tank.heightCm - tank.safeMarginCm &&
      !insideTerrain(point.position, point.depth, context))
    .sort((a, b) => distance(a.point.position, fish.position) - distance(b.point.position, fish.position));
  // 近い場所を中心に選び、全員が同じ葉へ集中しない。
  return visible[Math.floor(random() * Math.min(3, visible.length))]?.goal;
}

function ellipses(depth: number, context: Context) {
  const { scene, tank, frame, species } = context;
  return (scene.terrain?.obstacles ?? []).flatMap((obstacle) => {
    const relativeDepth = (depth - obstacle.center.depth) / obstacle.depthRadius;
    if (Math.abs(relativeDepth) >= 1) return [];
    const section = Math.sqrt(1 - relativeDepth * relativeDepth);
    const center = worldPoint(obstacle.center, tank, frame);
    const clearance = species.realBodyLengthCm * .2;
    return [{ center, rx: obstacle.radius.x * frame.width * tank.widthCm * section + clearance,
      ry: obstacle.radius.y * frame.height * tank.heightCm * section + clearance }];
  });
}

export function insideTerrain(position: Vec2, depth: number, context: Context) {
  return ellipses(depth, context).some(({ center, rx, ry }) =>
    Math.hypot((position.x - center.x) / rx, (position.y - center.y) / ry) < 1 - 1e-9);
}

export function terrainAvoidance(fish: FishInstance, context: Context): Vec2 {
  let x = 0, y = 0;
  for (const { center, rx, ry } of ellipses(fish.depth, context)) {
    const lookAhead = Math.min(1.5, context.species.realBodyLengthCm / Math.max(.1, Math.hypot(fish.velocity.x, fish.velocity.y)));
    const ahead = { x: fish.position.x + fish.velocity.x * lookAhead,
      y: fish.position.y + fish.velocity.y * lookAhead };
    const nx = (ahead.x - center.x) / rx, ny = (ahead.y - center.y) / ry;
    const d = Math.hypot(nx, ny);
    if (d >= 1.65) continue;
    // 楕円の法線で押し返す。止まった魚にも上側へ抜ける向きがある。
    const dx = nx / rx, dy = ny / ry;
    const norm = Math.hypot(dx, dy);
    const force = Math.min(4, (1.65 - d) * 4);
    x += norm > .0001 ? dx / norm * force : 0;
    y += norm > .0001 ? dy / norm * force : -force;
  }
  return { x, y };
}

/** 慣性で回避領域を突き抜ける場合は、連続した移動区間の入口で止める。 */
export function constrainTerrainStep(from: Vec2, to: Vec2, depth: number, context: Context): Vec2 {
  let result = { ...to };
  for (const { center, rx, ry } of ellipses(depth, context)) {
    const ax = (from.x - center.x) / rx, ay = (from.y - center.y) / ry;
    const bx = (result.x - center.x) / rx, by = (result.y - center.y) / ry;
    if (Math.hypot(ax, ay) < 1) {
      // 初期配置や水景切替で内部から始まった場合だけ、最寄りの外へ出す。
      const d = Math.hypot(bx, by);
      const projected = d > .0001 ? { x: center.x + bx / d * rx * 1.001,
        y: center.y + by / d * ry * 1.001 } : { x: center.x, y: center.y - ry * 1.001 };
      const tank = context.tank;
      const visible = (point: Vec2) => point.x >= tank.safeMarginCm &&
        point.x <= tank.widthCm - tank.safeMarginCm && point.y >= tank.safeMarginCm &&
        point.y <= tank.heightCm - tank.safeMarginCm && !insideTerrain(point, depth, context);
      // cover で岩の一部がガラス外へ切れる場合、外側へ押し出して壁に挟まない。
      const alternatives = [projected, ...Array.from({ length: 32 }, (_, i) => {
        const angle = i * Math.PI / 16;
        return { x: center.x + Math.cos(angle) * rx * 1.001,
          y: center.y + Math.sin(angle) * ry * 1.001 };
      })].filter(visible).sort((a, b) => distance(a, to) - distance(b, to));
      result = alternatives[0] ?? projected;
      continue;
    }
    const dx = bx - ax, dy = by - ay;
    const a = dx * dx + dy * dy;
    const b = 2 * (ax * dx + ay * dy), c = ax * ax + ay * ay - 1;
    const discriminant = b * b - 4 * a * c;
    if (a < 1e-20 || discriminant < 0) continue;
    const hit = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (hit < 0 || hit > 1) continue;
    const t = Math.max(0, hit - .001);
    result = { x: from.x + (result.x - from.x) * t, y: from.y + (result.y - from.y) * t };
  }
  return result;
}

function distance(a: Vec2, b: Vec2) { return Math.hypot(a.x - b.x, a.y - b.y); }
