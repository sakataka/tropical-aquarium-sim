import type { FishHabit, FishHabitType, FishSpeciesDefinition } from "./types";

export function findHabit<T extends FishHabitType>(
  species: FishSpeciesDefinition,
  type: T,
): Extract<FishHabit, { type: T }> | undefined {
  return species.ecology.habits.find((habit) => habit.type === type) as
    Extract<FishHabit, { type: T }> | undefined;
}
