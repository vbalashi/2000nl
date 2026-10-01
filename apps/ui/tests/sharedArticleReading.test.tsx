import React from 'react';
import {getUiMessages} from '@/lib/uiMessages';
import {platformV2Message} from '@/lib/platform/platformV2ClientI18n';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {ArticleContentNode,ArticleMeaningDetails,ArticleReadingFrame} from '@/components/practice/article/ArticleContent';
import {buildLibrarySenseCardGroupModel} from '@/components/training/library-v2/librarySenseCardModel';
import {LibrarySenseCardGroup} from '@/components/training/library-v2/LibrarySenseCardGroup';
import {TrainingCardAnswerBody} from '@/components/training/v2/TrainingCardTemplates';
import {buildTrainingSenseCardModel} from '@/components/training/v2/trainingSenseCardModel';
import {multiSenseBankGroup} from './platformV2LibraryFixture';
import {goedGroup,goedEntry} from './platformV2IdiomHierarchyFixture';

afterEach(()=>{vi.unstubAllEnvs();});

test('normalized expression hierarchy keeps ownership and separates interface/content/translation languages',()=>{
 const meaning=buildLibrarySenseCardGroupModel(goedGroup,'en').meanings[0];
 const view=render(<ArticleReadingFrame><ArticleMeaningDetails definition={meaning.definition} details={meaning.details} interfaceLanguage="ru" contentLanguage="nl" translationLanguage="en" translationVisible/></ArticleReadingFrame>);
 const expression=view.container.querySelector('[data-content-node-id="idiom-goed"]')!;
 expect(expression.querySelector('[data-content-node-id="idiom-explanation-goed"]')).not.toBeNull();
 expect(expression.querySelector('[data-content-node-id="idiom-example-goed"]')).not.toBeNull();
 expect(expression.querySelector('p[lang="nl"]')).toHaveTextContent('iets komt ten goede aan iemand of iets');
 expect(screen.getByText(/Примеры/i)).toBeInTheDocument();
});

test('an absent translation renders nothing; a collapsed translation stays hidden without losing its source',()=>{
 const node={contentNodeId:'definition',parentContentNodeId:null,kind:'definition' as const,text:'Source',translation:'Translation',children:[]};
 const view=render(<ArticleContentNode node={node} lead interfaceLanguage="en" contentLanguage="nl" translationLanguage="ru"/>);
 expect(screen.getByText('Source')).toHaveAttribute('lang','nl');
 expect(screen.getByText('Translation').closest('[aria-hidden]')).toHaveAttribute('aria-hidden','true');
 view.rerender(<ArticleContentNode node={{...node,translation:undefined}} lead interfaceLanguage="en"/>);
 expect(screen.queryByText('Translation')).not.toBeInTheDocument();
});

test('Library approved renderer preserves the hierarchy and keeps translation toggles read-only',()=>{
 vi.stubEnv('NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1','true');const action=vi.fn();
 const model=buildLibrarySenseCardGroupModel(goedGroup,'en');
 const view=render(<LibrarySenseCardGroup model={model} interfaceLanguage="en" contentLanguage="nl" translationLanguage="en" translationEnabled onAction={action}/>);
 const expression=view.container.querySelector('[data-content-node-id="idiom-goed"]')!;
 expect(expression).toContainElement(view.container.querySelector('[data-content-node-id="idiom-explanation-goed"]') as HTMLElement);
 expect(view.container.querySelector('[data-article-presentation="approved-v1"]')).not.toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Translate'}));
 expect(action).not.toHaveBeenCalled();
});

test('Training and Library use the same content IDs and nested renderer in approved mode',()=>{
 vi.stubEnv('NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1','true');
 const model=buildTrainingSenseCardModel({group:goedGroup,entry:goedEntry,interfaceLanguage:'ru'});
 const view=render(<TrainingCardAnswerBody model={model} interfaceLanguage="ru" contentLanguage="nl" translationLanguage="en" translationVisible onReachEnd={vi.fn()}/>);
 const expression=view.container.querySelector('[data-content-node-id="idiom-goed"]')!;
 expect(expression).toContainElement(view.container.querySelector('[data-content-node-id="idiom-example-goed"]') as HTMLElement);
 expect(view.container.querySelectorAll('[data-content-node-id="idiom-goed"]')).toHaveLength(1);
 expect(screen.getByTestId('training-answer-scroll')).toContainElement(expression as HTMLElement);
});

test('approved Library keeps selected meaning and dispatches original server capabilities',()=>{
 vi.stubEnv('NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1','true');const action=vi.fn();const collections=vi.fn();
 const model=buildLibrarySenseCardGroupModel(multiSenseBankGroup,'en');const selected=model.meanings[1];
 render(<LibrarySenseCardGroup model={model} activeMeaningId={selected.entryId} interfaceLanguage="en" onOpenCollections={collections} onAction={action}/>);
 const card=screen.getByTestId('library-sense-card-'+selected.entryId);
 expect(card).toHaveAttribute('data-expanded','true');
 fireEvent.click(within(card).getByRole('button',{name:'Learn'}));
 expect(action).toHaveBeenCalledWith(selected.startLearning);
 fireEvent.click(within(card).getByRole('button',{name:'Collections'}));
 expect(collections).toHaveBeenCalledWith(selected);
 fireEvent.click(within(card).getByRole('button',{name:getUiMessages('en').library.moreActions}));
 expect(action).toHaveBeenCalledTimes(1);
 const menu=screen.getByRole('menu');
 fireEvent.click(within(menu).getByRole('menuitem',{name:platformV2Message('en',selected.markKnown!.messageKey)}));
 expect(action).toHaveBeenLastCalledWith(selected.markKnown);
 expect(card).toHaveAttribute('data-expanded','true');
 expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test.each(['en','nl','ru'] as const)('Library word exclusion menu is read-only until the explicit localized action (%s)',language=>{
 vi.stubEnv('NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1','true');const action=vi.fn(),exclude=vi.fn(),report=vi.fn();
 const model=buildLibrarySenseCardGroupModel(multiSenseBankGroup,language),selected=model.meanings[1];
 render(<LibrarySenseCardGroup model={model} activeMeaningId={selected.entryId} interfaceLanguage={language} onAction={action} onExclude={exclude} onReport={report} reportableEntryIds={new Set([selected.entryId])}/>);
 const card=screen.getByTestId('library-sense-card-'+selected.entryId);
 fireEvent.click(within(card).getByRole('button',{name:getUiMessages(language).library.moreActions}));
 expect(exclude).not.toHaveBeenCalled();expect(action).not.toHaveBeenCalled();expect(report).not.toHaveBeenCalled();
 const menu=screen.getByRole('menu');expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
 fireEvent.click(within(menu).getByRole('menuitem',{name:getUiMessages(language).trainingSession.exclusion.headwordLabel}));
 expect(exclude).toHaveBeenCalledTimes(1);expect(action).not.toHaveBeenCalled();expect(report).not.toHaveBeenCalled();
 expect(screen.queryByRole('menu')).not.toBeInTheDocument();expect(card).toHaveAttribute('data-expanded','true');
});

test('source usage patterns are separate from idioms and examples',()=>{
 const node=(id:string,kind:'usage-pattern'|'example'|'idiom',text:string)=>({contentNodeId:id,parentContentNodeId:null,kind,text,children:[]});
 const view=render(<ArticleMeaningDetails definition={null} details={[node('context','usage-pattern','iemand doet een plaats aan'),node('example','example','het schip deed de haven van Rotterdam aan'),node('idiom','idiom','een expression')]} interfaceLanguage="ru" contentLanguage="nl"/>);
 expect(view.container.querySelector('[data-section="usage"]')).toHaveTextContent('iemand doet een plaats aan');
 expect(view.container.querySelector('[data-section="expressions"]')).not.toHaveTextContent('iemand doet een plaats aan');
 expect(view.container.querySelector('[data-section="examples"]')).toHaveTextContent('het schip deed de haven van Rotterdam aan');
});
