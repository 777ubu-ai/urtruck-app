# Deterministic Translation Memory

This module is an opt-in exact-match accelerator for logistics phrases. It is
disabled by default (`TRANSLATION_MEMORY_ENABLED=false`) and runs in shadow
mode by default. Only records with `status=approved` are indexed; candidate
terminology and templates can never become a user response automatically.

Lookup is language-, intent-, slot- and version-scoped. Rendering uses a
whitelist and the result must preserve typed facts and polarity before it can
be returned. Unknown or failed matches must continue through the existing NLLB
path. Metrics contain only counters, template IDs, reason codes and latency;
raw message text and protected slot values are never logged.

Terminology review is required for every language and for logistics domain
meaning before changing a record to `approved`.
