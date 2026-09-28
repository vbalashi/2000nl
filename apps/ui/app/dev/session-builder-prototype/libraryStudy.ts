// Prototype comparison contract. Every row drives both the matrix and the rendered components.
export const studyAxes = {
  navigation: { label: "Return", note: "One control only; audio and translation stay beside metadata.", options: { back: "Back arrow", close: "Close ×" } },
  numbering: { label: "Meaning number", note: "Corner removes the reserved number column.", options: { corner: "Cut-in corner", inline: "Inside header" } },
  controls: { label: "Button height", note: "Visual height; touch targets keep extra transparent space.", options: { slim: "Slim · 28 px", comfortable: "Comfortable · 34 px" } },
  shape: { label: "Button shape", note: "Applies to text and icon buttons throughout the article.", options: { rounded: "Rounded rectangle", pill: "Pill / circle" } },
  actions: { label: "Action grouping", note: "Compare the same actions, without changing their meaning.", options: { full: "Full-width + quiet row", split: "Compact + quiet row", toolbar: "Primary + overflow" } },
  nesting: { label: "Nested content", note: "Example: violet; idiom: amber; usage: teal.", options: { plain: "Typography", blocks: "Soft blocks", rails: "Colour rails", combined: "Blocks + rails", hybrid: "Phrase outside block" } },
  ratingInk: { label: "Rating text", note: "Compare neutral, exact accent and darker related colours.", options: {neutral:"Neutral",exact:"Same as accent",tonal:"Darker accent"} },
  learnWidth: {label:"Learn width",note:"Primary action above Collections and the action menu.",options:{full:"Full width",inset:"Inset · 8% each side"}},
  listing: {label:"List metadata",note:"Narrow columns keep only word, part of speech and 2K.",options:{metadata:"Metadata only",counts:"Metadata + sense count",preview:"Metadata + first definition"}},
  scene: { label: "Card state", note: "Local demonstration; ratings never record a real review.", options: { new: "New · Learn", review: "Answer · four ratings" } },
} as const;
export type StudyKey = keyof typeof studyAxes;
export type LibraryStudy = { [K in StudyKey]: keyof typeof studyAxes[K]["options"] };
export type Nesting = LibraryStudy["nesting"];
export const studyDefaults: LibraryStudy = { navigation: "back", numbering: "corner", controls: "slim", shape: "rounded", actions: "toolbar", nesting: "hybrid", scene: "new", ratingInk:"tonal",learnWidth:"inset",listing:"metadata" };
export const studyPresets: { id: string; name: string; description: string; values: LibraryStudy }[] = [
  { id: "quiet", name: "1 · Quiet", description: "Compact Learn, soft blocks, no coloured rails.", values: { ...studyDefaults, actions: "split", nesting: "blocks" } },
  { id: "guided", name: "2 · Guided", description: "Centred Learn; phrase and explanation linked.", values: { ...studyDefaults } },
  { id: "tools", name: "3 · Tools", description: "Circle icons, overflow actions, coloured rails.", values: { ...studyDefaults, navigation: "close", shape: "pill", actions: "toolbar", nesting: "combined" } },
];
export function readStudy(params: URLSearchParams): LibraryStudy {
  const next = { ...studyDefaults };
  for (const key of Object.keys(studyAxes) as StudyKey[]) {
    const value = params.get(key);
    if (value && Object.hasOwn(studyAxes[key].options, value)) Object.assign(next, { [key]: value });
  }
  return next;
}
export function studyUrl(study: LibraryStudy) {
  const url = new URL(window.location.href);
  for (const key of Object.keys(studyAxes) as StudyKey[]) url.searchParams.set(key, study[key]);
  window.history.replaceState(null, "", url);
}
