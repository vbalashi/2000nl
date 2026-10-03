# Actual availability RPC208: isolated local dense fixture

Measured the implemented `read_training_recipe_availability_v1`, not the previous simplified prototype. Dedicated disposable DB `2000nl_fsrs_575_availability`, PostgreSQL17.6 localSupabase;10000 synthetic legacy ordinary entries,5000 answered entries ×2directions =10000 FSRS status records, mixed future/overdue dates. Remaining5000 entries unanswered. These are legacy fixture rows without real source provenance/content bindings; no idiom/context-content performance claim. User timezoneUTC, normal04:00study-day authority used. No canonical local or production learner changes.

Setup inserts only into disposable database; measured calls enforce READ ONLY and3second statement_timeout.15 timed repetitions plus first per scope, one persistent loopback connection. Driver/network overhead included, no API/browser. p95 over15samples is max, small diagnostic sample. Entries split50%zn/50%ww; answered subset selectedbyUUIDorder (hence slightPOSimbalance). Database dropped after measurements.

| Scope | First ms | Median ms | p95 ms | Due today | Total reviews | New cards |
|---|---:|---:|---:|---:|---:|---:|
| direct | 79.44 | 73.89 | 75.75 | 1500 | 5000 | 5000 |
| both | 107.54 | 103.53 | 113.10 | 3000 | 10000 | 5000 |
| nouns | 229.83 | 234.82 | 241.87 | 1550 | 5010 | 2495 |
| verbs | 228.53 | 230.96 | 259.45 | 1450 | 4990 | 2505 |

Reverse unintroduced cards correctly stay out of newCards until introductory gating permits them; thereforeBothnewCards5000,not10000. This is authoritativeRPCfixturemeasurement, distinctfromearlierprototype. ProductionRPC208 speed remainsunmeasureduntildeployment; source-provenance-rich production materialmaycostmore.
