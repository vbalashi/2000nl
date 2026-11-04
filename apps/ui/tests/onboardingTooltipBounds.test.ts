import {expect,test} from 'vitest';
import {tooltipBounds} from '@/components/onboarding/tooltipBounds';
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
