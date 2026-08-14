import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

type PresentationIdentity = {
  entries: Array<{
    entryId: string;
    headwordGroupId: string;
    meaningOrdinal: number;
    contentNodeBindings: unknown[];
  }>;
};

async function bindSourceEntries(
  client: PoolClient,
  entryIds: string[],
  groupKey = `private-source-group-${randomUUID()}`,
) {
  const identitySchemeVersion = `platform-v2-test-${randomUUID()}`;
  const { rows: dictionaryRows } = await client.query(
    `select dictionary_id from word_entries where id = $1`,
    [entryIds[0]],
  );
  const dictionaryId = dictionaryRows[0].dictionary_id as string;
  const { rows: runRows } = await client.query(
    `insert into private.dictionary_import_runs (
       dictionary_id,
       identity_scheme_version,
       artifact_format_version,
       manifest_checksum,
       input_checksum,
       source_record_count,
       artifact_count,
       status
     )
     values ($1, $2, 'test-v1', $3, $4, $5, $5, 'completed')
     returning id`,
    [
      dictionaryId,
      identitySchemeVersion,
      randomUUID(),
      randomUUID(),
      entryIds.length,
    ],
  );
  const importRunId = runRows[0].id as string;

  for (const [index, entryId] of entryIds.entries()) {
    await client.query(
      `insert into private.source_entry_bindings (
         dictionary_id,
         identity_scheme_version,
         source_entry_key,
         source_group_key,
         sense_ordinal,
         word_entry_id,
         binding_state,
         first_seen_run_id,
         last_seen_run_id,
         manifest_checksum,
         content_fingerprint_version,
         content_fingerprint,
         identity_evidence,
         reconciliation_decision
       )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         'active',
         $7,
         $7,
         'test-manifest',
         'test-v1',
         $8,
         '{"kind":"test"}'::jsonb,
         '{"decision":"create"}'::jsonb
       )`,
      [
        dictionaryId,
        identitySchemeVersion,
        `source-entry-${index + 1}-${randomUUID()}`,
        groupKey,
        index + 1,
        entryId,
        importRunId,
        `fingerprint-${index + 1}`,
      ],
    );
  }

  return groupKey;
}

describeIfDb("Platform V2 presentation identity read boundary", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("stores source, policy, and provider revisions separately for translations", async () => {
    const { rows } = await pool.query(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'word_entry_translations'
          and column_name = any($1::text[])
        order by column_name`,
      [
        [
          "provider_revision",
          "source_content_revision",
          "translation_policy_version",
        ],
      ],
    );

    expect(rows.map((row) => row.column_name)).toEqual([
      "provider_revision",
      "source_content_revision",
      "translation_policy_version",
    ]);
  });

  test("exposes only stable lookup wrappers to service roles", async () => {
    const { rows } = await pool.query(
      `select
         has_function_privilege(
           'anon',
           'private.lookup_platform_v2_entries_base_v1(uuid,boolean,text,text,text,integer,integer)',
           'EXECUTE'
         ) as anon_lookup_base,
         has_function_privilege(
           'authenticated',
           'private.lookup_platform_v2_entries_base_v1(uuid,boolean,text,text,text,integer,integer)',
           'EXECUTE'
         ) as authenticated_lookup_base,
         has_function_privilege(
           'service_role',
           'private.lookup_platform_v2_entries_base_v1(uuid,boolean,text,text,text,integer,integer)',
           'EXECUTE'
         ) as service_lookup_base,
         has_function_privilege(
           'service_role',
           'private.read_platform_v2_training_group_base_v1(uuid,uuid,integer)',
           'EXECUTE'
         ) as service_training_base,
         has_function_privilege(
           'service_role',
           'private.attach_platform_v2_presentation_identity_v1(jsonb,uuid,boolean)',
           'EXECUTE'
         ) as service_identity_helper,
         has_function_privilege(
           'service_role',
           'public.lookup_platform_v2_entries(uuid,boolean,text,text,text,integer,integer)',
           'EXECUTE'
         ) as service_lookup_wrapper,
         has_function_privilege(
           'service_role',
           'public.read_platform_v2_training_group(uuid,uuid,integer)',
           'EXECUTE'
         ) as service_training_wrapper`,
    );

    expect(rows).toEqual([
      {
        anon_lookup_base: false,
        authenticated_lookup_base: false,
        service_lookup_base: false,
        service_training_base: false,
        service_identity_helper: false,
        service_lookup_wrapper: true,
        service_training_wrapper: true,
      },
    ]);
  });

  test("returns one opaque Headword Group for entries in one source group", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const firstEntryId = await insertWord(
        client,
        `platform-v2-source-group-a-${Date.now()}`,
      );
      const secondEntryId = await insertWord(
        client,
        `platform-v2-source-group-b-${Date.now()}`,
      );
      const groupKey = await bindSourceEntries(client, [
        firstEntryId,
        secondEntryId,
      ]);

      const { rows } = await client.query(
        `select read_platform_v2_presentation_identity(
           $1,
           ARRAY[$2, $3]::uuid[],
           false
         ) as identity`,
        [userId, firstEntryId, secondEntryId],
      );
      const identity = rows[0].identity as PresentationIdentity;

      expect(identity.entries).toHaveLength(2);
      expect(
        new Set(identity.entries.map((entry) => entry.headwordGroupId)).size,
      ).toBe(1);
      expect(identity.entries.map((entry) => entry.meaningOrdinal)).toEqual([
        1, 2,
      ]);
      expect(JSON.stringify(identity)).not.toContain(groupKey);
    }, userId);
  });

  test("reads a complete source training group directly by scheduled entry", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const firstEntryId = await insertWord(
        client,
        `platform-v2-training-group-a-${Date.now()}`,
      );
      const secondEntryId = await insertWord(
        client,
        `platform-v2-training-group-b-${Date.now()}`,
      );
      await bindSourceEntries(client, [firstEntryId, secondEntryId]);

      const privileges = await client.query(
        `select
           has_function_privilege(
             'authenticated',
             'public.read_platform_v2_training_group(uuid,uuid,integer)',
             'EXECUTE'
           ) as authenticated_execute,
           has_function_privilege(
             'service_role',
             'public.read_platform_v2_training_group(uuid,uuid,integer)',
             'EXECUTE'
           ) as service_execute`,
      );
      expect(privileges.rows).toEqual([
        { authenticated_execute: false, service_execute: true },
      ]);

      await client.query("set local role service_role");
      const { rows } = await client.query(
        `select read_platform_v2_training_group($1, $2, 50) as result`,
        [userId, firstEntryId],
      );
      expect(rows[0].result.error).toBeUndefined();
      expect(
        rows[0].result.items.map((item: { id: string }) => item.id),
      ).toEqual([firstEntryId, secondEntryId]);
      expect(
        rows[0].result.items.map(
          (item: {
            platform_v2_identity: {
              entryId: string;
              headwordGroupId: string;
              contentNodeBindings: unknown[];
            };
          }) => item.platform_v2_identity,
        ),
      ).toEqual([
        expect.objectContaining({
          entryId: firstEntryId,
          headwordGroupId: expect.any(String),
          contentNodeBindings: [],
        }),
        expect.objectContaining({
          entryId: secondEntryId,
          headwordGroupId: expect.any(String),
          contentNodeBindings: [],
        }),
      ]);
    }, userId);
  });

  test("keeps a direct user training group private and singleton", async () => {
    const ownerId = randomUUID();
    const otherUserId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherUserId);
      const { rows: createRows } = await client.query(
        `select create_user_dictionary_entry(
           $1,
           NULL,
           jsonb_build_object(
             'headword', $2::text,
             'languageCode', 'nl',
             'definition', 'private definition'
           )
         ) as entry_id`,
        [ownerId, `platform-v2-training-private-${Date.now()}`],
      );
      const entryId = createRows[0].entry_id as string;

      await client.query("set local role service_role");
      const ownerRead = await client.query(
        `select read_platform_v2_training_group($1, $2, 50) as result`,
        [ownerId, entryId],
      );
      expect(ownerRead.rows[0].result.items).toHaveLength(1);
      expect(ownerRead.rows[0].result.items[0].id).toBe(entryId);

      const foreignRead = await client.query(
        `select read_platform_v2_training_group($1, $2, 50) as result`,
        [otherUserId, entryId],
      );
      expect(foreignRead.rows[0].result).toEqual({
        error: "entry_not_accessible",
      });
    }, ownerId);
  });

  test("preserves Content Node IDs through reorder and source-native text edits", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const entryId = await insertWord(
        client,
        `platform-v2-content-nodes-${Date.now()}`,
      );
      await bindSourceEntries(client, [entryId]);

      await client.query(
        `select private.reconcile_platform_v2_content_nodes(
           $1,
           'revision-1',
           $2::jsonb
         )`,
        [
          entryId,
          JSON.stringify([
            {
              inputKey: "definition",
              kind: "definition",
              sourcePath: "meanings[0].definition",
              sourceNativeKey: "definition:primary",
              sourceTextFingerprint: "definition-v1",
            },
            {
              inputKey: "example",
              kind: "example",
              sourcePath: "meanings[0].examples[0]",
              sourceTextFingerprint: "example-stable",
            },
          ]),
        ],
      );

      const firstRead = await client.query(
        `select read_platform_v2_presentation_identity(
           $1,
           ARRAY[$2]::uuid[],
           false
         ) as identity`,
        [userId, entryId],
      );
      const firstBindings = (
        firstRead.rows[0].identity as PresentationIdentity
      ).entries[0].contentNodeBindings as Array<{
        contentNodeId: string;
        kind: string;
        sourcePath: string;
        sourceTextFingerprint: string;
      }>;

      await client.query(
        `select private.reconcile_platform_v2_content_nodes(
           $1,
           'revision-2',
           $2::jsonb
         )`,
        [
          entryId,
          JSON.stringify([
            {
              inputKey: "example",
              kind: "example",
              sourcePath: "meanings[0].examples[1]",
              sourceTextFingerprint: "example-stable",
            },
            {
              inputKey: "definition",
              kind: "definition",
              sourcePath: "meanings[0].definition",
              sourceNativeKey: "definition:primary",
              sourceTextFingerprint: "definition-v2",
            },
          ]),
        ],
      );

      const secondRead = await client.query(
        `select read_platform_v2_presentation_identity(
           $1,
           ARRAY[$2]::uuid[],
           false
         ) as identity`,
        [userId, entryId],
      );
      const secondBindings = (
        secondRead.rows[0].identity as PresentationIdentity
      ).entries[0].contentNodeBindings as typeof firstBindings;
      const firstByKind = new Map(
        firstBindings.map((binding) => [binding.kind, binding]),
      );
      const secondByKind = new Map(
        secondBindings.map((binding) => [binding.kind, binding]),
      );

      expect(secondByKind.get("definition")?.contentNodeId).toBe(
        firstByKind.get("definition")?.contentNodeId,
      );
      expect(secondByKind.get("definition")?.sourceTextFingerprint).toBe(
        "definition-v2",
      );
      expect(secondByKind.get("example")?.contentNodeId).toBe(
        firstByKind.get("example")?.contentNodeId,
      );
      expect(secondByKind.get("example")?.sourcePath).toBe(
        "meanings[0].examples[1]",
      );
    }, userId);
  });

  test("clears a preserved Content Node parent when the source reparents it to the root", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const entryId = await insertWord(
        client,
        `platform-v2-reparent-root-${Date.now()}`,
      );
      await bindSourceEntries(client, [entryId]);

      const { rows: firstRows } = await client.query(
        `select private.reconcile_platform_v2_content_nodes(
           $1,
           'revision-1',
           $2::jsonb
         ) as result`,
        [
          entryId,
          JSON.stringify([
            {
              inputKey: "idiom",
              kind: "idiom",
              sourcePath: "meanings[0].idioms[0]",
              sourceNativeKey: "idiom:primary",
              sourceTextFingerprint: "idiom-v1",
            },
            {
              inputKey: "explanation",
              kind: "idiom-explanation",
              sourcePath: "meanings[0].idioms[0].explanation",
              sourceNativeKey: "idiom:primary:explanation",
              sourceTextFingerprint: "explanation-v1",
              parentInputKey: "idiom",
            },
          ]),
        ],
      );
      const explanationId = firstRows[0].result.nodes.find(
        (node: { inputKey: string }) => node.inputKey === "explanation",
      ).contentNodeId as string;

      await client.query(
        `select private.reconcile_platform_v2_content_nodes(
           $1,
           'revision-2',
           $2::jsonb
         )`,
        [
          entryId,
          JSON.stringify([
            {
              inputKey: "idiom",
              kind: "idiom",
              sourcePath: "meanings[0].idioms[0]",
              sourceNativeKey: "idiom:primary",
              sourceTextFingerprint: "idiom-v1",
            },
            {
              inputKey: "explanation",
              kind: "idiom-explanation",
              sourcePath: "meanings[0].idioms[0].explanation",
              sourceNativeKey: "idiom:primary:explanation",
              sourceTextFingerprint: "explanation-v1",
            },
          ]),
        ],
      );

      const { rows } = await client.query(
        `select id, parent_content_node_id
           from private.platform_v2_content_nodes
          where id = $1`,
        [explanationId],
      );
      expect(rows).toEqual([
        {
          id: explanationId,
          parent_content_node_id: null,
        },
      ]);
    }, userId);
  });

  test("does not pair indistinguishable duplicate nodes by array position", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const entryId = await insertWord(
        client,
        `platform-v2-ambiguous-nodes-${Date.now()}`,
      );
      await bindSourceEntries(client, [entryId]);
      const duplicateNodes = (prefix: string) => [
        {
          inputKey: `${prefix}-a`,
          kind: "example",
          sourcePath: `meanings[0].examples[0]`,
          sourceTextFingerprint: "indistinguishable-example",
        },
        {
          inputKey: `${prefix}-b`,
          kind: "example",
          sourcePath: `meanings[0].examples[1]`,
          sourceTextFingerprint: "indistinguishable-example",
        },
      ];

      const { rows: firstRows } = await client.query(
        `select private.reconcile_platform_v2_content_nodes(
           $1,
           'revision-1',
           $2::jsonb
         ) as result`,
        [entryId, JSON.stringify(duplicateNodes("first"))],
      );
      const firstIds = new Set<string>(
        firstRows[0].result.nodes.map(
          (node: { contentNodeId: string }) => node.contentNodeId,
        ),
      );

      const { rows: secondRows } = await client.query(
        `select private.reconcile_platform_v2_content_nodes(
           $1,
           'revision-2',
           $2::jsonb
         ) as result`,
        [entryId, JSON.stringify(duplicateNodes("second").reverse())],
      );
      const secondIds = new Set<string>(
        secondRows[0].result.nodes.map(
          (node: { contentNodeId: string }) => node.contentNodeId,
        ),
      );

      expect(firstIds).toHaveLength(2);
      expect(secondIds).toHaveLength(2);
      expect([...secondIds].every((nodeId) => !firstIds.has(nodeId))).toBe(
        true,
      );

      const { rows: stateRows } = await client.query(
        `select binding_state, count(*)::int as count
         from private.platform_v2_content_nodes
         where entry_id = $1
         group by binding_state
         order by binding_state`,
        [entryId],
      );
      expect(stateRows).toEqual([
        { binding_state: "active", count: 2 },
        { binding_state: "retired", count: 2 },
      ]);
    }, userId);
  });

  test("paginates complete Headword Groups with a query-bound opaque cursor", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const suffix = randomUUID();
      const firstEntryId = await insertWord(
        client,
        `platform-v2-page-first-${suffix}`,
      );
      const firstSiblingId = await insertWord(
        client,
        `platform-v2-page-first-sibling-${suffix}`,
      );
      const secondEntryId = await insertWord(
        client,
        `platform-v2-page-second-${suffix}`,
      );
      const thirdEntryId = await insertWord(
        client,
        `platform-v2-page-third-${suffix}`,
      );
      await bindSourceEntries(
        client,
        [firstEntryId, firstSiblingId],
        `platform-v2-page-group-first-${suffix}`,
      );
      await bindSourceEntries(
        client,
        [secondEntryId],
        `platform-v2-page-group-second-${suffix}`,
      );
      await bindSourceEntries(
        client,
        [thirdEntryId],
        `platform-v2-page-group-third-${suffix}`,
      );

      const { rows: dictionaryRows } = await client.query(
        `select dictionary_id
           from word_entries
          where id = $1`,
        [firstEntryId],
      );
      const dictionaryId = dictionaryRows[0].dictionary_id as string;
      const query = `platform-v2-form-${suffix}`;
      for (const [entryId, headword] of [
        [firstEntryId, `platform-v2-page-first-${suffix}`],
        [secondEntryId, `platform-v2-page-second-${suffix}`],
        [thirdEntryId, `platform-v2-page-third-${suffix}`],
      ]) {
        await client.query(
          `insert into word_forms (
             language_code,
             dictionary_id,
             form,
             word_id,
             headword
           )
           values ('nl', $1, $2, $3, $4)`,
          [dictionaryId, query, entryId, headword],
        );
      }
      for (const entryId of [
        firstEntryId,
        firstSiblingId,
        secondEntryId,
        thirdEntryId,
      ]) {
        await client.query(
          `select refresh_dictionary_search_document($1, 2)`,
          [entryId],
        );
      }

      const { rows: firstRows } = await client.query(
        `select lookup_platform_v2_entries(
           $1,
           false,
           $2,
           'nl',
           NULL,
           2,
           50
         ) as result`,
        [userId, query],
      );
      const firstPage = firstRows[0].result as {
        items: Array<{
          id: string;
          platform_v2_identity: {
            entryId: string;
            headwordGroupId: string;
            contentNodeBindings: unknown[];
          };
        }>;
        page: {
          selectedTierComplete: boolean;
          nextGroupCursor: string;
        };
      };
      expect(firstPage.items.map((entry) => entry.id)).toEqual(
        expect.arrayContaining([firstEntryId, firstSiblingId]),
      );
      expect(firstPage.items).toHaveLength(3);
      expect(
        firstPage.items.map((entry) => entry.platform_v2_identity.entryId),
      ).toEqual(firstPage.items.map((entry) => entry.id));
      expect(
        firstPage.items.every(
          (entry) =>
            typeof entry.platform_v2_identity.headwordGroupId === "string" &&
            Array.isArray(entry.platform_v2_identity.contentNodeBindings),
        ),
      ).toBe(true);
      expect(firstPage.page.selectedTierComplete).toBe(false);
      expect(firstPage.page.nextGroupCursor).toEqual(expect.any(String));

      const { rows: secondRows } = await client.query(
        `select lookup_platform_v2_entries(
           $1,
           false,
           $2,
           'nl',
           $3,
           2,
           50
         ) as result`,
        [userId, query, firstPage.page.nextGroupCursor],
      );
      const secondPage = secondRows[0].result as {
        items: Array<{ id: string }>;
        page: {
          selectedTierComplete: boolean;
          nextGroupCursor: string | null;
        };
      };
      expect(secondPage.items).toHaveLength(1);
      expect(
        firstPage.items.some(
          (firstEntry) =>
            firstEntry.id === secondPage.items[0].id,
        ),
      ).toBe(false);
      expect(secondPage.page).toEqual({
        selectedTierComplete: true,
        nextGroupCursor: null,
      });

      const { rows: wrongQueryRows } = await client.query(
        `select lookup_platform_v2_entries(
           $1,
           false,
           'another-query',
           'nl',
           $2,
           2,
           50
         ) as result`,
        [userId, firstPage.page.nextGroupCursor],
      );
      expect(wrongQueryRows[0].result).toEqual({
        error: "invalid_cursor",
      });

      const { rows: caseVariantRows } = await client.query(
        `select lookup_platform_v2_entries(
           $1,
           false,
           $2,
           'nl',
           $3,
           2,
           50
         ) as result`,
        [userId, query.toUpperCase(), firstPage.page.nextGroupCursor],
      );
      expect(caseVariantRows[0].result).toEqual({
        error: "invalid_cursor",
      });

      const { rows: otherPrincipalRows } = await client.query(
        `select lookup_platform_v2_entries(
           $1,
           false,
           $2,
           'nl',
           $3,
           2,
           50
         ) as result`,
        [randomUUID(), query, firstPage.page.nextGroupCursor],
      );
      expect(otherPrincipalRows[0].result).toEqual({
        error: "invalid_cursor",
      });

      const { rows: catalogPrincipalRows } = await client.query(
        `select lookup_platform_v2_entries(
           NULL,
           true,
           $1,
           'nl',
           $2,
           2,
           50
         ) as result`,
        [query, firstPage.page.nextGroupCursor],
      );
      expect(catalogPrincipalRows[0].result).toEqual({
        error: "invalid_cursor",
      });

      const { rows: otherLanguageRows } = await client.query(
        `select lookup_platform_v2_entries(
           $1,
           false,
           $2,
           'en',
           $3,
           2,
           50
         ) as result`,
        [userId, query, firstPage.page.nextGroupCursor],
      );
      expect(otherLanguageRows[0].result).toEqual({
        error: "invalid_cursor",
      });

      const { rows: oversizedRows } = await client.query(
        `select lookup_platform_v2_entries(
           $1,
           false,
           $2,
           'nl',
           NULL,
           2,
           1
         ) as result`,
        [userId, query],
      );
      expect(oversizedRows[0].result).toEqual(
        expect.objectContaining({
          error: "group-too-large",
          group: expect.objectContaining({
            entryCount: 2,
            safetyBound: 1,
          }),
        }),
      );
    }, userId);
  });

  test("unions a fresh private form with an indexed public collision", async () => {
    const userId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const suffix = randomUUID();
      const query = `platform-v2-mixed-form-${suffix}`;
      const publicEntryId = await insertWord(
        client,
        `platform-v2-public-form-${suffix}`,
      );
      await bindSourceEntries(client, [publicEntryId]);

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        userId,
      ]);
      const { rows: privateRows } = await client.query(
        `select create_user_dictionary_entry(
           $1,
           NULL,
           jsonb_build_object(
             'headword', $2::text,
             'languageCode', 'nl',
             'definition', 'private form definition'
           )
         ) as entry_id`,
        [userId, `platform-v2-private-form-${suffix}`],
      );
      const privateEntryId = privateRows[0].entry_id as string;
      const { rows: entryRows } = await client.query(
        `select id, dictionary_id, headword
           from word_entries
          where id = any($1::uuid[])`,
        [[publicEntryId, privateEntryId]],
      );
      for (const entry of entryRows) {
        await client.query(
          `insert into word_forms (
             language_code,
             dictionary_id,
             form,
             word_id,
             headword
           )
           values ('nl', $1, $2, $3, $4)`,
          [
            entry.dictionary_id,
            query,
            entry.id,
            entry.headword,
          ],
        );
      }
      await client.query(
        `select refresh_dictionary_search_document($1, 2)`,
        [publicEntryId],
      );

      const { rows } = await client.query(
        `select lookup_platform_v2_entries(
           $1,
           false,
           $2,
           'nl',
           NULL,
           10,
           50
         ) as result`,
        [userId, query],
      );
      const result = rows[0].result as {
        items: Array<{ id: string }>;
      };
      expect(result.items.map((entry) => entry.id)).toEqual(
        expect.arrayContaining([publicEntryId, privateEntryId]),
      );
      expect(result.items).toHaveLength(2);
    }, userId);
  });

  test("catalog lookup never exposes a public user dictionary", async () => {
    const ownerId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        ownerId,
      ]);
      const headword = `platform-v2-public-user-${randomUUID()}`;
      const { rows: createRows } = await client.query(
        `select create_user_dictionary_entry(
           $1,
           NULL,
           jsonb_build_object(
             'headword', $2::text,
             'languageCode', 'nl',
             'definition', 'must remain private to catalog'
           )
         ) as entry_id`,
        [ownerId, headword],
      );
      const entryId = createRows[0].entry_id as string;
      await client.query(
        `update dictionaries
            set visibility = 'public'
          where id = (
            select dictionary_id
              from word_entries
             where id = $1
          )`,
        [entryId],
      );
      await client.query(
        `select refresh_dictionary_search_document($1, 2)`,
        [entryId],
      );

      const { rows } = await client.query(
        `select lookup_platform_v2_entries(
           NULL,
           true,
           $1,
           'nl',
           NULL,
           10,
           50
         ) as result`,
        [headword],
      );
      expect(rows[0].result).toEqual({
        query: headword,
        items: [],
        page: {
          selectedTierComplete: true,
          nextGroupCursor: null,
        },
      });
    }, ownerId);
  });

  test("authenticated lookup never exposes another user's public or shared dictionary", async () => {
    const ownerId = randomUUID();
    const otherUserId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherUserId);
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        ownerId,
      ]);
      const headword = `platform-v2-cross-user-${randomUUID()}`;
      const { rows: createRows } = await client.query(
        `select create_user_dictionary_entry(
           $1,
           NULL,
           jsonb_build_object(
             'headword', $2::text,
             'languageCode', 'nl',
             'definition', 'owner-only definition'
           )
         ) as entry_id`,
        [ownerId, headword],
      );
      const entryId = createRows[0].entry_id as string;
      const { rows: dictionaryRows } = await client.query(
        `select dictionary_id
           from word_entries
          where id = $1`,
        [entryId],
      );
      const dictionaryId = dictionaryRows[0].dictionary_id as string;

      for (const visibility of ["public", "shared"]) {
        await client.query(
          `update dictionaries
              set visibility = $1
            where id = $2`,
          [visibility, dictionaryId],
        );

        const { rows: lookupRows } = await client.query(
          `select lookup_platform_v2_entries(
             $1,
             false,
             $2,
             'nl',
             NULL,
             10,
             50
           ) as result`,
          [otherUserId, headword],
        );
        expect(lookupRows[0].result).toEqual({
          query: headword,
          items: [],
          page: {
            selectedTierComplete: true,
            nextGroupCursor: null,
          },
        });

        await client.query(`savepoint cross_user_identity_check`);
        await expect(
          client.query(
            `select read_platform_v2_presentation_identity(
               $1,
               ARRAY[$2]::uuid[],
               false
             )`,
            [otherUserId, entryId],
          ),
        ).rejects.toThrow(/platform_v2_entry_not_accessible/);
        await client.query(`rollback to savepoint cross_user_identity_check`);
        await client.query(`release savepoint cross_user_identity_check`);
      }
    }, ownerId);
  });

  test("keeps user groups one-to-one, private, and stable across rename", async () => {
    const ownerId = randomUUID();
    const otherUserId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherUserId);

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        ownerId,
      ]);
      const { rows: firstCreateRows } = await client.query(
        `select create_user_dictionary_entry(
           $1,
           NULL,
           jsonb_build_object(
             'headword', $2::text,
             'languageCode', 'nl',
             'definition', 'owner definition'
           )
         ) as entry_id`,
        [ownerId, `platform-v2-private-${Date.now()}`],
      );
      const firstEntryId = firstCreateRows[0].entry_id as string;
      const firstRead = await client.query(
        `select read_platform_v2_presentation_identity(
           $1,
           ARRAY[$2]::uuid[],
           false
         ) as identity`,
        [ownerId, firstEntryId],
      );
      const originalGroupId = (
        firstRead.rows[0].identity as PresentationIdentity
      ).entries[0].headwordGroupId;
      const originalDefinition = (
        (firstRead.rows[0].identity as PresentationIdentity).entries[0]
          .contentNodeBindings as Array<{
          contentNodeId: string;
          kind: string;
          sourceTextFingerprint: string;
        }>
      ).find((binding) => binding.kind === "definition");
      expect(originalDefinition).toBeDefined();

      await client.query(
        `select update_user_dictionary_entry(
           $1,
           $2,
           jsonb_build_object(
             'headword', $3::text,
             'languageCode', 'nl',
             'definition', 'updated owner definition'
           )
         )`,
        [ownerId, firstEntryId, `platform-v2-renamed-${Date.now()}`],
      );
      const renamedRead = await client.query(
        `select read_platform_v2_presentation_identity(
           $1,
           ARRAY[$2]::uuid[],
           false
         ) as identity`,
        [ownerId, firstEntryId],
      );
      expect(
        (renamedRead.rows[0].identity as PresentationIdentity).entries[0]
          .headwordGroupId,
      ).toBe(originalGroupId);
      const updatedDefinition = (
        (renamedRead.rows[0].identity as PresentationIdentity).entries[0]
          .contentNodeBindings as Array<{
          contentNodeId: string;
          kind: string;
          sourceTextFingerprint: string;
        }>
      ).find((binding) => binding.kind === "definition");
      expect(updatedDefinition?.contentNodeId).toBe(
        originalDefinition?.contentNodeId,
      );
      expect(updatedDefinition?.sourceTextFingerprint).not.toBe(
        originalDefinition?.sourceTextFingerprint,
      );

      await client.query(`savepoint private_identity_check`);
      await expect(
        client.query(
          `select read_platform_v2_presentation_identity(
             $1,
             ARRAY[$2]::uuid[],
             false
           )`,
          [otherUserId, firstEntryId],
        ),
      ).rejects.toThrow(/platform_v2_entry_not_accessible/);
      await client.query(`rollback to savepoint private_identity_check`);
      await client.query(`release savepoint private_identity_check`);

      await client.query(`savepoint catalog_identity_check`);
      await expect(
        client.query(
          `select read_platform_v2_presentation_identity(
             NULL,
             ARRAY[$1]::uuid[],
             true
           )`,
          [firstEntryId],
        ),
      ).rejects.toThrow(/platform_v2_entry_not_accessible/);
      await client.query(`rollback to savepoint catalog_identity_check`);
      await client.query(`release savepoint catalog_identity_check`);

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        otherUserId,
      ]);
      const { rows: secondCreateRows } = await client.query(
        `select create_user_dictionary_entry(
           $1,
           NULL,
           jsonb_build_object(
             'headword', $2::text,
             'languageCode', 'nl',
             'definition', 'other definition'
           )
         ) as entry_id`,
        [otherUserId, `platform-v2-private-${Date.now()}`],
      );
      const secondRead = await client.query(
        `select read_platform_v2_presentation_identity(
           $1,
           ARRAY[$2]::uuid[],
           false
         ) as identity`,
        [otherUserId, secondCreateRows[0].entry_id],
      );
      expect(
        (secondRead.rows[0].identity as PresentationIdentity).entries[0]
          .headwordGroupId,
      ).not.toBe(originalGroupId);
    }, ownerId);
  });
});
