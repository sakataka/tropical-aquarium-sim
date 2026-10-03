import type { Vec2 } from "./types";

export function lerp(from: number, to: number, amount: number): number { return from + (to - from) * amount; }
export function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function subtract(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function scale(value: Vec2, amount: number): Vec2 { return { x: value.x * amount, y: value.y * amount }; }
export function addMany(...values: Vec2[]): Vec2 { return values.reduce(add, { x: 0, y: 0 }); }
export function length(value: Vec2): number { return Math.hypot(value.x, value.y); }
export function distance(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
/** 長さ1の向き。ほぼ0のときは fallback（既定は0ベクトル）を返す。 */
export function normalize(value: Vec2, fallback: Vec2 = { x: 0, y: 0 }): Vec2 {
  const magnitude = length(value);
  return magnitude > 0.0001 ? scale(value, 1 / magnitude) : fallback;
}
