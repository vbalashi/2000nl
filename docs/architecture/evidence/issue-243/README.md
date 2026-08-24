# Issue #243 cold next-card selector evidence

Production was healthy at commit
`b2e14ad7d0afe929e8ce590fd3d6f2972127d7a4`, contract 127. An exact
`test@2000nl.test` fresh-connection benchmark ran inside `BEGIN READ ONLY` and
rolled back. The session plan passed on its first call at 192.2 ms, while the
actual `get_next_card` selector took 2,471.3 ms and failed the two-second bound.
Warm selector p95 was 127.5 ms, identifying recurring cold I/O rather than
steady-state computation.

The disposable PostgreSQL reproduction uses 18,184 entries, exactly 4,031
distributed NT2 entries, 1.5 KB-or-larger rows, mixed FSRS states, today's new
history, exact QA identity, and dirtied source visibility. It failed
deterministically twice at 22,052 and 22,049 shared blocks. Component probes
attributed 16,254 blocks to candidate scheduling, 6,256 to final selected-card
projection, and only 390 to pointer exclusion.

Three changes are jointly load-bearing:

1. no-list selection reads migration 127's narrow synchronized training scope;
2. today's word/card history, known marks, and learner status are resolved as
   one-time materialized sets rather than correlated per-candidate probes;
3. `(dictionary_id, language_code, headword)` indexes the final card's exact
   sibling count.

The resulting run touched 3,037 blocks in 37.231 ms. Component measurements
were 2,800 scheduler blocks, 726 projection blocks, and 411 pointer-helper
blocks. Removing randomized `selection_order`, candidate snapshots were
identical before and after migration 128 for default `both`, `new`, `review`,
multi-mode, entry-exclusion, and exact-card-exclusion cases. Repository FSRS
tests continue to characterize curated/user lists, source filters, dictionary
access, legacy null-dictionary entries, pointer-only/known/hidden exclusions,
daily caps, overdue order, and future-due practice.

Postflight pins the selector's security-definer boundary, exact search path,
volatility, owner and denied caller roles. It also pins the sibling index to
the expected table, btree access method, ordered plain keys, and non-partial,
non-expression shape. Real PostgreSQL tamper tests prove that security, grant,
or partial-index drift fails closed and that replaying migration 128 restores
the exact contract before postflight can pass.

The checksum-pinned pre-switch probe now executes both the session plan and
the actual next-card RPC under the same 2,000 ms read-only transaction. Its
real PostgreSQL integration proves two no-op/apply runs preserve card status,
review history, known marks, action events, feedback, and diagnostic receipts.
No production mutation, merge, or deployment was performed during this work.
