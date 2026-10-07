import React from "react";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,test,vi} from "vitest";
import {useTrainingPromptReveal} from "@/components/practice/ui/useTrainingPromptReveal";
import {TrainingInteractionPreferencesProvider,defaultTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
function Harness({animation=true}:{animation?:boolean}) {
 return <TrainingInteractionPreferencesProvider userId="test" initial={{...defaultTrainingInteractions,animation}}><Card/></TrainingInteractionPreferencesProvider>;
}
function Card(){
 const root=React.useRef<HTMLDivElement>(null),[revealed,setRevealed]=React.useState(false);
 const {capture,moving}=useTrainingPromptReveal({root,revealed,enabled:true,identity:"card"});
 return <div ref={root}><article data-testid="training-sense-card-shell">{revealed?<p style={{fontSize:20}}>Different answer</p>:<h2 style={{fontSize:40}}>Question</h2>}</article><button onClick={()=>{capture();setRevealed(true);}}>Reveal</button><button disabled={moving}>Grade</button></div>;
}
function motion(reduced=false){
 vi.stubGlobal("matchMedia",()=>({matches:reduced}));
 const animations:{onfinish:(()=>void)|null;oncancel:(()=>void)|null;cancel:ReturnType<typeof vi.fn>}[]=[];
 const animate=vi.fn((..._args:Parameters<HTMLElement['animate']>)=>{const animation={onfinish:null,oncancel:null,cancel:vi.fn()};animations.push(animation);return animation as unknown as Animation;});
 vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockReturnValue({left:20,top:80,width:160,height:240} as DOMRect);
 Object.defineProperty(HTMLElement.prototype,"animate",{configurable:true,value:animate});
 return {animations,animate};
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();delete(HTMLElement.prototype as Partial<HTMLElement>).animate;});
test("shifts the whole card out and in without interpolating typography, locks grading for both phases",()=>{
 const {animations,animate}=motion();render(<Harness/>);fireEvent.click(screen.getByText("Reveal"));
 expect(document.querySelector('[data-training-reveal-overlay]')).toHaveTextContent("Question");
 expect(screen.getByTestId('training-sense-card-shell').style.opacity).toBe('0');expect(screen.getByText('Grade')).toBeDisabled();
 expect(animate.mock.calls[0][0]).toEqual([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-8px)'}]);
 act(()=>animations[0].onfinish?.());
 expect(document.querySelector('[data-training-reveal-overlay]')).toBeNull();expect(screen.getByText('Grade')).toBeDisabled();
 expect(animate.mock.calls[1][0]).toEqual([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}]);
 act(()=>animations[1].onfinish?.());expect(screen.getByText('Grade')).toBeEnabled();
});
for(const mode of ['disabled','reduced'] as const)test(`${mode} motion reveals immediately`,()=>{
 const {animate}=motion(mode==='reduced');render(<Harness animation={mode!=='disabled'}/>);fireEvent.click(screen.getByText('Reveal'));
 expect(animate).not.toHaveBeenCalled();expect(screen.getByText('Grade')).toBeEnabled();expect(screen.getByText('Different answer')).toBeVisible();
});
test('unmount cancels and removes the copy',()=>{const {animations}=motion();const {unmount}=render(<Harness/>);fireEvent.click(screen.getByText('Reveal'));unmount();expect(animations[0].cancel).toHaveBeenCalled();expect(document.querySelector('[data-training-reveal-overlay]')).toBeNull();});
test('animation failure restores a usable answer',()=>{const {animate}=motion();animate.mockImplementation(()=>{throw new Error('unsupported');});render(<Harness/>);fireEvent.click(screen.getByText('Reveal'));expect(screen.getByText('Grade')).toBeEnabled();expect(screen.getByTestId('training-sense-card-shell').style.opacity).toBe('');});
