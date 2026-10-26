import {isPlatformEntryNoteMaterialV2,platformNoteMaterialWithinBudgetV2} from '../../../../packages/shared/types/platformV2Runtime';
import type {PlatformEntryNoteMaterialV2} from '../../../../packages/shared/types/platformV2';
export type EntryNoteMaterial={entryId:string;notes:PlatformEntryNoteMaterialV2[]};
export function parseEntryNoteMaterial(value:unknown,entryId:string):EntryNoteMaterial|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>;
 return Object.keys(row).length===2&&row.entryId===entryId&&isPlatformEntryNoteMaterialV2(row.notes)
  &&platformNoteMaterialWithinBudgetV2([row.notes])?{entryId,notes:row.notes}:null;
}
