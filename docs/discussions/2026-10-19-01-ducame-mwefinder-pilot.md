# DUCAME / MWE-Finder: bounded external pilot

Date: 2026-10-19. Status: experiment authorised by owner; no production adoption.

The owner requested an actual DUCAME/MWE-Finder trial and further alternatives after the 18 October MWE study. Run in issue 742's existing evidence-owning checkout. Preserve the frozen 32-case reference and distinguish structural matching from novel expression discovery.

Scope: a controlled MWE-Finder structural-query smoke and an Alpino-native lexical/syntactic baseline on the same 32 sentences. Public parser requests are cached, bounded to 48 per invocation and carry timeouts. No paid LLM calls, database changes, collection updates or application integration. Do not import the alpha full annotator: missing parsed-lexicon XML can trigger an uncontrolled index rebuild. Package/data licensing requires clarification before adoption.

Research sources and additional alternatives: [research](../research/agent-import-742/multivideo/LEXICON-ALTERNATIVES-RESEARCH-20261019.md). Results will distinguish controlled examples, existing targeted reference scores, and unexecuted full-lexicon work.
