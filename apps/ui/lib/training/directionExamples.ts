import type { TrainingExerciseFamily } from "../types";

/** Illustrative content only; never used for candidate selection or scheduling. */
export function directionExample(language: string, family: TrainingExerciseFamily): readonly [string, string] | null {
  if (family === "meaning") {
    if (language === "nl") return ["de fiets", "Een voertuig met twee wielen waarop je trapt."];
    if (language === "en") return ["bicycle", "A vehicle with two wheels that you move by pedalling."];
  }
  if (family === "idiom") {
    if (language === "nl") return ["Met de deur in huis vallen", "Meteen zeggen waar het om gaat."];
    if (language === "en") return ["Break the ice", "Make people feel more relaxed when they first meet."];
  }
  return null;
}
