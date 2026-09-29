export const practicePalettes = [
  {id: "lavender", label: "Lavender"},
  {id: "blue", label: "Blue"},
  {id: "graphite", label: "Graphite"},
] as const;
export type PracticePalette = typeof practicePalettes[number]["id"];
export type PracticeColourMode = "Light" | "Dark" | "System";
export function isPracticePalette(value: unknown): value is PracticePalette {
  return practicePalettes.some(palette => palette.id === value);
}
