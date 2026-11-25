import {act, renderHook} from "@testing-library/react";
import {expect, test} from "vitest";
import {usePersonalCardDrafts} from "@/components/training/wordlist/usePersonalCardDrafts";

test("a late save completes only its own draft even after another draft opens",()=>{
  const {result, rerender} = renderHook(({user})=>usePersonalCardDrafts(user,"nl"),{initialProps:{user:"draft-owner"}});
  const first = {sessionKey:"first", word:"bank", definition:"a", partOfSpeech:null};
  const second = {...first,sessionKey:"second",definition:"b"};
  act(()=>result.current.open(first));
  const finishFirst = result.current.remove;
  act(()=>result.current.open(second));
  act(()=>finishFirst(first.sessionKey));
  expect(result.current.drafts).toEqual([second]);
  expect(result.current.active).toEqual(second);
  rerender({user:"someone-else"});
  expect(result.current.drafts).toEqual([]);
  rerender({user:"draft-owner"});
  expect(result.current.active).toBeNull();
  expect(result.current.drafts).toEqual([second]);
});
