import type {PlatformHeadwordGroupV2} from '../../../../packages/shared/types/platformV2';
/** A cached article/current-card permit is not fresh authority for overlays. */
export function clearPlatformNoteMaterial(group:PlatformHeadwordGroupV2):PlatformHeadwordGroupV2{
 if(!group.entries.some(e=>e.kind==='sense-card'&&e.noteMaterial?.length))return group;
 return {...group,entries:group.entries.map(e=>e.kind==='sense-card'&&e.noteMaterial?.length?{...e,noteMaterial:[]}:e)};
}
