/** Clamp a tooltip to the visible, safe part of the layout viewport. */
export function tooltipBounds(viewport:{left:number;top:number;width:number;height:number}, layout:{width:number;height:number}, safe:{top:number;right:number;bottom:number;left:number}, size:{width:number;height:number}, position:{x:number;y:number}) {
 const margin=12;
 const left=Math.max(viewport.left,safe.left)+margin;
 const top=Math.max(viewport.top,safe.top)+margin;
 const right=Math.min(viewport.left+viewport.width,layout.width-safe.right)-margin;
 const bottom=Math.min(viewport.top+viewport.height,layout.height-safe.bottom)-margin;
 return {x:Math.max(left,Math.min(position.x,right-size.width)),y:Math.max(top,Math.min(position.y,bottom-size.height))};
}
