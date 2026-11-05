export const practicePalettes = [
  {id: "lavender"},
  {id: "blue"},
  {id: "indigo"},
  {id: "graphite"},
] as const;
export type PracticePalette = typeof practicePalettes[number]["id"];
export type PracticeColourMode = "Light" | "Dark" | "System";
export function isPracticePalette(value: unknown): value is PracticePalette {
  return practicePalettes.some(palette => palette.id === value);
}
