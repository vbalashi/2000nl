/** Local deterministic preview fixture; no provider requests or production connection. */
import pg from "pg";
import {dictionaryMeaningTranslationIdentity} from "../../lib/translation/dictionaryMeaningTranslationIdentity";
import {buildDictionaryMeaningTranslationArtifact} from "../../lib/translation/dictionaryMeaningTranslationArtifact";
import {dictionaryMeaningTranslationCoverage} from "../../lib/translation/dictionaryMeaningTranslationReadiness";

const database = new pg.Client({connectionString:"postgresql://postgres:postgres@127.0.0.1:54322/postgres"});
await database.connect();
try {
  const result = await database.query("select public.dictionary_translation_source_v1(id) as source from public.word_entries where headword in ('huis','fiets') and raw->'_metadata'->>'fixture' = 'true'");
  if (result.rows.length !== 2) throw new Error("Expected the local huis and fiets fixtures");
  for (const row of result.rows) {
  const word = row.source.word;
  for (const language of ["ru","en"]) {
    const identity = await dictionaryMeaningTranslationIdentity({wordEntryId:word.id,word,dbLang:language,provider:"openai"});
    const values:Record<string,string> = language === "ru" ? {
      "Woning; gebouw om in te wonen.":"Жилище; здание, в котором живут.",
      "Voertuig met twee wielen en trappers.":"Транспортное средство с двумя колёсами и педалями.",
      "mijn fiets staat buiten":"Мой велосипед стоит на улице.",
      "dit testhuis staat naast het station":"Этот учебный дом находится рядом со станцией.",
    } : {
      "Woning; gebouw om in te wonen.":"A home; a building to live in.",
      "Voertuig met twee wielen en trappers.":"A vehicle with two wheels and pedals.",
      "mijn fiets staat buiten":"My bicycle is outside.",
      "dit testhuis staat naast het station":"This test house is next to the station.",
    };
    const headword = word.headword === "huis" ? (language === "ru" ? "дом" : "house") : (language === "ru" ? "велосипед" : "bicycle");
    const overlay = buildDictionaryMeaningTranslationArtifact({entryTranslation:{primaryText:headword,alternativeTexts:word.headword === "huis" ? (language === "ru" ? ["жилище"] : ["home"]) : [],baseText:headword,note:null},contentTranslations:identity.request.content.map(field=>{
      if (!values[field.text]) throw new Error(`Unmapped fixture text: ${field.fieldId}`);
      return {fieldId:field.fieldId,text:values[field.text]};
    })});
    if (!dictionaryMeaningTranslationCoverage(identity.request,overlay).requestComplete) throw new Error("Incomplete fixture");
    await database.query(`insert into public.word_entry_translations(word_entry_id,target_lang,provider,status,overlay,source_fingerprint,source_content_revision,translation_policy_version,provider_revision) values($1,$2,'openai','ready',$3,$4,$5,$6,$7) on conflict(word_entry_id,target_lang,provider) do update set status='ready',overlay=excluded.overlay,source_fingerprint=excluded.source_fingerprint,source_content_revision=excluded.source_content_revision,translation_policy_version=excluded.translation_policy_version,provider_revision=excluded.provider_revision,error_message=null,updated_at=now()`,[word.id,language,overlay,identity.fingerprint,identity.sourceContentRevision,identity.policyVersion,identity.providerRevision]);
    console.log(`Ready local ${word.headword} fixture: ${language}, ${identity.request.content.length} fields`);
  }
  }
} finally { await database.end(); }
