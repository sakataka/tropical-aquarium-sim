import { getBodyPlan } from "./bodyPlans";
import { findHabit } from "./habits";
import { sampleSurface } from "./surfaceMotion";
import { chooseTerrainGoal, insideTerrain, resolveTerrainGoal } from "./terrainMotion";
import type { AquariumScene, FishInstance, FishSpeciesDefinition, SurfaceFrame, TankDefinition, Vec2 } from "./types";
import { clamp, normalize } from "./math";
import { getWaterColumn, waterCeilingCm, waterY } from "./waterColumn";

export type StartleInput = {
  fish: FishInstance[];
  species: Record<string, FishSpeciesDefinition>;
  tank: TankDefinition;
  scene?: AquariumScene;
  frame: SurfaceFrame;
  /** ガラスを叩いた位置 (cm)。叩くのは前面ガラスなので奥行きは 0。 */
  point: Vec2;
  /** 叩く強さ。続けて叩くと慣れて弱くなる（0〜1）。 */
  strength: number;
  random?: () => number;
};

/**
 * ガラスを叩いたときの驚き。振動は近い魚ほど強く伝わり、魚のつくりと習性で逃げ方が変わる。
 * - 住みかを持つ魚・物陰に隠れる魚: 近くの住みか・物陰へ飛び込み、しばらく出てこない。
 * - エビ: 尾を打って後ろ向きに跳ね退き、しばらく固まる。カニ: 向きを変えずに横へ走って離れ、しばらく固まる。
 * - タコ: 底に沿って、胴を先にして噴射で飛び退き、しばらく固まる。
 * - イカ: 向きを変えずに噴射で飛び退く（後ろへ逃げるときは胴が先になる）。
 * - 両生類: 叩いた所と逆へ向き直り、頭を先にして底を這って離れる。息継ぎに泳いでいる間は反応しない。
 * - カブトガニ: その場で立ち止まり、甲を伏せてしばらく動かない。砂に潜っている間は反応しない。
 * - チンアナゴ: 尾から巣穴へ素早く引っ込み、しばらく顔だけ出して様子をうかがってから、ゆっくり体を出す。
 * - そのほかの魚: 叩いた所から離れる向きへ瞬発で泳ぎ去る（C字の急旋回）。
 * - クラゲ: 反応しない。
 */
export function startleFish(input: StartleInput): FishInstance[] {
  const { tank, point } = input;
  const random = input.random ?? Math.random;
  const reach = Math.min(45, Math.max(18, tank.widthCm * 0.4));
  return input.fish.map((fish) => {
    const species = input.species[fish.speciesId];
    if (!species) return fish;
    const style = getBodyPlan(species).startle;
    if (style === "none" || fish.breathTrip) return fish;
    const dx = fish.position.x - point.x;
    const dy = fish.position.y - point.y;
    const distance = Math.hypot(dx, dy, fish.depth * tank.depthCm * 0.6);
    if (distance >= reach) return fish;
    // 近いほど、反応の速い個体ほど驚きやすい。
    const chance = input.strength * (1 - distance / reach) ** 0.6 * fish.personality.responsiveness;
    if (random() >= Math.min(1, chance * 1.4)) return fish;
    if (style === "hunker") return hunker(fish, random);
    if (style === "retract") return retract(fish, random);
    const away = normalize({ x: dx, y: dy }, { x: fish.facing, y: 0 });
    if (style !== "dart" && fish.surfaceMotion && input.scene) {
      return fleeAlongSurface(fish, tank, input.scene, input.frame, point, random, style);
    }
    return retreatToShelter(fish, species, input, random) ?? dart(fish, species, tank, away, random, input);
  });
}

// 立ち止まって甲を伏せる。伏せている間（alarmSec）は描き方が甲を低く構える。
function hunker(fish: FishInstance, random: () => number): FishInstance {
  const motion = fish.surfaceMotion;
  if (!motion || motion.burrowed) return fish;
  const holdSec = 3 + random() * 4;
  return {
    ...fish, alarmSec: holdSec, velocity: { x: 0, y: 0 },
    surfaceMotion: { ...motion, flee: undefined, grazing: false, pauseSec: Math.max(motion.pauseSec, holdSec + 0.5 + random()) },
  };
}

// 巣穴へ引っ込む。alarmSec の間は巣穴にこもり、hideSec が尽きるまでは顔だけ出す。
function retract(fish: FishInstance, random: () => number): FishInstance {
  const home = fish.burrowHome;
  if (!home) return fish;
  return { ...fish, alarmSec: 2 + random() * 2, burrowHome: { ...home, hideSec: Math.max(home.hideSec, 6 + random() * 6) } };
}

function retreatToShelter(fish: FishInstance, species: FishSpeciesDefinition, input: StartleInput,
  random: () => number): FishInstance | undefined {
  const homeKind = findHabit(species, "homeShelter")?.kind;
  if (!input.scene || (!homeKind && !findHabit(species, "hideByDay"))) return undefined;
  const context = { scene: input.scene, tank: input.tank, frame: input.frame, species };
  const goal = chooseTerrainGoal("hide", fish, context, random, homeKind);
  const point = goal && resolveTerrainGoal(goal, context);
  if (!goal || !point) return undefined;
  return {
    ...fish, terrainGoal: goal, target: point.position, targetKind: "home", homeDepth: fish.homeDepth ?? fish.depth,
    behaviorMode: "kick", behaviorTimeRemainingSec: 0.6, legTimeSec: 0, habitTimeSec: undefined, followId: undefined,
    terrainRoute: undefined, alarmSec: 4 + random() * 4,
  };
}

function dart(fish: FishInstance, species: FishSpeciesDefinition, tank: TankDefinition, away: Vec2,
  random: () => number, input: StartleInput): FishInstance {
  const zone = species.preferredZone;
  // 水槽に対して大きな生き物でも、水槽の半分ほどより遠くへは逃げない。
  const run = Math.min(species.realBodyLengthCm * (4 + random() * 4), tank.widthCm * 0.45);
  // 少し上下にもぶれて逃げる。生活層の外へは大きく出ない。
  const spread = (random() - 0.5) * 0.6;
  const direction = normalize({ x: away.x - away.y * spread, y: away.y + away.x * spread }, { x: fish.facing, y: 0 });
  const margin = tank.safeMarginCm * 1.5;
  const water = getWaterColumn(tank, input.scene, input.frame);
  let target = {
    x: clamp(fish.position.x + direction.x * run, margin, tank.widthCm - margin),
    y: clamp(fish.position.y + direction.y * run,
      Math.max(waterCeilingCm(water, tank, fish.depth) + tank.safeMarginCm * 0.5,
        waterY(water, Math.max(0, zone.minY - 0.1), fish.depth)),
      Math.min(tank.heightCm - margin, waterY(water, Math.min(1, zone.maxY + 0.1), fish.depth))),
  };
  // 壁際で逃げ場がないときは、壁に沿って横へ逃げる。
  if (Math.hypot(target.x - fish.position.x, target.y - fish.position.y) < Math.min(species.realBodyLengthCm * 2, run * 0.5)) {
    target = { ...target, x: clamp(fish.position.x - Math.sign(away.x || fish.facing) * run, margin, tank.widthCm - margin) };
  }
  if (input.scene && insideTerrain(target, fish.depth, { ...input, species, scene: input.scene })) {
    target = { x: fish.position.x + (target.x - fish.position.x) * 0.4, y: fish.position.y + (target.y - fish.position.y) * 0.4 };
  }
  return {
    ...fish, target, targetKind: "flee", behaviorMode: "kick", behaviorTimeRemainingSec: 0.5,
    habitTimeSec: 1.2 + random() * 1.5, legTimeSec: 0, terrainGoal: undefined, terrainRoute: undefined,
    followId: undefined, contact: undefined, alarmSec: 3 + random() * 3,
  };
}

function fleeAlongSurface(fish: FishInstance, tank: TankDefinition, scene: AquariumScene,
  frame: SurfaceFrame, point: Vec2, random: () => number, style: "tailFlip" | "scuttle" | "jet" | "crawl"): FishInstance {
  const motion = fish.surfaceMotion!;
  const surface = scene.terrain.surfaces.find((item) => item.id === motion.surfaceId);
  if (!surface) return fish;
  // 経路のどちら向きへ進めば叩いた所から離れるかで、逃げる向きを決める。体の向きは変えない（エビは後ろへ跳び、カニは横へ走る）。
  const ahead = sampleSurface(surface, Math.min(1, motion.progress + 0.02), tank, frame).position;
  const behind = sampleSurface(surface, Math.max(0, motion.progress - 0.02), tank, frame).position;
  const direction: -1 | 1 = Math.hypot(ahead.x - point.x, ahead.y - point.y) >=
    Math.hypot(behind.x - point.x, behind.y - point.y) ? 1 : -1;
  // タコは胴（画像の右）を先にして飛び退くので、逃げる向きと逆を向く。両生類は逃げる向きへ向き直る。
  const awayX = (direction === 1 ? ahead.x - behind.x : behind.x - ahead.x);
  const turns = (style === "jet" || style === "crawl") && Math.abs(awayX) > 1e-9;
  const facing: -1 | 1 = !turns ? fish.facing : (awayX > 0) === (style === "crawl") ? 1 : -1;
  return {
    ...fish, facing,
    surfaceMotion: { ...motion, pauseSec: 0, grazing: false,
      // 噴射は尾を打つ1回の跳ねより長く、這って逃げるのはさらに長く続く。
      flee: { direction, remainingSec: style === "crawl" ? 0.9 + random() * 0.5 : style === "jet" ? 0.5 + random() * 0.3
        : 0.22 + random() * 0.12, facing } },
  };
}


