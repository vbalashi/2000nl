import {act, renderHook} from "@testing-library/react";
import {expect, test, vi} from "vitest";
import {useTrainingAudioPlayback} from "@/components/training/useTrainingAudioPlayback";

test.each(["replace", "hide", "unmount"])("late audio cannot play after %s, even when transport ignores abort", async transition => {
  let finish!: (url:string)=>void;
  const resolve=vi.fn((_signal:AbortSignal)=>new Promise<string>(done=>{finish=done;}));
  const onPlay=vi.fn(),onError=vi.fn();
  const props={identity:"first",active:true,enabled:true,resolve,onPlay,onError};
  const hook=renderHook(options=>useTrainingAudioPlayback(options),{initialProps:props});
  let playback!:Promise<void>;
  act(()=>{playback=hook.result.current();});
  if(transition==="unmount")hook.unmount();
  else hook.rerender({...props,...(transition==="hide"?{active:false}:{identity:"second"})});
  expect(resolve.mock.calls[0][0].aborted).toBe(true);
  await act(async()=>{finish("blob:old");await playback;});
  expect(onPlay).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

test("a new callback does not interrupt playback, and an old request cannot clear its successor's lock", async()=>{
  const completions: Array<(url:string)=>void>=[];
  const resolve=vi.fn((_signal:AbortSignal)=>new Promise<string>(done=>completions.push(done)));
  const onPlay=vi.fn(),onError=vi.fn();
  const props={identity:"first",active:true,enabled:true,resolve,onPlay,onError};
  const hook=renderHook(options=>useTrainingAudioPlayback(options),{initialProps:props});
  let first!:Promise<void>,second!:Promise<void>;
  act(()=>{first=hook.result.current();});
  hook.rerender({...props,onError:vi.fn()});
  expect(resolve.mock.calls[0][0].aborted).toBe(false);
  hook.rerender({...props,identity:"second"});
  act(()=>{second=hook.result.current();});
  await act(async()=>{completions[0]("blob:old");await first;});
  await act(async()=>hook.result.current());
  expect(resolve).toHaveBeenCalledTimes(2);
  await act(async()=>{completions[1]("blob:new");await second;});
  expect(onPlay).toHaveBeenCalledOnce();
  expect(onPlay).toHaveBeenCalledWith("blob:new");
});

test("counts just one manual action across resolution and playback, excluding autoplay and overlapping clicks", async () => {
  const diagnostics = await import("@/lib/diagnostics/client");
  const finish = vi.fn();
  const begin = vi.spyOn(diagnostics, "beginProviderAction").mockReturnValue(finish);
  let receive!: (value: string) => void;
  const resolve = vi.fn(() => new Promise<string>(done => { receive = done; }));
  const hook = renderHook(() => useTrainingAudioPlayback({
    identity: "first", active: true, enabled: true, resolve,
    onPlay: async () => true, onError: vi.fn(),
  }));
  try {
    const manual = hook.result.current();
    await hook.result.current();
    receive("blob:test");
    await manual;
    const automatic = hook.result.current("automatic");
    receive("blob:test");
    await automatic;
    expect(begin).toHaveBeenCalledOnce();
    expect(finish.mock.calls).toEqual([["ready"]]);
  } finally { begin.mockRestore(); hook.unmount(); }
});

test("pending shared audio stays out of final failures", async () => {
  const diagnostics = await import("@/lib/diagnostics/client");
  const finish = vi.fn();
  const begin = vi.spyOn(diagnostics, "beginProviderAction").mockReturnValue(finish);
  const hook = renderHook(() => useTrainingAudioPlayback({
    identity: "first", active: true, enabled: true,
    resolve: async () => { throw new Error("audio_pending"); },
    onPlay: async () => true, onError: vi.fn(),
  }));
  try {
    await hook.result.current();
    expect(finish.mock.calls).toEqual([["pending"]]);
  } finally { begin.mockRestore(); hook.unmount(); }
});
