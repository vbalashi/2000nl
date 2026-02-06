#!/usr/bin/env node
/* eslint-disable no-console */

// Test user provisioning + seeding for automation.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
//   node scripts/test-account.js create
//
//   ... node scripts/test-account.js seed
//
// Notes:
// - Requires SUPABASE_SERVICE_ROLE_KEY (never expose it client-side).
// - Seeding is best-effort; it assumes core migrations are applied.

const { createClient } = require("@supabase/supabase-js");

const getEnv = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || "test@2000nl.test";
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || "test-password-123";

const supabaseAdmin = () => {
  const url = SUPABASE_URL || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = SERVICE_ROLE_KEY || getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

async function findUserIdByEmail(client, email) {
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((u) => u.email === email);
    if (found?.id) return found.id;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function createOrUpdateTestUser() {
  const client = supabaseAdmin();

  const { data: createData, error: createError } =
    await client.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true,
    });

  if (!createError && createData?.user?.id) {
    console.log(`Created test user: ${TEST_USER_EMAIL} (${createData.user.id})`);
    return createData.user.id;
  }

  // If already exists, update password + confirm email.
  const userId = await findUserIdByEmail(client, TEST_USER_EMAIL);
  if (!userId) {
    throw createError || new Error("Failed to create test user and could not find it.");
  }

  const { error: updateError } = await client.auth.admin.updateUserById(userId, {
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  });
  if (updateError) throw updateError;

  console.log(`Updated test user: ${TEST_USER_EMAIL} (${userId})`);
  return userId;
}

async function seedTestData(userId) {
  const client = supabaseAdmin();

  // Deterministic IDs so automation can rely on stable references.
  const word1Id = "11111111-1111-1111-1111-111111111111";
  const word2Id = "22222222-2222-2222-2222-222222222222";
  const listId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  const wordEntries = [
    {
      id: word1Id,
      language_code: "nl",
      headword: "huis",
      part_of_speech: "substantief",
      gender: "het",
      is_nt2_2000: false,
      raw: {
        meanings: [
          {
            definition: "Een gebouw waar mensen wonen.",
            example: "Het huis aan de gracht is oud.",
            links: [{ label: "gracht", headword: "gracht" }],
          },
        ],
      },
    },
    {
      id: word2Id,
      language_code: "nl",
      headword: "gracht",
      part_of_speech: "substantief",
      gender: "de",
      is_nt2_2000: false,
      raw: {
        meanings: [
          {
            definition: "Een waterloop in de stad.",
            example: "De gracht stroomt langs het huis.",
            links: [],
          },
        ],
      },
    },
  ];

  const { error: upsertWordsError } = await client
    .from("word_entries")
    .upsert(wordEntries, { onConflict: "language_code,headword" });
  if (upsertWordsError) throw upsertWordsError;

  const { error: upsertListError } = await client.from("word_lists").upsert(
    {
      id: listId,
      language_code: "nl",
      slug: "e2e-test",
      name: "E2E Test",
      description: "Seeded data for automated browser tests",
      is_primary: false,
      sort_order: 999,
    },
    { onConflict: "language_code,slug" }
  );
  if (upsertListError) throw upsertListError;

  const listItems = [
    { list_id: listId, word_id: word1Id, rank: 1 },
    { list_id: listId, word_id: word2Id, rank: 2 },
  ];
  const { error: upsertItemsError } = await client
    .from("word_list_items")
    .upsert(listItems, { onConflict: "list_id,word_id" });
  if (upsertItemsError) throw upsertItemsError;

  const now = new Date().toISOString();
  const statuses = [
    {
      user_id: userId,
      word_id: word1Id,
      mode: "word-to-definition",
      next_review_at: now,
      last_seen_at: now,
      fsrs_enabled: false,
    },
    {
      user_id: userId,
      word_id: word2Id,
      mode: "word-to-definition",
      next_review_at: now,
      last_seen_at: now,
      fsrs_enabled: false,
    },
  ];
  const { error: upsertStatusError } = await client
    .from("user_word_status")
    .upsert(statuses, { onConflict: "user_id,word_id,mode" });
  if (upsertStatusError) throw upsertStatusError;

  console.log("Seeded test data:");
  console.log(`- word_entries: huis (${word1Id}), gracht (${word2Id})`);
  console.log(`- word_lists: e2e-test (${listId})`);
  console.log(`- user_word_status for user ${userId} (2 rows)`);
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log("Usage: node scripts/test-account.js <create|seed|create+seed>");
    process.exit(0);
  }

  if (!SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
  }
  if (!SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (cmd === "create") {
    await createOrUpdateTestUser();
    return;
  }

  if (cmd === "seed") {
    const userId = await findUserIdByEmail(supabaseAdmin(), TEST_USER_EMAIL);
    if (!userId) throw new Error("Test user not found. Run `create` first.");
    await seedTestData(userId);
    return;
  }

  if (cmd === "create+seed") {
    const userId = await createOrUpdateTestUser();
    await seedTestData(userId);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

