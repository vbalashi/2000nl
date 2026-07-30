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
