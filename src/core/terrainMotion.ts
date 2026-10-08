import type { AquariumScene, FishInstance, FishSpeciesDefinition, ShelterKind, SurfaceFrame, TankDefinition, Vec2 } from "./types";
import { sampleSurface, worldPoint } from "./surfaceMotion";
import { distance } from "./math";

type Goal = NonNullable<FishInstance["terrainGoal"]>;
type Context = { scene: AquariumScene; tank: TankDefinition; frame: SurfaceFrame; species: FishSpeciesDefinition };

export function resolveTerrainGoal(goal: Goal, context: Context): { position: Vec2; depth: number; angle?: number } | undefined {
  const { scene, tank, frame } = context;
  if (goal.sceneId !== scene.id) return undefined;
  const shelter = scene.terrain?.shelters?.find((s) => s.id === goal.shelterId);
  if (shelter) {
    const point = worldPoint(shelter, tank, frame);
    return { position: { x: point.x + (goal.offsetCm ?? 0), y: point.y }, depth: point.depth };
  }
  const surface = scene.terrain?.surfaces.find((s) => s.id === goal.surfaceId);
  if (!surface) return undefined;
  const sampled = sampleSurface(surface, goal.progress ?? .5, tank, frame);
  // 接地点そのものを目標にする。描画側は近づくにつれ口・腹へ支点を移す。
  return sampled;
}

/** 住みかの種類が合う shelter のうち、個体ごとに決まった1か所。魚の id から選ぶので、泳ぐ間は変わらない。 */
export function findHomeShelter(fish: FishInstance, scene: AquariumScene, kind: ShelterKind) {
  const homes = (scene.terrain?.shelters ?? []).filter((shelter) => shelter.kind === kind);
  if (homes.length === 0) return undefined;
  let hash = 0;
  for (let i = 0; i < fish.id.length; i++) hash = (Math.imul(hash, 31) + fish.id.charCodeAt(i)) >>> 0;
  return homes[hash % homes.length];
}

export function chooseTerrainGoal(kind: "hide" | "rest" | "forage", fish: FishInstance,
  context: Context, random: () => number, preferredShelter?: ShelterKind): Goal | undefined {
  const { scene, tank } = context;
  const shelters = scene.terrain?.shelters ?? [];
  // 住みかを持つ魚は、同じ種類の隠れ場所があればそこへ入る。
  const home = preferredShelter ? findHomeShelter(fish, scene, preferredShelter) : undefined;
  // 同じ隠れ場所へ入る仲間と重ならないよう、体長の範囲で左右へずらす。海草の茎は、ずらすと茎から離れるのでずらさない。
  const offsetCm = kind === "hide" ? (random() - .5) * context.species.realBodyLengthCm * .9 : 0;
  // 海草の茎は水中にあり、身を隠す物陰ではないので、住みかにする種だけが使う。
  const candidates: Goal[] = kind === "hide"
    ? (home ? [home] : shelters.filter((s) => s.kind !== "holdfast")).map((s) =>
      ({ sceneId: scene.id, shelterId: s.id, offsetCm: s.kind === "holdfast" ? 0 : offsetCm }))
    : (scene.terrain?.surfaces ?? []).filter((s) => kind === "rest" ? s.material === "sand" : s.material !== "sand")
      .flatMap((s) => [.2, .5, .8].map((progress) =>
        ({ sceneId: scene.id, surfaceId: s.id, progress })));
  const visible = candidates.map((goal) => ({ goal, point: resolveTerrainGoal(goal, context)! }))
    .filter(({ point }) => point.position.x >= tank.safeMarginCm &&
      point.position.x <= tank.widthCm - tank.safeMarginCm &&
      point.position.y >= tank.safeMarginCm && point.position.y <= tank.heightCm - tank.safeMarginCm &&
      !insideTerrain(point.position, point.depth, context))
    .sort((a, b) => Math.hypot(distance(a.point.position, fish.position), (a.point.depth - fish.depth) * tank.depthCm)
      - Math.hypot(distance(b.point.position, fish.position), (b.point.depth - fish.depth) * tank.depthCm));
  // 近い場所を中心に選び、全員が同じ葉へ集中しない。
  const selected = visible[Math.floor(random() * Math.min(3, visible.length))];
  return selected ? { ...selected.goal, facing: selected.point.position.x >= fish.position.x ? 1 : -1 } : undefined;
}

function ellipses(depth: number, context: Context) {
  const { scene, tank, frame, species } = context;
  return (scene.terrain?.obstacles ?? []).flatMap((obstacle) => {
    const relativeDepth = (depth - obstacle.center.depth) / obstacle.depthRadius;
    if (Math.abs(relativeDepth) >= 1) return [];
    const section = Math.sqrt(1 - relativeDepth * relativeDepth);
    const center = worldPoint(obstacle.center, tank, frame);
    const clearance = species.realBodyLengthCm * .2;
    return [{ id: obstacle.id, center, rx: obstacle.radius.x * frame.width * tank.widthCm * section + clearance,
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
    const lookAhead = Math.min(.6, context.species.realBodyLengthCm / Math.max(.1, Math.hypot(fish.velocity.x, fish.velocity.y)));
    const ahead = { x: fish.position.x + fish.velocity.x * lookAhead,
      y: fish.position.y + fish.velocity.y * lookAhead };
    const nx = (ahead.x - center.x) / rx, ny = (ahead.y - center.y) / ry;
    const d = Math.hypot(nx, ny);
    if (d >= 1.25) continue;
    // 楕円の法線で押し返す。止まった魚にも上側へ抜ける向きがある。
    const dx = nx / rx, dy = ny / ry;
    const norm = Math.hypot(dx, dy);
    const force = Math.min(2.5, (1.25 - d) * 5);
    x += norm > .0001 ? dx / norm * force : 0;
    y += norm > .0001 ? dy / norm * force : -force;
  }
  return { x, y };
}

/** 衝突しそうな物体の周囲へ一貫した側から回り込む。毎フレーム左右を選び直さない。 */
export function routeTerrainTarget(fish: FishInstance, target: Vec2, context: Context) {
  const solids = ellipses(fish.depth, context);
  const lineDistance = (point: Vec2, solid: typeof solids[number]) => {
    const ax = (fish.position.x - solid.center.x) / solid.rx;
    const ay = (fish.position.y - solid.center.y) / solid.ry;
    const dx = (point.x - fish.position.x) / solid.rx;
    const dy = (point.y - fish.position.y) / solid.ry;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / Math.max(1e-12, dx * dx + dy * dy)));
    return Math.hypot(ax + t * dx, ay + t * dy);
  };
  const intersects = (solid: typeof solids[number]) => lineDistance(target, solid) < 1.18;
  const previous = fish.terrainRoute?.sceneId === context.scene.id ? fish.terrainRoute : undefined;
  const solid = solids.find((s) => s.id === previous?.obstacleId && intersects(s))
    ?? solids.filter(intersects).sort((a, b) => distance(a.center, fish.position) - distance(b.center, fish.position))[0];
  if (!solid) return { target, route: undefined };
  const angle = Math.atan2((fish.position.y - solid.center.y) / solid.ry,
    (fish.position.x - solid.center.x) / solid.rx);
  const waypoint = (side: -1 | 1, advance: number) => ({
    x: solid.center.x + Math.cos(angle + side * advance) * solid.rx * 1.3,
    y: solid.center.y + Math.sin(angle + side * advance) * solid.ry * 1.3,
  });
  const cost = (side: -1 | 1) => {
    const p = waypoint(side, Math.PI / 2), margin = context.tank.safeMarginCm;
    const outside = Math.max(0, margin - p.x, p.x - context.tank.widthCm + margin,
      margin - p.y, p.y - context.tank.heightCm + margin);
    return distance(p, target) + outside * 20;
  };
  let side = previous?.obstacleId === solid.id ? previous.side : cost(1) <= cost(-1) ? 1 : -1;
  const margin = context.tank.safeMarginCm;
  const visible = (p: Vec2) => p.x >= margin && p.x <= context.tank.widthCm - margin &&
    p.y >= margin && p.y <= context.tank.heightCm - margin && !insideTerrain(p, fish.depth, context);
  // 停止からの復帰では、また岩越しの候補へ戻らない。通常の滑り移動は変えない。
  const recovering = (previous?.stuckSec ?? 0) > 0;
  const reachable = (p: Vec2) => visible(p) && (!recovering || solids.every((s) => lineDistance(p, s) >= 1 - 1e-9));
  let point = waypoint(side, .65);
  if (!reachable(point)) {
    const alternative = waypoint(side === 1 ? -1 : 1, .65);
    if (reachable(alternative)) { side = side === 1 ? -1 : 1; point = alternative; }
    else {
      // 壁に切られた岩でも、目標を壁へ丸めて岩の内側に置かない。
      const alternatives = [side, side === 1 ? -1 as const : 1 as const].flatMap((direction) =>
        [1, 1.4, 1.8, 2.2, 2.6].map((advance) => ({ point: waypoint(direction, advance), side: direction })));
      // 遠い候補は終点が岩の外でも、そこへの直線が岩を横切ることがある。
      const choice = alternatives.find((item) => reachable(item.point));
      if (choice) { point = choice.point; side = choice.side; }
      else if (recovering) {
        // 隣の岩とガラスで両側が塞がったら、まず外側へ離れて回る余地を作る。
        const outward = waypoint(side, 0);
        const retreat = { x: Math.max(margin, Math.min(context.tank.widthCm - margin, outward.x)),
          y: Math.max(margin, Math.min(context.tank.heightCm - margin, outward.y)) };
        point = reachable(retreat) ? retreat : fish.position;
      }
    }
  }
  return { target: point,
    route: { sceneId: context.scene.id, obstacleId: solid.id, side,
      stuckSec: previous?.obstacleId === solid.id && previous.side === side ? previous.stuckSec : 0 } };
}

/** 前後移動でも薄い物体を飛び越えない。深さ区間を分割し、最初の接触直前まで進める。 */
export function constrainTerrainDepth(position: Vec2, from: number, to: number, context: Context, protectSilhouette = false) {
  if (protectSilhouette) {
    for (const occluder of context.scene.terrain?.occluders ?? []) {
      if ((from - occluder.depth) * (to - occluder.depth) >= 0) continue;
      const polygon = occluder.polygon.map((p) => worldPoint({ ...p, depth: 0 }, context.tank, context.frame));
      const clearance = context.species.realBodyLengthCm * .55;
      if (pointInPolygon(position, polygon) || polygon.some((a, i) => {
        const b = polygon[(i + 1) % polygon.length]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
        return Math.hypot(position.x - a.x - t * dx, position.y - a.y - t * dy) < clearance;
      })) to = occluder.depth + Math.sign(from - occluder.depth) * 1e-7;
    }
  }
  const smallest = Math.min(1, ...(context.scene.terrain?.obstacles ?? []).map((s) => s.depthRadius));
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / (smallest * .25)));
  let previous = from;
  for (let i = 1; i <= steps; i++) {
    const depth = from + (to - from) * i / steps;
    if (insideTerrain(position, depth, context)) {
      let safe = previous, blocked = depth;
      for (let j = 0; j < 24; j++) {
        const mid = (safe + blocked) / 2;
        if (insideTerrain(position, mid, context)) blocked = mid; else safe = mid;
      }
      return safe;
    }
    previous = depth;
  }
  return to;
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 慣性で回避領域へ接触したら、入口で法線方向を止め、接線方向へ滑らせる。 */
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
    const contact = { x: from.x + (result.x - from.x) * t, y: from.y + (result.y - from.y) * t };
    const nx = (contact.x - center.x) / (rx * rx), ny = (contact.y - center.y) / (ry * ry);
    const remainingX = result.x - contact.x, remainingY = result.y - contact.y;
    const inward = Math.min(0, (remainingX * nx + remainingY * ny) / (nx * nx + ny * ny));
    const margin = context.tank.safeMarginCm;
    const slide = { x: Math.max(margin, Math.min(context.tank.widthCm - margin, contact.x + remainingX - inward * nx)),
      y: Math.max(margin, Math.min(context.tank.heightCm - margin, contact.y + remainingY - inward * ny)) };
    result = insideTerrain(slide, depth, context) ? contact : slide;
  }
  return insideTerrain(result, depth, context) && !insideTerrain(from, depth, context) ? from : result;
}

