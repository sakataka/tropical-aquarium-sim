import { lerp } from "./math";
import type { FishHabit, FishHabitType, FishSpeciesDefinition } from "./types";

export function findHabit<T extends FishHabitType>(
  species: FishSpeciesDefinition,
  type: T,
): Extract<FishHabit, { type: T }> | undefined {
  return species.ecology.habits.find((habit) => habit.type === type) as
    Extract<FishHabit, { type: T }> | undefined;
}

/** 次の息継ぎまでの秒数。 */
export function breathIntervalSec(
  habit: Extract<FishHabit, { type: "airBreathing" }>,
  random: () => number,
): number {
  const perHour = lerp(habit.breathsPerHour[0], habit.breathsPerHour[1], random());
  return 3600 / Math.max(perHour, 0.1);
}
