import { randomUUID } from "node:crypto";
import {platformV2HeaderEvidence,projectPlatformV2WordDetails,platformV2CrossReferenceQuery} from "../../lib/platform/platformV2RichContent";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  getDbUrl,
  runMigrations,
  withTransaction,
  ensureUserWithSettings,
} from "./dbTestUtils";

const url = getDbUrl();
const suite = url ? describe : describe.skip;
suite("portable owned entry content", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());
  const project = async (raw: unknown, note: string | null = null) =>
    withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        "select private.portable_owned_entry_content_v1($1,$2) value",
        [raw, note],
      );
      return rows[0].value;
    });

  test("retains all supported instructional details without source identities, URLs or provider diagnostics", async () => {
    const raw = {
      meanings: [
        {
          definition: "first",
          context: "pattern",
          examples: ["one", "two"],
          idioms: [
            {
              expression: "expression",
              explanation: "meaning",
              examples: ["idiom example"],
              privateUrl: "secret",
            },
          ],
          synonyms: ["same"],
          antonyms: ["opposite"],
          usage_labels: ["formal"],
          grammar: { countable: true },
          note: "usage addition",
          _source: { privateUrl: "secret" },
        },
        { definition: "second", examples: ["third"] },
      ],
      notes: "author note",
      plural: "forms",
      verb_forms: ["past", "perfect"],
      conjugation_table: { past: { ik: "was" } },
      alternate_headwords: [
        {
          headword: "variant",
          gender: "de",
          plural: "variants",
          sourceUrl: "secret",
        },
      ],
      audio_links: { tts: "https://private.invalid/secret" },
      sourceEntryId: "original-id",
      generation: { provider: "secret" },
      _metadata: { url: "secret" },
    };
    const copy = await project(raw, "my overlay");
    expect(copy.meanings).toHaveLength(2);
    expect(copy.meanings[0]).toMatchObject({
      definition: "first",
      examples: ["one", "two"],
      idioms: [
        {
          expression: "expression",
          explanation: "meaning",
          examples: ["idiom example"],
        },
      ],
    });
    expect(copy.notes).toBe("author note\n\nusage addition\n\nmy overlay");
    expect(copy.meanings[0]).not.toHaveProperty("note");
    expect(copy.plural).toBe("forms");
    expect(copy.verb_forms).toEqual(["past", "perfect"]);
    expect(copy.conjugation_table).toEqual(raw.conjugation_table);
    expect(copy.alternate_headwords).toEqual([
      { headword: "variant", gender: "de", plural: "variants" },
    ]);
    expect(JSON.stringify(copy)).not.toContain("secret");
    expect(copy).not.toHaveProperty("sourceEntryId");
  });

  test("copy preserves rendered V2 references/forms/header while replacing identity and stripping hidden reference metadata",async()=>{
    const raw={
      meanings:[{definition:"visible definition",examples:["example"],synonyms:["same"],antonyms:["different"],usage_labels:["formal"],grammar:{gender:"common"},pronunciation_note:"long vowel",
        cross_references:["another word",{headword:"related word",entryId:"HIDDEN_REFERENCE",url:"HIDDEN_URL",generation:{context:"HIDDEN_CONTEXT"}}]}],
      cross_reference:{headword:"base word",dictionaryId:"HIDDEN_DICTIONARY",sourceUrl:"HIDDEN_URL"},
      reference_tables:[{title:"Forms",provider:"HIDDEN_PROVIDER",rows:[{label:"past",value:"was",entryId:"HIDDEN_REFERENCE",url:"HIDDEN_URL"}]}],
      displayPronunciation:"ˈword",pronunciation:"word",source_identity:{homograph_number:3,sourceEntryId:"HIDDEN_ID"},
      plural:"words",alternate_headwords:[{headword:"variant",gender:"de",plural:"variants",url:"HIDDEN_URL"}],
    };
    const copy=await project(raw);
    const original={id:"original",headword:"word",raw},independent={id:"fresh-copy",headword:"word",raw:copy};
    expect(platformV2HeaderEvidence(independent)).toEqual(platformV2HeaderEvidence(original));
    expect(platformV2CrossReferenceQuery(independent)).toBe(platformV2CrossReferenceQuery(original));
    const before=projectPlatformV2WordDetails(original,[])!,after=projectPlatformV2WordDetails(independent,[])!;
    for(const field of ["references","forms","lexicalRelations","grammarNotes","pronunciationNotes"] as const){
      expect(after[field].map(item=>item.text)).toEqual(before[field].map(item=>item.text));
    }
    expect(after.references.map(item=>item.referenceId)).not.toEqual(before.references.map(item=>item.referenceId));
    expect(copy.meanings[0].cross_references).toEqual(["another word",{headword:"related word"}]);
    expect(copy.reference_tables).toEqual([{title:"Forms",rows:[{label:"past",value:"was"}]}]);
    expect(copy.homograph_number).toBe(3);expect(copy).not.toHaveProperty("source_identity");
    expect(JSON.stringify(copy)).not.toContain("HIDDEN_");
    expect(await project(copy)).toEqual(copy);
  });
  test.each([
    {cross_reference:42},
    {reference_tables:"not a table"},
    {meanings:[{definition:"definition",cross_references:"not a list"}]},
    {displayPronunciation:{source:"hidden"}},
  ])("invalid visible reference/header container fails explicitly:%j",async fields=>{
    await expect(project({meanings:[{definition:"definition"}],...fields})).rejects.toThrow("copy_content_invalid");
  });
  test.each([
    {source_identity:{homograph_number:null},_source:{homograph_number:4},homograph_number:7},
    {source_identity:{homograph_number:"hidden invalid"},_source:{homograph_number:4}},
    {source_identity:{homograph_number:2.5},homograph_number:7},
    {homograph_number:0},
  ])("copied homograph follows the real header's null/fallback rules:%j",async fields=>{
    const raw={meanings:[{definition:"definition"}],...fields},copy=await project(raw);
    expect(platformV2HeaderEvidence({id:"copy",headword:"word",raw:copy})).toEqual(platformV2HeaderEvidence({id:"source",headword:"word",raw}));
  });
  test("reference text obeys copy limits instead of truncating",async()=>{
    await expect(project({meanings:[{definition:"definition",cross_references:[{headword:"x".repeat(16385)}]}]})).rejects.toThrow("copy_content_too_large");
  });

  test("excessively nested reference content fails with a copy-specific bounded error",async()=>{
    let references:unknown=["word"];for(let i=0;i<15;i++)references=[references];
    await expect(project({meanings:[{definition:"definition",cross_references:references}]})).rejects.toThrow("copy_content_too_large");
  });

  test("legacy note-as-definition appears once; distinct authorized overlays with the same text survive", async () => {
    const copy = await project(
      { notes: "standalone explanation" },
      "standalone explanation",
    );
    expect(copy.meanings).toEqual([{ definition: "standalone explanation" }]);
    expect(copy.notes).toBe("standalone explanation");
    const equalNotes = await project(
      { definition: "word meaning", notes: "same" },
      "same",
    );
    expect(equalNotes.notes).toBe("same\n\nsame");
  });

  test("rejects unsupported assets, malformed content and overflow instead of truncating", async () => {
    await expect(
      project({
        definition: "word",
        images: ["https://private.invalid/asset"],
      }),
    ).rejects.toThrow("copy_asset_snapshot_unsupported");
    await expect(project({ definition: "x".repeat(1048577) })).rejects.toThrow(
      "copy_content_too_large",
    );
    await expect(
      project({
        meanings: [
          {
            definition: "word",
            examples: [{ source: "not the supported shape" }],
          },
        ],
      }),
    ).rejects.toThrow();
    await expect(
      project({ definition: "word", notes: { secret: "hidden" } }),
    ).rejects.toThrow("copy_content_invalid");
    await expect(
      project({ definition: "word", plural: { secret: "hidden" } }),
    ).rejects.toThrow("copy_content_invalid");
    await expect(
      project({ definition: "word", images: { url: "hidden" } }),
    ).rejects.toThrow("copy_content_invalid");
    await expect(
      project({
        definition: "word",
        example: { source: "sentence", translation: { secret: "hidden" } },
      }),
    ).rejects.toThrow("copy_content_invalid");
    await expect(project({ cross_reference: "other word" })).rejects.toThrow(
      "copy_content_unsupported",
    );
  });

  test("rich create and ordinary edits preserve all values and bind owned notes once", async () => {
    const owner = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, owner);
        await client.query("set local role authenticated");
        const payload = {
          headword: "rijk",
          languageCode: "nl",
          meanings: [
            { definition: "first", examples: ["example"] },
            { definition: "second" },
          ],
          notes: "owned note",
        };
        const id = (
          await client.query(
            "select create_user_dictionary_entry($1,null,$2) id",
            [owner, payload],
          )
        ).rows[0].id;
        await client.query("select update_user_dictionary_entry($1,$2,$3)", [
          owner,
          id,
          {
            headword: "rijk edited",
            languageCode: "nl",
            notes: "changed note",
          },
        ]);
        await client.query("reset role");
        const raw = (
          await client.query("select raw from word_entries where id=$1", [id])
        ).rows[0].raw;
        expect(raw.meanings).toEqual(payload.meanings);
        expect(raw.notes).toBe("changed note");
        const nodes = (
          await client.query(
            "select private.platform_v2_user_entry_content_nodes($1) nodes",
            [raw],
          )
        ).rows[0].nodes;
        expect(
          nodes.map((node: { sourcePath: string }) => node.sourcePath),
        ).toEqual([
          "raw.meanings[0].definition",
          "raw.meanings[0].examples[0]",
          "raw.meanings[1].definition",
          "raw.notes",
        ]);
      },
      owner,
    );
  });

  test("valid rich idiom-only articles do not acquire a fabricated definition", async () => {
    await withTransaction(pool, async (client) => {
      const raw = (
        await client.query(
          "select validate_user_entry_v1_payload($1,'nl') raw",
          [
            {
              headword: "uitdrukking",
              languageCode: "nl",
              meanings: [
                {
                  idioms: [
                    { expression: "aan de slag", explanation: "beginnen" },
                  ],
                },
              ],
            },
          ],
        )
      ).rows[0].raw;
      expect(raw).not.toHaveProperty("definition");
      expect(JSON.stringify(raw)).not.toContain("__rich_content_validation__");
      expect(raw.meanings[0].idioms[0].expression).toBe("aan de slag");
    });
  });

  test("hybrid translation-only arrays retain the root definition and example visible in legacy sources", async () => {
    const copy = await project(
      {
        definition: "visible legacy definition",
        example: {
          source: "visible example",
          translation: "translated example",
        },
        meanings: [{ translations: { en: "word" } }],
      },
      "overlay",
    );
    expect(copy.meanings).toEqual([
      {
        definition: "visible legacy definition",
        examples: ["visible example"],
        translations: { en: "word" },
      },
    ]);
    expect(copy.example).toEqual({
      source: "visible example",
      translation: "translated example",
    });
    expect(copy.notes).toBe("overlay");
    const ordinary = await project({
      definition: "unused legacy fallback",
      meanings: [{ definition: "real rich definition" }],
    });
    expect(ordinary.meanings[0].definition).toBe("real rich definition");
    const legacy = await project({
      definition: "definition",
      example: { source: "example", translation: "example translation" },
      translation: { languageCode: "en", text: "meaning translation" },
    });
    const recopied = await project(legacy);
    expect(recopied.example).toEqual(legacy.example);
    expect(recopied.translation).toEqual(legacy.translation);
    expect(recopied.meanings).toEqual(legacy.meanings);
  });

  test("blank-only rich content cannot create an empty independent article", async () => {
    await expect(
      project({ meanings: [{ definition: "   ", examples: [" "] }] }),
    ).rejects.toThrow("copy_content_unsupported");
    await expect(
      project({ meanings: [{ translations: { en: "   " } }] }),
    ).rejects.toThrow("copy_content_unsupported");
  });

  test("source-aware note fallback preserves curated definitions without turning owned notes into definitions", async () => {
    await withTransaction(pool, async (c) => {
      const raw = {
        notes: "legacy note definition",
        example: { source: "legacy example" },
        meanings: [{ translations: { en: "word" }, note: "   " }],
      };
      const curated = (
        await c.query(
          "select private.copy_source_content_v1($1,null,'curated') value",
          [raw],
        )
      ).rows[0].value;
      expect(curated.meanings[0].definition).toBe("legacy note definition");
      expect(curated.meanings[0].examples).toEqual(["legacy example"]);
      expect(curated.notes?.trim() ?? "").toBe("");
      const owned = (
        await c.query(
          "select private.copy_source_content_v1($1,null,'user') value",
          [
            {
              notes: "owned note",
              meanings: [{ translations: { en: "word" } }],
            },
          ],
        )
      ).rows[0].value;
      expect(owned.meanings[0]).not.toHaveProperty("definition");
      expect(owned.notes).toBe("owned note");
      const blank = await project({
        definition: "visible fallback",
        meanings: [{ translations: { en: "word" }, note: "   " }],
      });
      expect(blank.meanings[0].definition).toBe("visible fallback");
    });
  });

  test("implementation helpers are closed to every API role", async () => {
    await withTransaction(pool, async (client) => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const { rows } = await client.query(
          "select has_function_privilege($1,'private.portable_owned_entry_content_v1(jsonb,text)','execute') allowed",
          [role],
        );
        expect(rows[0].allowed).toBe(false);
      }
    });
  });
});
