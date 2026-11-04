import React from "react";
import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, expect, test, vi} from "vitest";
import {ArticleSenseRelations} from "@/components/practice/article/ArticleWordDetails";
import {AdditionalCardTranslationProvider, CardTranslationLanguagesProvider} from "@/components/practice/article/AdditionalCardTranslation";
import {lexicalRelationDetail} from "@/components/practice/article/wordDetailsPresentation";
import {relatedWordGateGroup} from "@/lib/platform/fixtures/relatedWordGateFixture";
import type {PlatformHeadwordGroupV2, PlatformSenseCardEntryV2} from "../../../packages/shared/types/platformV2";

const {lookup, request} = vi.hoisted(() => ({lookup: vi.fn(), request: vi.fn()}));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({fetchPlatformV2LibraryGroup: lookup}));
vi.mock("@/lib/platform/platformV2TrainingMediaClient", () => ({requestPlatformV2Translation: request}));
const entry = relatedWordGateGroup.entries[0];
const english = ["warm", "glowing", "cold"];
function secondaryGroup(): PlatformHeadwordGroupV2 {
 return {...relatedWordGateGroup, entries: [{
  ...entry, capabilities: [], translation: null,
  wordDetails: {...entry.wordDetails!, lexicalRelations: entry.wordDetails!.lexicalRelations.map((relation,index) => ({
   ...relation, translations: relation.translations!.map(translation => ({...translation, targetLanguageCode: "en", text: english[index]})),
  }))},
 }]};
}
function Relations({visible=true, primary=true, secondary=true, pending=false, failed=false, retry=vi.fn()}:{visible?:boolean;primary?:boolean;secondary?:boolean;pending?:boolean;failed?:boolean;retry?:()=>void}) {
 const relation = lexicalRelationDetail(entry.wordDetails, "ru");
 if(!primary) for(const item of [...relation.synonyms,...relation.antonyms]) delete item.translation;
 return <CardTranslationLanguagesProvider primary="ru" secondary={secondary ? "en" : null}>
  <AdditionalCardTranslationProvider entryId={entry.entryId} contentLanguage="nl" visible={visible}>
   <ArticleSenseRelations relation={relation} interfaceLanguage="en" contentLanguage="nl" translationLanguage="ru"
    translationVisible={visible} translationPending={pending} translationFailed={failed} onRetryTranslation={retry}/>
  </AdditionalCardTranslationProvider>
 </CardTranslationLanguagesProvider>;
}
const translationFor = (container:HTMLElement, kind="synonyms") => container.querySelector(`[data-kind="${kind}"] [data-content-translation="true"]`)!;
beforeEach(() => {
 lookup.mockReset().mockResolvedValue(secondaryGroup()); request.mockReset();
 vi.stubGlobal("BroadcastChannel", undefined);
});

test.each([["synonyms", "тёплый", "warm"], ["antonyms", "холодный", "cold"]])("%s has one bilingual parenthetical with compact labels and no colons", async (kind,ru,en) => {
 const {container} = render(<Relations/>);
 await waitFor(() => expect(translationFor(container,kind)).toHaveTextContent(`(RU ${ru} · EN ${en})`));
 const translation = translationFor(container,kind);
 expect(translation.textContent?.match(/\(/g)).toHaveLength(1);
 expect(translation.textContent?.match(/\)/g)).toHaveLength(1);
 expect(translation.textContent).not.toContain(":");
 expect(translation.querySelector('[lang="ru"]')).toHaveTextContent(ru);
 expect(translation.querySelector('[lang="en"]')).toHaveTextContent(en);
 expect(translation.querySelectorAll('[data-language-label]')).toHaveLength(2);
 expect(container.querySelector(`[data-kind="${kind}"] p`)).toHaveAttribute("lang","nl");
 expect(request).not.toHaveBeenCalled();
});

test("secondary-only keeps its label without empty primary text or separators", async () => {
 const {container} = render(<Relations primary={false}/>);
 await waitFor(() => expect(translationFor(container)).toHaveTextContent("(EN warm)"));
 expect(translationFor(container).textContent).not.toMatch(/RU|·|:/);
 expect(translationFor(container)).toHaveAttribute("lang","en");
});

test("one language retains its familiar unlabelled parenthetical", () => {
 const {container} = render(<Relations secondary={false}/>);
 expect(translationFor(container)).toHaveTextContent("(тёплый)");
 expect(translationFor(container)).toHaveAttribute("lang","ru");
 expect(translationFor(container).querySelector('[data-language-label]')).toBeNull();
 expect(lookup).not.toHaveBeenCalled();
});

test("no available language leaves no empty parenthetical", () => {
 const {container} = render(<Relations primary={false} secondary={false}/>);
 expect(container.querySelector('[data-content-translation]')).toBeNull();
 expect(screen.getByText("warm",{exact:true})).toBeVisible();
});

test("the shared switch hides both languages and keeps source relations visible", async () => {
 const view = render(<Relations/>);
 await waitFor(() => expect(translationFor(view.container)).toHaveTextContent("EN warm"));
 view.rerender(<Relations visible={false}/>);
 expect(translationFor(view.container)).toHaveAttribute("hidden");
 expect(translationFor(view.container)).toHaveAttribute("aria-hidden","true");
 expect(translationFor(view.container)).not.toBeVisible();
 expect(screen.getByText("koud",{exact:true})).toBeVisible();
 view.rerender(<Relations/>);
 await waitFor(() => expect(translationFor(view.container)).toBeVisible());
});

test("secondary loading stays inside the same parentheses beside readable primary text", async () => {
 lookup.mockImplementation(() => new Promise(() => {}));
 const {container} = render(<Relations/>);
 await waitFor(() => expect(translationFor(container).querySelector('[data-translation-loading]')).not.toBeNull());
 const translation = translationFor(container);
 expect(translation).toHaveTextContent("(RU тёплый · EN )");
 expect(translation.querySelector('[lang="en"] [data-translation-loading]')).not.toBeNull();
});

test("primary loading and retry remain independent of ready secondary text", async () => {
 const retry = vi.fn();
 const view = render(<Relations primary={false} pending retry={retry}/>);
 await waitFor(() => expect(translationFor(view.container)).toHaveTextContent("EN warm"));
 expect(translationFor(view.container).querySelector('[lang="ru"] [data-translation-loading]')).not.toBeNull();
 view.rerender(<Relations primary={false} failed retry={retry}/>);
 const button = translationFor(view.container).querySelector('button')!;
 fireEvent.click(button);
 expect(retry).toHaveBeenCalledOnce();
 expect(translationFor(view.container)).toHaveTextContent("EN warm");
});

test("a failed secondary lookup retries without replacing the primary translation", async () => {
 lookup.mockRejectedValueOnce(new Error("offline"));
 const {container} = render(<Relations/>);
 await waitFor(() => expect(translationFor(container).querySelector('[lang="en"] button')).not.toBeNull());
 expect(translationFor(container)).toHaveTextContent("RU тёплый");
 fireEvent.click(translationFor(container).querySelector('[lang="en"] button')!);
 await waitFor(() => expect(translationFor(container)).toHaveTextContent("(RU тёплый · EN warm)"));
 expect(lookup).toHaveBeenCalledTimes(2);
});

test.each(["language", "source", "relation-source", "id", "status"])("ignores a secondary translation with mismatched %s", async variant => {
 const group = secondaryGroup(), details = (group.entries[0] as PlatformSenseCardEntryV2).wordDetails!;
 const relation = details.lexicalRelations[0], translation = relation.translations![0];
 if(variant === "language") translation.targetLanguageCode = "de";
 if(variant === "source") translation.sourceTextFingerprint = "old";
 if(variant === "relation-source") relation.sourceTextFingerprint = "different";
 if(variant === "id") relation.relationId = "another-relation";
 if(variant === "status") translation.status = "pending";
 lookup.mockResolvedValue(group);
 const {container} = render(<Relations/>);
 await act(async () => {});
 expect(translationFor(container)).toHaveTextContent("(RU тёплый)");
 expect(translationFor(container).querySelector('[lang="en"]')).toBeNull();
});
