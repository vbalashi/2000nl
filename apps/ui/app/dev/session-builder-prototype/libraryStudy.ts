// Prototype comparison contract. Every row drives both the matrix and the rendered components.
export const studyAxes = {
  wordDetails:{label:"Additional details",note:"For entries without forms, meaning relations keep their own disclosure.",options:{primary:"Key forms · relations inline",complete:"More forms · relations on request"}},
  filterLayout:{label:"Library filters",note:"Compare rows with sliding subfilters against builder-style chips and a nearby popover.",options:{rows:"Rows · sliding screens",chips:"Chips · subfilter popover"}},
  markerPlacement:{label:"Meaning markers",note:"Keep number and exposure at the edge, outside the reading area.",options:{above:"Above the frame",edge:"On the frame · original"}},
  articleFrame:{label:"Outer word frame",note:"Keep individual meanings framed; compare the surrounding word container.",options:{flat:"No outer frame",mobile:"No frame on phone",framed:"Original outer frame"}},
  nestedTextInset:{label:"Nested text alignment",note:"Explanation and Example share one vertical line.",options:{aligned:"Aligned with labels",inset:"Inset text · 8 px"}},
  roleLabels:{label:"Nested labels",note:"Explanation stays inside; compare Example on the divider or above its text.",options:{border:"Example on divider",inline:"Above the text",plain:"Example without line"}},
  nestedReading:{label:"Explanation / example",note:"Compare hierarchy inside an idiom: source and translation stay paired.",options:{paired:"1 · Clear pairs",literary:"2 · Literary example",tiles:"3 · Separate surfaces",original:"Original"}},
  translationInk: {label:"Translation accent",note:"English demo translations: all meanings, examples and idioms of goed.",options:{warm:"Warm emphasis",neutral:"Neutral emphasis"}},
  headerShape: {label:"Audio / translation shape",note:"Only these two controls; other buttons keep their selected shape.",options:{circle:"Circle",rounded:"Rounded rectangle"}},
  exposure: {label:"Exposure label",note:"Demo: New or 3× exposures, with the repeat icon.",options:{frame:"In the top border",inline:"Inside header"}},
  countPosition: {label:"Sense count position",note:"Keep related metadata together, or compare the far-edge position.",options:{near:"Beside metadata",edge:"Far edge (wide list)"}},
  navigation: { label: "Return", note: "One control only; audio and translation stay beside metadata.", options: { back: "Back arrow", close: "Close ×" } },
  numbering: { label: "Meaning number", note: "Corner removes the reserved number column.", options: { corner: "Cut-in corner", inline: "Inside header" } },
  controls: { label: "Button height", note: "Visual height; touch targets keep extra transparent space.", options: { slim: "Slim · 28 px", comfortable: "Comfortable · 34 px" } },
  shape: { label: "Button shape", note: "Text buttons and other controls; audio / translation have their own setting.", options: { rounded: "Rounded rectangle", pill: "Pill / circle" } },
  actions: { label: "Action grouping", note: "Compare the same actions, without changing their meaning.", options: { full: "Full-width + quiet row", split: "Compact + quiet row", toolbar: "Primary + overflow" } },
  nesting: { label: "Nested content", note: "Example: violet; idiom: amber; usage: teal.", options: { plain: "Typography", blocks: "Soft blocks", rails: "Colour rails", combined: "Blocks + rails", hybrid: "Phrase outside block" } },
  ratingInk: { label: "Rating text", note: "Compare neutral, exact accent and darker related colours.", options: {neutral:"Neutral",exact:"Same as accent",tonal:"Darker accent"} },
  learnWidth: {label:"Learn width",note:"Primary action above Collections and the action menu.",options:{full:"Full width",inset:"Inset · 8% each side"}},
  listing: {label:"List metadata",note:"Narrow columns keep word, part of speech, 2K and the sense count.",options:{metadata:"Metadata only",counts:"Metadata + sense count",preview:"Metadata + first definition"}},
  scene: { label: "Card state", note: "Local demonstration; ratings never record a real review.", options: { new: "New · Learn", review: "Answer · four ratings" } },
} as const;
export type StudyKey = keyof typeof studyAxes;
export type LibraryStudy = { [K in StudyKey]: keyof typeof studyAxes[K]["options"] };
export type Nesting = LibraryStudy["nesting"];
// Approved presentation recipe. URL parameters are explicit comparison overrides only.
export const studyDefaults: LibraryStudy = { wordDetails:"primary", filterLayout:"chips", markerPlacement:"above", articleFrame:"flat", navigation: "back", numbering: "corner", controls: "slim", shape: "rounded", actions: "toolbar", nesting: "hybrid", scene: "new", ratingInk:"tonal",learnWidth:"full",listing:"counts",exposure:"frame",countPosition:"near",translationInk:"warm",headerShape:"circle",nestedReading:"literary",roleLabels:"plain",nestedTextInset:"inset" };
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
  url.searchParams.delete("formStyle");
  for (const key of Object.keys(studyAxes) as StudyKey[]) url.searchParams.set(key, study[key]);
  window.history.replaceState(null, "", url);
}
