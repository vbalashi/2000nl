/** Revision tokens stay decimal strings end-to-end; never coerce bigint to Number. */
export function noteRevision(value:unknown):value is string{
 return typeof value==='string' && /^(0|[1-9][0-9]{0,18})$/.test(value)
  && (value.length<19||value<='9223372036854775807');
}
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
export function noteText(value:unknown):value is string|null{
 if(value===null)return true;
 if(typeof value!=='string'||value.includes('\0')||new TextEncoder().encode(value).byteLength>65536)return false;
 for(const symbol of value){const point=symbol.codePointAt(0)!;if(point>=0xd800&&point<=0xdfff)return false;}
 return true;
}
export type OwnNoteCommand={expectedRevision:string;notes:string|null};
export type OwnNote={entryId:string;revision:string;notes:string|null};
export function parseOwnNoteCommand(value:unknown):OwnNoteCommand|null{
 return record(value)&&Object.keys(value).length===2&&noteRevision(value.expectedRevision)&&noteText(value.notes)
  ?{expectedRevision:value.expectedRevision,notes:value.notes}:null;
}
export function parseOwnNote(value:unknown,entryId:string):OwnNote|null{
 return record(value)&&Object.keys(value).length===3&&value.entryId===entryId&&noteRevision(value.revision)&&noteText(value.notes)
  ?{entryId,revision:value.revision,notes:value.notes}:null;
}

export function parseOwnNoteWriteResult(value:unknown,entryId:string,command:OwnNoteCommand):OwnNote|null{
 const note=parseOwnNote(value,entryId);if(!note||note.notes!==command.notes)return null;
 const delta=BigInt(note.revision)-BigInt(command.expectedRevision);
 return delta===BigInt(0)||delta===BigInt(1)?note:null;
}
