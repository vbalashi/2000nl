import { expect, test } from "vitest";
import { createTrainingOperationScope } from "@/lib/training/trainingOperationScope";
test("reset retires every operation, including a captured wait before selection",()=>{
  const owner=createTrainingOperationScope();const retry=owner.capture("recovery"),load=owner.begin("load");
  owner.reset();expect(retry.isCurrent()).toBe(false);expect(load.signal.aborted).toBe(true);
  expect(owner.begin("load").isCurrent()).toBe(true);expect(load.isCurrent()).toBe(false);
});
test("a newer operation replaces only its channel and cannot clear a different pending operation",()=>{
  const owner=createTrainingOperationScope();const load=owner.begin("load"),grade=owner.begin("grade");
  const newer=owner.begin("load");expect(load.isCurrent()).toBe(false);expect(newer.isCurrent()).toBe(true);expect(grade.isCurrent()).toBe(true);
  owner.cancel("grade");expect(grade.isCurrent()).toBe(false);expect(newer.isCurrent()).toBe(true);
});
test("captures share a lifetime until explicit invalidation, without starting another operation",()=>{
 const owner=createTrainingOperationScope();const first=owner.capture("recovery"),second=owner.capture("recovery");
 expect(first.signal).toBe(second.signal);owner.cancel("recovery");expect(first.isCurrent()).toBe(false);expect(second.isCurrent()).toBe(false);
 expect(owner.capture("recovery").isCurrent()).toBe(true);
});
