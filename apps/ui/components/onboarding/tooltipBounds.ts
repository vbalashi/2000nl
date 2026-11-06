/** Clamp a tooltip to the visible, safe part of the layout viewport. */
export function tooltipBounds(viewport:{left:number;top:number;width:number;height:number}, layout:{width:number;height:number}, safe:{top:number;right:number;bottom:number;left:number}, size:{width:number;height:number}, position:{x:number;y:number}) {
 const margin=12;
 const left=Math.max(viewport.left,safe.left)+margin;
 const top=Math.max(viewport.top,safe.top)+margin;
 const right=Math.min(viewport.left+viewport.width,layout.width-safe.right)-margin;
 const bottom=Math.min(viewport.top+viewport.height,layout.height-safe.bottom)-margin;
 return {x:Math.max(left,Math.min(position.x,right-size.width)),y:Math.max(top,Math.min(position.y,bottom-size.height))};
}

/** Reserve the highlighted control before clamping a tall, scrollable guide. */
export function actionTooltipBounds(
 viewport: {left:number;top:number;width:number;height:number},
 layout: {width:number;height:number},
 safe: {top:number;right:number;bottom:number;left:number},
 size: {width:number;height:number},
 position: {x:number;y:number},
 target: {top:number;bottom:number},
) {
 const top=Math.max(viewport.top,safe.top)+12;
 const bottom=Math.min(viewport.top+viewport.height,layout.height-safe.bottom)-12;
 const gap=20;
 const above=Math.max(0,target.top-gap-top),below=Math.max(0,bottom-target.bottom-gap);
 // Keep the preferred side when it fits; otherwise reserve the larger region.
 const side=position.y+size.height<=target.top-gap&&size.height<=above?'above'
  :position.y>=target.bottom+gap&&size.height<=below?'below'
  :above>below?'above':'below';
 const maxHeight=side==='above'?above:below;
 // Below the 44px padding/border box, a full-panel target has no usable external slot.
 if(maxHeight<44)return {...tooltipBounds(viewport,layout,safe,size,position),maxHeight:bottom-top};
 const height=Math.min(size.height,maxHeight);
 return {...tooltipBounds(viewport,layout,safe,{...size,height},{x:position.x,y:side==='above'?target.top-gap-height:target.bottom+gap}),maxHeight};
}
