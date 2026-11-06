import {expect,test} from 'vitest';
import {actionTooltipBounds,tooltipBounds} from '@/components/onboarding/tooltipBounds';
const layout={width:393,height:852},safe={top:59,right:0,bottom:34,left:0},size={width:340,height:260};
test('keeps a tooltip out of the status area and home indicator',()=>{
 expect(tooltipBounds({left:0,top:0,width:393,height:852},layout,safe,size,{x:20,y:0})).toEqual({x:20,y:71});
 expect(tooltipBounds({left:0,top:0,width:393,height:852},layout,safe,size,{x:20,y:800}).y).toBe(546);
});
test('follows a shifted, shortened visual viewport',()=>{
 expect(tooltipBounds({left:30,top:180,width:300,height:400},layout,safe,{width:200,height:250},{x:0,y:0})).toEqual({x:42,y:192});
 expect(tooltipBounds({left:30,top:180,width:300,height:400},layout,safe,{width:200,height:250},{x:500,y:700})).toEqual({x:118,y:318});
});
test('anchors oversized content at the safe origin for scrolling',()=>{
 expect(tooltipBounds({left:0,top:0,width:393,height:300},layout,safe,{width:500,height:500},{x:0,y:0})).toEqual({x:12,y:71});
});

test('a tall guide scrolls below the launch control instead of clamping over it',()=>{
 const target={top:390,bottom:440};
 const result=actionTooltipBounds({left:0,top:0,width:393,height:852},layout,safe,{width:340,height:430},{x:27,y:475},target);
 expect(result.y).toBe(460);
 expect(result.maxHeight).toBe(346);
 expect(result.y+result.maxHeight).toBe(806);
});
test('chooses space above a low action and keeps the target gap',()=>{
 const result=actionTooltipBounds({left:0,top:0,width:393,height:852},layout,safe,{width:340,height:300},{x:27,y:750},{top:680,bottom:730});
 expect(result.y).toBe(360);
 expect(result.maxHeight).toBe(589);
});
test('a changed preferred position cannot move the guide back onto the action',()=>{
 const result=actionTooltipBounds({left:0,top:0,width:393,height:852},layout,safe,{width:340,height:346},{x:27,y:375},{top:390,bottom:440});
 expect(result.y).toBe(460);
});

test('a control group may use a short scrollable slot without reverting to an overlay',()=>{
 const device={width:320,height:568};
 const result=actionTooltipBounds({left:0,top:0,...device},device,safe,{width:296,height:450},{x:12,y:434},{top:154,bottom:414});
 expect(result.y).toBe(434);
 expect(result.maxHeight).toBe(88);
});
