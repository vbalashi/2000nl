import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ArticleTranslation, ArticleContentNode } from "@/components/practice/article/ArticleContent";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel, librarySenseCardIdentity } from "@/components/training/library-v2/librarySenseCardModel";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";

test("keeps ready fields and replaces only missing fields with loading, then inline failure/retry", () => {
  const retry=vi.fn();
  const node={contentNodeId:"definition",parentContentNodeId:null,kind:"definition" as const,text:"definitie",children:[]};
  const view=render(<><ArticleTranslation text="готовый перевод" visible pending/><ArticleContentNode node={node} interfaceLanguage="ru" translationVisible translationPending/></>);
  expect(screen.getByText("готовый перевод")).toBeVisible();
  expect(view.container.querySelectorAll('[data-translation-loading]')).toHaveLength(1);
  expect(screen.queryByText("Перевод готовится")).toBeNull();
  view.rerender(<><ArticleTranslation text="готовый перевод" visible failed onRetry={retry}/><ArticleContentNode node={node} interfaceLanguage="ru" translationVisible translationFailed onRetryTranslation={retry}/></>);
  expect(view.container.querySelectorAll('[data-translation-loading]')).toHaveLength(0);
  const error=screen.getByRole('alert');
  expect(error.closest('[data-content-node-id]')).toHaveAttribute('data-content-node-id','definition');
  fireEvent.click(screen.getByRole('button'));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByText("готовый перевод")).toBeVisible();
});

test("article keeps the top translation slot above its source, even collapsed, and isolates other meanings", () => {
  const model=buildLibrarySenseCardGroupModel(multiSenseBankGroup,"en");
  const meaning=model.meanings[0];
  meaning.entryTranslation=null;
  meaning.entryTranslationAlternatives=[];
  meaning.translationNeedsPreparation=true;
  if(meaning.definition)meaning.definition={...meaning.definition,translation:undefined};
  const id=librarySenseCardIdentity(meaning.entryId,meaning.cardTypeId);
  const props={model,interfaceLanguage:"en" as const,translationEnabled:true,onAction:vi.fn(),revealActiveMeaning:false};
  const view=render(<LibrarySenseCardGroup {...props} translationStates={{[id]:"pending"}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Translate'}));
  const card=screen.getByTestId(`library-sense-card-${meaning.entryId}`);
  const lead=card.querySelector('[data-meaning-lead]')!;
  const skeleton=lead.querySelector('[data-translation-loading]')!;
  const source=lead.querySelector('p')!;
  expect(skeleton.compareDocumentPosition(source)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(card).toHaveAttribute('data-expanded','false');
  view.rerender(<LibrarySenseCardGroup {...props} translationStates={{[id]:"failed"}}/>);
  expect(lead.querySelectorAll('[role=alert]')).toHaveLength(2);
  expect(lead.querySelector('[data-translation-loading]')).toBeNull();
});
