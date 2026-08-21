import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";
import { canonicalJson } from "../../../../packages/shared/diagnostic-report/v1";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

const envelope = (reportId: string) => ({
  schemaVersion: "diagnostic-report-v1", reportId,
  feedback: { kind: "loading", problemType: "loading-failure", comment: "waited" },
  target: { kind: "app-operation", route: "training", stage: "lookup-fetch", operationCorrelationId: randomUUID(), entryId: null },
  sourceContext: null, cardContent: null,
  observations: { capturedAt: "2026-08-20T10:00:00.000Z", timezoneOffsetMinutes: 180, timezoneName: "Europe/Moscow", route: "training", browserFamily: "chromium", browserMajorVersion: 140, osFamily: "android", osMajorVersion: 16, isPwa: true, isOnline: true, correlationIds: [], errorChain: [], recentEvents: [], omittedEventCount: 0, actionObservation: null },
});

describeIfDb("Diagnostic feedback RPC", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  test("atomically accepts once, duplicates same hash, and conflicts on changed hash", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID(); const reportId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("set local role service_role");
      const canonical = canonicalJson(envelope(reportId));
      const hash = createHash("sha256").update(canonical).digest("hex");
      const call = (candidateHash: string, candidateCanonical = canonical) => client.query(`select submit_diagnostic_report_as_principal($1,'2000nl-web','test@sha',$2,$3,$4,$5::jsonb) result`, [userId, reportId, candidateHash, candidateCanonical, candidateCanonical]);
      const accepted = await call(hash);
      const duplicate = await call(hash);
      const changed = envelope(reportId);
      changed.feedback.comment = "changed";
      const changedCanonical = canonicalJson(changed);
      const changedHash = createHash("sha256").update(changedCanonical).digest("hex");
      const conflict = await call(changedHash, changedCanonical);
      expect(accepted.rows[0].result.status).toBe("accepted");
      expect(duplicate.rows[0].result).toEqual(expect.objectContaining({ status: "duplicate", feedbackItemId: accepted.rows[0].result.feedbackItemId }));
      expect(duplicate.rows[0].result.acceptedAt).toBe(accepted.rows[0].result.acceptedAt);
      expect(conflict.rows[0].result.status).toBe("conflict");
      const counts = await client.query("select (select count(*)::int from feedback_items where reporter_user_id=$1) items, (select count(*)::int from diagnostic_envelopes where reporter_user_id=$1) envelopes", [userId]);
      expect(counts.rows[0]).toEqual({ items: 1, envelopes: 1 });
      const adminProjection = await client.query("select * from query_feedback_items_admin(p_limit => 10) where report_id=$1", [reportId]);
      expect(adminProjection.rows[0].reporter_pseudonym).toMatch(/^usr_[0-9a-f]{24}$/);
      expect(adminProjection.rows[0]).not.toHaveProperty("reporter_user_id");
      expect(adminProjection.rows[0].comment_present).toBe(true);
      expect(JSON.stringify(adminProjection.rows[0])).not.toContain("waited");
    });
  });

  test("retention cleanup removes only the envelope", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID(); const reportId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("set local role service_role");
      const canonical = canonicalJson(envelope(reportId));
      const hash = createHash("sha256").update(canonical).digest("hex");
      const accepted = await client.query(`select submit_diagnostic_report_as_principal($1,'2000nl-web','test@sha',$2,$3,$4,$5::jsonb) result`, [userId, reportId, hash, canonical, canonical]);
      expect(accepted.rows[0].result.status).toBe("accepted");
      const deleted = await client.query("select delete_expired_diagnostic_envelopes(now()+interval '91 days') count");
      expect(deleted.rows[0].count).toBe(1);
      const retainedReceipt = await client.query(
        "select read_diagnostic_report_receipt_as_principal($1,$2,$3) result",
        [userId, reportId, hash],
      );
      expect(retainedReceipt.rows[0].result).toEqual(expect.objectContaining({
        status: "duplicate",
        feedbackItemId: accepted.rows[0].result.feedbackItemId,
        acceptedAt: accepted.rows[0].result.acceptedAt,
      }));
      const duplicate = await client.query(`select submit_diagnostic_report_as_principal($1,'2000nl-web','test@sha',$2,$3,$4,$5::jsonb) result`, [userId, reportId, hash, canonical, canonical]);
      expect(duplicate.rows[0].result).toEqual(expect.objectContaining({
        status: "duplicate",
        feedbackItemId: accepted.rows[0].result.feedbackItemId,
        acceptedAt: accepted.rows[0].result.acceptedAt,
      }));
      const changed = envelope(reportId); changed.feedback.comment = "changed after expiry";
      const changedCanonical = canonicalJson(changed);
      const changedHash = createHash("sha256").update(changedCanonical).digest("hex");
      const retainedConflict = await client.query(
        "select read_diagnostic_report_receipt_as_principal($1,$2,$3) result",
        [userId, reportId, changedHash],
      );
      expect(retainedConflict.rows[0].result.status).toBe("conflict");
      const conflict = await client.query(`select submit_diagnostic_report_as_principal($1,'2000nl-web','test@sha',$2,$3,$4,$5::jsonb) result`, [userId, reportId, changedHash, changedCanonical, changedCanonical]);
      expect(conflict.rows[0].result.status).toBe("conflict");
      const counts = await client.query("select (select count(*)::int from feedback_items where reporter_user_id=$1) items, (select count(*)::int from diagnostic_envelopes where reporter_user_id=$1) envelopes", [userId]);
      expect(counts.rows[0]).toEqual({ items: 1, envelopes: 0 });
    });
  });

  test("gives authenticated browser roles neither table reads nor RPC execution", async () => {
    await withTransaction(pool, async (client) => {
      const privileges = await client.query(`select
        has_table_privilege('authenticated', 'feedback_items', 'select') feedback_select,
        has_table_privilege('authenticated', 'diagnostic_envelopes', 'select') envelope_select,
        has_table_privilege('authenticated', 'diagnostic_report_receipts', 'select') receipt_select,
        has_function_privilege('authenticated', 'delete_expired_diagnostic_envelopes(timestamptz)', 'execute') cleanup_execute`);
      expect(privileges.rows[0]).toEqual({
        feedback_select: false, envelope_select: false, receipt_select: false, cleanup_execute: false,
      });
    });
  });

  test("serializes concurrent delivery into one accepted and one identical duplicate receipt", async () => {
    const userId = randomUUID(); const reportId = randomUUID();
    const setupClient = await pool.connect();
    try { await ensureUserWithSettings(setupClient, userId); }
    finally { setupClient.release(); }
    // Use independent transactions so the second delivery must wait on the
    // same semantic advisory lock until the first has committed.
    const canonical = canonicalJson(envelope(reportId));
    const hash = createHash("sha256").update(canonical).digest("hex");
    const deliver = async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
        await client.query("set local role service_role");
        const result = await client.query(`select submit_diagnostic_report_as_principal($1,'2000nl-web','test@sha',$2,$3,$4,$5::jsonb) result`, [userId, reportId, hash, canonical, canonical]);
        await client.query("commit");
        return result.rows[0].result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally { client.release(); }
    };
    const results = await Promise.all([deliver(), deliver()]);
    expect(results.map((result) => result.status).sort()).toEqual(["accepted", "duplicate"]);
    expect(new Set(results.map((result) => result.feedbackItemId)).size).toBe(1);
    expect(new Set(results.map((result) => result.acceptedAt)).size).toBe(1);
    await pool.query("delete from diagnostic_envelopes where reporter_user_id=$1", [userId]);
    await pool.query("delete from diagnostic_report_receipts where reporter_user_id=$1", [userId]);
    await pool.query("delete from feedback_items where reporter_user_id=$1", [userId]);
    await pool.query("delete from user_settings where user_id=$1", [userId]);
    await pool.query("delete from auth.users where id=$1", [userId]);
  });

  test("rejects forbidden automatic fields even from the internal RPC boundary", async () => {
    await expect(withTransaction(pool, async (client) => {
      const userId = randomUUID(); const reportId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("set local role service_role");
      const unsafe: any = envelope(reportId);
      unsafe.observations.token = "must-not-persist";
      const canonical = canonicalJson(unsafe);
      const hash = createHash("sha256").update(canonical).digest("hex");
      await client.query(`select submit_diagnostic_report_as_principal($1,'2000nl-web','test@sha',$2,$3,$4,$5::jsonb)`, [userId, reportId, hash, canonical, canonical]);
    })).rejects.toThrow(/invalid_report/);
  });

  test("rejects an app-operation related to another user's private entry", async () => {
    const ownerId = randomUUID();
    const reporterId = randomUUID();
    await expect(withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, reporterId);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
      const created = await client.query(
        `select create_user_dictionary_entry($1, null, jsonb_build_object(
          'headword', $2::text, 'languageCode', 'nl', 'definition', 'private definition'
        )) entry_id`,
        [ownerId, `diagnostic-private-entry-${randomUUID()}`],
      );
      const report: any = envelope(randomUUID());
      report.target.entryId = created.rows[0].entry_id;
      const canonical = canonicalJson(report);
      const hash = createHash("sha256").update(canonical).digest("hex");
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("set local role service_role");
      await client.query(
        `select submit_diagnostic_report_as_principal($1,'2000nl-web','test@sha',$2,$3,$4,$5::jsonb)`,
        [reporterId, report.reportId, hash, canonical, canonical],
      );
    })).rejects.toThrow(/platform_v2_entry_not_accessible/);
  });

  test("checks entry authorization before evaluating a content-node target", async () => {
    const ownerId = randomUUID();
    const reporterId = randomUUID();
    await expect(withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, reporterId);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
      const created = await client.query(
        `select create_user_dictionary_entry($1, null, jsonb_build_object(
          'headword', $2::text, 'languageCode', 'nl', 'definition', 'private definition'
        )) entry_id`,
        [ownerId, `diagnostic-private-node-${randomUUID()}`],
      );
      const report: any = envelope(randomUUID());
      report.target = {
        kind: "content-node", entryId: created.rows[0].entry_id,
        contentNodeId: randomUUID(), nodeKind: "definition",
        sourceTextFingerprint: "b".repeat(64),
      };
      report.cardContent = {
        atoms: [{ role: "definition", contentNodeId: report.target.contentNodeId, text: "private definition", truncated: false }],
        omittedAtomCount: 0,
      };
      const canonical = canonicalJson(report);
      const hash = createHash("sha256").update(canonical).digest("hex");
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("set local role service_role");
      await client.query(
        `select submit_diagnostic_report_as_principal($1,'2000nl-web','test@sha',$2,$3,$4,$5::jsonb)`,
        [reporterId, report.reportId, hash, canonical, canonical],
      );
    })).rejects.toThrow(/platform_v2_entry_not_accessible/);
  });
});
