# Training reading-size comparison — September 2026

This is a bounded, dev-only comparison for [#249](https://github.com/vbalashi/2000nl/issues/249).
It keeps the accepted height-B Training composition and compares only three
reading-size proposals on the same real Training frame:

`/dev/sense-card-gate?prototype=reading&variant=normal`

Use `variant=normal`, `variant=large`, or `variant=largest`. The prototype also
offers `mode=direct|reverse`, short/long deterministic local content, and
translations on/off. Add `clean=1` for a capture with the switcher hidden; the
small prototype stamp is left visible. No authentication, database, network
lookup, review action, or preference persistence is involved. The long fixture
starts with a long definition so reverse mode exercises the same content-size
pressure on its Face prompt.

## Proposed values

The values below are comparison hypotheses, not an adopted product contract.
Normal preserves the current runtime defaults. Body copy grows more strongly
than the already-large headword, while utility labels and the fixed action
dock remain unchanged.

| Role | Normal | Large | Largest |
| --- | --- | --- | --- |
| Reading body | 16px / 1.15 | 18px / 1.28 | 20px / 1.38 |
| Literary body | 16px / 1.4 | 18px / 1.5 | 20px / 1.55 |
| Compact idiom | 14px / 1.25 | 15.5px / 1.35 | 17px / 1.4 |
| Nested definition | 13px / 1.35 | 14px / 1.4 | 15px / 1.45 |
| Translation | 13px / 1.35 | 14px / 1.45 | 15px / 1.5 |
| Headword (face / answer) | 48px / 44px | 50px / 46px | 52px / 48px |
| Utility labels | unchanged | unchanged | unchanged |

The prototype intentionally leaves the action dock height and session/footer
geometry owned by the accepted B runtime. If larger body text increases scroll
pressure or makes controls hard to reach, record that as comparison evidence;
do not conceal it by changing the runtime dock height.

This is not a settings feature or a production rollout. Once the comparison has
a decision, retain the decision in the issue and remove or absorb this throwaway
surface.
