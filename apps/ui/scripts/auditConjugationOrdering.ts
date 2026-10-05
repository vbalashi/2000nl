/** Read-only corpus audit. From apps/ui:
 * npx vite-node scripts/auditConjugationOrdering.ts /absolute/path/to/words_content
 */
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {projectPlatformV2WordDetails} from '../lib/platform/platformV2RichContent';
import {wordFormDetail} from '../components/practice/article/wordDetailsPresentation';
import {orderedConjugationPersons} from '../lib/dictionary/conjugationPresentation';

type RecordValue=Record<string,unknown>;
function record(value:unknown):RecordValue{return value&&typeof value==='object'&&!Array.isArray(value)?value as RecordValue:{};}
function jsonbOrder(value:unknown):unknown{
 if(Array.isArray(value))return value.map(jsonbOrder);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(record(value)).sort(([a],[b])=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b))).map(([key,item])=>[key,jsonbOrder(item)]));
 return value;
}
const directory=process.argv[2];
if(!directory)throw new Error('Provide the dictionary words_content directory.');
const counts={entries:0,conjugation:0,subordinateRows:0,emptyPerfect:0,orderFailures:0,valueFailures:0};
const structures=new Map<string,number>();
for(const file of readdirSync(directory).filter(name=>name.endsWith('.json'))){
 const document:unknown=JSON.parse(readFileSync(resolve(directory,file),'utf8'));
 for(const value of Array.isArray(document)?document:[document]){
  const raw=record(value);counts.entries++;
  const table=record(raw.conjugation_table);if(!Object.keys(table).length)continue;
  counts.conjugation++;
  const sourcePersons=[...new Set([...Object.keys(record(table.present)),...Object.keys(record(table.past))])];
  if(sourcePersons.some(key=>key.startsWith('dat_')))counts.subordinateRows++;
  if(!Object.keys(record(table.perfect)).length)counts.emptyPerfect++;
  const structure=JSON.stringify(Object.fromEntries(Object.entries(table).map(([tense,forms])=>[tense,Object.keys(record(forms))])));
  structures.set(structure,(structures.get(structure)??0)+1);
  const details=projectPlatformV2WordDetails({id:file,headword:String(raw.headword??file),raw:jsonbOrder(raw)},[]);
  const detail=wordFormDetail(details??undefined,'ww');
  if(!detail)throw new Error(`Missing projected forms in ${file}`);
  const actual=orderedConjugationPersons([...Object.keys(detail.conjugation.present??{}),...Object.keys(detail.conjugation.past??{})],'nl');
  if(JSON.stringify(actual)!==JSON.stringify(sourcePersons))counts.orderFailures++;
  for(const [tense,forms] of Object.entries(table))for(const [person,text] of Object.entries(record(forms)))
   if(detail.conjugation[tense]?.[person]!==text)counts.valueFailures++;
 }
}
console.log(JSON.stringify({directory:resolve(directory),counts,structures:Object.fromEntries(structures)},null,2));
if(counts.orderFailures||counts.valueFailures)process.exitCode=1;
