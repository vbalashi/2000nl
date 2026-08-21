import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  ensureUserWithSettings,
  getDbUrl,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

type ReportAttestation = {
  contentRevision: string;
  cardContent: {
    atoms: Array<{
      role: string;
      contentNodeId: string | null;
      text: string;
      truncated: boolean;
    }>;
    omittedAtomCount: number;
  };
};

async function createPrivateEntry(
  client: PoolClient,
  userId: string,
  headword: string,
) {
  await ensureUserWithSettings(client, userId);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
    userId,
  ]);
  const { rows } = await client.query(
    `select create_user_dictionary_entry(
       $1,
       null,
       jsonb_build_object(
         'headword', $2::text,
         'languageCode', 'nl',
         'definition', 'initial definition'
       )
     ) entry_id`,
    [userId, headword],
  );
  return rows[0].entry_id as string;
}

async function reconcile(
  client: PoolClient,
  entryId: string,
  revision: string,
  nodes: Array<Record<string, unknown>>,
) {
  await client.query("reset role");
  await client.query(
    `select private.reconcile_platform_v2_content_nodes($1, $2, $3::jsonb)`,
    [entryId, revision, JSON.stringify(nodes)],
  );
}

async function attest(
  client: PoolClient,
  userId: string,
  entryId: string,
) {
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("set local role service_role");
  const { rows } = await client.query(
    `select public.read_platform_v2_report_atom_attestation($1, $2) result`,
    [userId, entryId],
  );
  return rows[0].result as ReportAttestation;
}

async function expectQueryError(
  client: PoolClient,
  query: () => Promise<unknown>,
  pattern: RegExp,
) {
  await client.query("savepoint expected_report_atom_error");
  try {
    await expect(query()).rejects.toThrow(pattern);
  } finally {
    await client.query("rollback to savepoint expected_report_atom_error");
    await client.query("release savepoint expected_report_atom_error");
  }
}

function node(
  inputKey: string,
  kind: string,
  sourcePath: string,
  sourceText: string,
  extras: Record<string, unknown> = {},
) {
  return {
    inputKey,
    kind,
    sourcePath,
    sourceTextFingerprint: `${kind}-fingerprint-${inputKey}`,
    sourceText,
    ...extras,
  };
}

describeIfDb("Platform V2 bounded report atom attestation", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("reconstructs every source atom in report priority and idiom ownership order", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const entryId = await createPrivateEntry(
        client,
        userId,
        `report-atoms-${randomUUID()}`,
      );
      await reconcile(client, entryId, "report-revision-1", [
        node("standalone", "example", "raw.meanings[0].examples[0]", "Standalone"),
        node("idiom-example", "example", "raw.meanings[0].idioms[0].examples[0]", "Idiom example", {
          parentInputKey: "idiom",
        }),
        node("note", "usage-note", "raw.meanings[0].note", "Usage note"),
        node("definition", "definition", "raw.meanings[0].definition", "Definition"),
        node("idiom", "idiom", "raw.meanings[0].idioms[0]", "de kat uit de boom kijken"),
        node("pattern", "usage-pattern", "raw.meanings[0].context", "iemand kijkt iets uit"),
        node("explanation", "idiom-explanation", "raw.meanings[0].idioms[0].explanation", "Wait before acting", {
          parentInputKey: "idiom",
        }),
      ]);

      const result = await attest(client, userId, entryId);
      expect(result.contentRevision).toMatch(/^[0-9a-f]{64}$/);
      expect(result.cardContent.atoms.map(({ role, text }) => [role, text])).toEqual([
        ["headword", expect.stringMatching(/^report-atoms-/)],
        ["definition", "Definition"],
        ["usage-pattern", "iemand kijkt iets uit"],
        ["idiom", "de kat uit de boom kijken"],
        ["idiom-explanation", "Wait before acting"],
        ["example", "Idiom example"],
        ["example", "Standalone"],
        ["usage-note", "Usage note"],
      ]);
      expect(result.cardContent.omittedAtomCount).toBe(0);

      const verified = await client.query(
        `select public.verify_platform_v2_bounded_report_atoms_as_principal(
           $1, $2, $3, $4::jsonb
         ) result`,
        [userId, entryId, result.contentRevision, JSON.stringify(result.cardContent)],
      );
      expect(verified.rows[0].result).toBe(true);
      const identity = await client.query(
        `select public.read_platform_v2_presentation_identity(
           $1, ARRAY[$2]::uuid[], false
         ) result`,
        [userId, entryId],
      );
      expect(identity.rows[0].result.entries[0].reportContentRevision).toBe(
        result.contentRevision,
      );
    });
  });

  test("normalizes NFC and truncates at the 1500-scalar and 6000-byte boundary", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const entryId = await createPrivateEntry(client, userId, `unicode-${randomUUID()}`);
      await reconcile(client, entryId, "unicode-revision", [
        node(
          "definition",
          "definition",
          "raw.meanings[0].definition",
          "e\u0301".repeat(1501),
        ),
        node(
          "example",
          "example",
          "raw.meanings[0].examples[0]",
          "😀".repeat(1501),
        ),
      ]);

      const result = await attest(client, userId, entryId);
      const definition = result.cardContent.atoms.find(
        (atom) => atom.role === "definition",
      )!;
      const example = result.cardContent.atoms.find(
        (atom) => atom.role === "example",
      )!;
      expect([...definition.text]).toHaveLength(1500);
      expect(definition.text).toBe("é".repeat(1500));
      expect(Buffer.byteLength(definition.text)).toBe(3000);
      expect(definition.truncated).toBe(true);
      expect([...example.text]).toHaveLength(1500);
      expect(Buffer.byteLength(example.text)).toBe(6000);
      expect(example.truncated).toBe(true);
    });
  });

  test("clips to 32 atoms and records the exact omitted remainder", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const entryId = await createPrivateEntry(client, userId, `omitted-${randomUUID()}`);
      const nodes = Array.from({ length: 40 }, (_, index) =>
        node(
          `example-${index}`,
          "example",
          `raw.meanings[0].examples[${index}]`,
          `Example ${index}`,
        ),
      );
      await reconcile(client, entryId, "omitted-revision", nodes);

      const result = await attest(client, userId, entryId);
      expect(result.cardContent.atoms).toHaveLength(32);
      expect(result.cardContent.atoms[0].role).toBe("headword");
      expect(result.cardContent.atoms.at(-1)?.text).toBe("Example 30");
      expect(result.cardContent.omittedAtomCount).toBe(9);
    });
  });

  test("binds the report revision and projection to current source order", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const entryId = await createPrivateEntry(client, userId, `order-${randomUUID()}`);
      const firstNode = node(
        "first",
        "example",
        "raw.meanings[0].examples[0]",
        "First example",
        { sourceNativeKey: "example:first" },
      );
      const secondNode = node(
        "second",
        "example",
        "raw.meanings[0].examples[1]",
        "Second example",
        { sourceNativeKey: "example:second" },
      );
      await reconcile(client, entryId, "order-one", [firstNode, secondNode]);
      const first = await attest(client, userId, entryId);

      await reconcile(client, entryId, "order-two", [secondNode, firstNode]);
      const second = await attest(client, userId, entryId);

      expect(second.contentRevision).not.toBe(first.contentRevision);
      expect(
        second.cardContent.atoms
          .filter((atom) => atom.role === "example")
          .map((atom) => atom.text),
      ).toEqual(["Second example", "First example"]);
    });
  });

  test("stops before the 48 KiB card-content budget and counts every omitted atom", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const entryId = await createPrivateEntry(client, userId, `budget-${randomUUID()}`);
      const nodes = Array.from({ length: 12 }, (_, index) =>
        node(
          `example-${index}`,
          "example",
          `raw.meanings[0].examples[${index}]`,
          "😀".repeat(1500),
        ),
      );
      await reconcile(client, entryId, "budget-revision", nodes);

      const result = await attest(client, userId, entryId);
      expect(result.cardContent.atoms.length).toBeLessThan(13);
      expect(result.cardContent.omittedAtomCount).toBe(
        13 - result.cardContent.atoms.length,
      );
      expect(
        Buffer.byteLength(JSON.stringify(result.cardContent), "utf8"),
      ).toBeLessThanOrEqual(48 * 1024);
    });
  });

  test("keeps legacy nodes without exact canonical text fail-closed", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const entryId = await createPrivateEntry(client, userId, `legacy-${randomUUID()}`);
      await reconcile(client, entryId, "legacy-revision", [
        {
          inputKey: "definition",
          kind: "definition",
          sourcePath: "raw.unknown.path",
          sourceTextFingerprint: "legacy-fingerprint-only",
        },
      ]);

      await expectQueryError(
        client,
        () => attest(client, userId, entryId),
        /report_atom_projection_unverifiable/,
      );
    });
  });

  test("rejects duplicate, reordered, altered and stale atoms fail-closed", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      const entryId = await createPrivateEntry(client, userId, `altered-${randomUUID()}`);
      await reconcile(client, entryId, "revision-one", [
        node("definition", "definition", "raw.meanings[0].definition", "Original"),
        node("example", "example", "raw.meanings[0].examples[0]", "Example"),
      ]);
      const first = await attest(client, userId, entryId);
      const candidates = [
        { ...first.cardContent, atoms: [...first.cardContent.atoms, first.cardContent.atoms[1]] },
        { ...first.cardContent, atoms: [...first.cardContent.atoms].reverse() },
        {
          ...first.cardContent,
          atoms: first.cardContent.atoms.map((atom, index) =>
            index === 1 ? { ...atom, text: "Altered" } : atom,
          ),
        },
        {
          ...first.cardContent,
          omittedAtomCount: first.cardContent.omittedAtomCount + 1,
        },
      ];
      for (const candidate of candidates) {
        await expectQueryError(
          client,
          () => client.query(
            `select public.verify_platform_v2_bounded_report_atoms_as_principal(
               $1, $2, $3, $4::jsonb
             )`,
            [userId, entryId, first.contentRevision, JSON.stringify(candidate)],
          ),
          /report_atoms_mismatch/,
        );
      }

      await reconcile(client, entryId, "revision-two", [
        node("definition", "definition", "raw.meanings[0].definition", "Changed"),
      ]);
      await client.query("set local role service_role");
      await expectQueryError(
        client,
        () => client.query(
          `select public.verify_platform_v2_bounded_report_atoms_as_principal(
             $1, $2, $3, $4::jsonb
           )`,
          [userId, entryId, first.contentRevision, JSON.stringify(first.cardContent)],
        ),
        /stale_report_content_revision/,
      );
    });
  });

  test("authorizes private entries and denies browser or direct private projection access", async () => {
    await withTransaction(pool, async (client) => {
      const ownerId = randomUUID();
      const otherId = randomUUID();
      await ensureUserWithSettings(client, otherId);
      const entryId = await createPrivateEntry(client, ownerId, `private-${randomUUID()}`);
      const owner = await attest(client, ownerId, entryId);
      expect(owner.cardContent.atoms[0].role).toBe("headword");

      await expectQueryError(
        client,
        () => attest(client, otherId, entryId),
        /platform_v2_entry_not_accessible/,
      );
      await client.query("reset role");
      const privileges = await client.query(`select
        has_table_privilege('service_role', 'private.platform_v2_content_nodes', 'select') node_read,
        has_function_privilege(
          'service_role',
          'private.project_platform_v2_bounded_report_atoms(uuid,uuid,text)',
          'execute'
        ) private_project,
        has_function_privilege(
          'authenticated',
          'public.read_platform_v2_report_atom_attestation(uuid,uuid)',
          'execute'
        ) browser_attest`);
      expect(privileges.rows[0]).toEqual({
        node_read: false,
        private_project: false,
        browser_attest: false,
      });
      await client.query("savepoint browser_direct_attempt");
      await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
      await expect(
        client.query(
          `select public.read_platform_v2_report_atom_attestation($1, $2)`,
          [ownerId, entryId],
        ),
      ).rejects.toThrow(/unauthorized/);
      await client.query("rollback to savepoint browser_direct_attempt");
      await client.query("release savepoint browser_direct_attempt");
    });
  });
});
