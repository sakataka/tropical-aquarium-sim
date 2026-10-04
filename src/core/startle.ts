import { getBodyPlan } from "./bodyPlans";
import { findHabit } from "./habits";
import { sampleSurface } from "./surfaceMotion";
import { chooseTerrainGoal, insideTerrain, resolveTerrainGoal } from "./terrainMotion";
import type { AquariumScene, FishInstance, FishSpeciesDefinition, SurfaceFrame, TankDefinition, Vec2 } from "./types";
import { clamp, normalize } from "./math";

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
 * - エビ: 尾を打って後ろ向きに跳ね退き、しばらく固まる。
 * - そのほかの魚: 叩いた所から離れる向きへ瞬発で泳ぎ去る（C字の急旋回）。
 */
export function startleFish(input: StartleInput): FishInstance[] {
  const { tank, point } = input;
  const random = input.random ?? Math.random;
  const reach = Math.min(45, Math.max(18, tank.widthCm * 0.4));
  return input.fish.map((fish) => {
    const species = input.species[fish.speciesId];
    if (!species) return fish;
    const dx = fish.position.x - point.x;
    const dy = fish.position.y - point.y;
    const distance = Math.hypot(dx, dy, fish.depth * tank.depthCm * 0.6);
    if (distance >= reach) return fish;
    // 近いほど、反応の速い個体ほど驚きやすい。
    const chance = input.strength * (1 - distance / reach) ** 0.6 * fish.personality.responsiveness;
    if (random() >= Math.min(1, chance * 1.4)) return fish;
    const away = normalize({ x: dx, y: dy }, { x: fish.facing, y: 0 });
    if (getBodyPlan(species).startle === "tailFlip" && fish.surfaceMotion && input.scene) {
      return tailFlip(fish, tank, input.scene, input.frame, point, random);
    }
    return retreatToShelter(fish, species, input, random) ?? dart(fish, species, tank, away, random, input);
  });
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
  const run = species.realBodyLengthCm * (4 + random() * 4);
  // 少し上下にもぶれて逃げる。生活層の外へは大きく出ない。
  const spread = (random() - 0.5) * 0.6;
  const direction = normalize({ x: away.x - away.y * spread, y: away.y + away.x * spread }, { x: fish.facing, y: 0 });
  const margin = tank.safeMarginCm * 1.5;
  let target = {
    x: clamp(fish.position.x + direction.x * run, margin, tank.widthCm - margin),
    y: clamp(fish.position.y + direction.y * run,
      Math.max(margin, tank.heightCm * Math.max(0, zone.minY - 0.1)),
      Math.min(tank.heightCm - margin, tank.heightCm * Math.min(1, zone.maxY + 0.1))),
  };
  // 壁際で逃げ場がないときは、壁に沿って横へ逃げる。
  if (Math.hypot(target.x - fish.position.x, target.y - fish.position.y) < species.realBodyLengthCm * 2) {
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

function tailFlip(fish: FishInstance, tank: TankDefinition, scene: AquariumScene,
  frame: SurfaceFrame, point: Vec2, random: () => number): FishInstance {
  const motion = fish.surfaceMotion!;
  const surface = scene.terrain.surfaces.find((item) => item.id === motion.surfaceId);
  if (!surface) return fish;
  // 経路のどちら向きへ進めば叩いた所から離れるかで、跳ねる向きを決める。向きは変えず後ろへ跳ぶ。
  const ahead = sampleSurface(surface, Math.min(1, motion.progress + 0.02), tank, frame).position;
  const behind = sampleSurface(surface, Math.max(0, motion.progress - 0.02), tank, frame).position;
  const direction: -1 | 1 = Math.hypot(ahead.x - point.x, ahead.y - point.y) >=
    Math.hypot(behind.x - point.x, behind.y - point.y) ? 1 : -1;
  return {
    ...fish,
    surfaceMotion: { ...motion, pauseSec: 0, grazing: false,
      flee: { direction, remainingSec: 0.22 + random() * 0.12, facing: fish.facing } },
  };
}


