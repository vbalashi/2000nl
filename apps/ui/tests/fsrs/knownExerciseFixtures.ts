import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {ensureUserWithSettings, insertWord} from "./dbTestUtils";
export async function createIdiomFixture(
  client: PoolClient,
  userId: string,
  options: { isNt2?: boolean } = {},
) {
  await ensureUserWithSettings(client, userId);
  const entryId = await insertWord(
    client,
    `exercise-hardening-${randomUUID()}`,
    { is_nt2_2000: options.isNt2 ?? true },
  );
  const idiomNodeId = randomUUID();
  const explanationNodeId = randomUUID();

  await client.query(
    `insert into private.platform_v2_content_nodes (
       id, entry_id, parent_content_node_id, kind, binding_state, first_source_revision,
       last_source_revision, source_text_fingerprint, diagnostic_locator
     ) values ($1, $2, null, 'idiom', 'active', 'test-revision', 'test-revision', $3, $4),
              ($5, $2, $1, 'idiom-explanation', 'active', 'test-revision',
               'test-revision', $6, $7)`,
    [
      idiomNodeId,
      entryId,
      `idiom-fingerprint-${idiomNodeId}`,
      `test.idiom.${idiomNodeId}`,
      explanationNodeId,
      `explanation-fingerprint-${explanationNodeId}`,
      `test.explanation.${explanationNodeId}`,
    ],
  );
  await client.query(
    `insert into public.user_card_status (
       user_id, entry_id, card_type_id, fsrs_enabled, in_learning,
       next_review_at
     ) values ($1, $2, 'word-to-definition', true, true, now())`,
    [userId, entryId],
  );

  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
  await client.query("set local role service_role");
  const { rows } = await client.query(
    `select public.ensure_platform_v2_training_exercise_target_as_principal_v1(
       $1, $2, 'idiom', 'direct', $3, $4
     ) target_id`,
    [
      entryId,
      idiomNodeId,
      `source-revision-${idiomNodeId}`,
      `idiom-fingerprint-${idiomNodeId}`,
    ],
  );
  const targetId = rows[0].target_id as string;
  await client.query("reset role");

  return {
    entryId,
    idiomNodeId,
    targetId,
    targetKey: `training-exercise-v1:idiom:direct:${entryId}:${idiomNodeId}`,
  };
}

