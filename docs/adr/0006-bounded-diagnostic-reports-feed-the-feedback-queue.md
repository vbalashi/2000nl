# Bounded diagnostic reports feed the feedback queue

Diagnostic Reports create durable Feedback Items in the shared #51 review queue, while their full Diagnostic Envelopes are separate, allowlist-built evidence retained for only 90 days. Reports are frozen under one UUID before entering a 30-day local outbox, and transport retries reuse that identity; this keeps offline delivery reliable without turning GitHub, browser logs, arbitrary URLs, credentials, or unrelated browser state into diagnostic storage.

The learner sees only transient delivery status. Internal admin reviewers decide whether a Feedback Item warrants a manually written GitHub issue, and accepted reports are removed from the local outbox immediately. This boundary deliberately favors bounded, classifiable evidence over general-purpose debugging capture so forbidden data is impossible to collect and diagnostics cannot grow into a performance-sensitive surveillance channel.
