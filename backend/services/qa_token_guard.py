"""Guards for privileged QA-only backend endpoints.

The SHA-256 fingerprints below identify QA agent tokens that were exposed in
git history.  The original values are intentionally not kept in source.
Keeping only their one-way fingerprints lets a deployment reject an old
credential until the operator rotates ``QA_AGENT_TOKEN`` in its secret store.

P0 (reconciliation 01.09.2026): a source-of-truth audit found that the
original single fingerprint below (``95376f15...``) does NOT match the
SHA-256 of the token actually committed in git history
(``qa/maestro/_run_clienthunt.sh``, commit ``0da68db1``, and again as a bare
``QA_AGENT_TOKEN=`` a few commits earlier) — verified independently by
computing ``sha256()`` of the exact leaked string pulled from
``git show 0da68db1:qa/maestro/_run_clienthunt.sh``. That real leak's
fingerprint is added below as a second entry; the original entry is kept
in case it corresponds to a separate leak that predates this audit and
simply was not found in this pass — removing it outright without positive
evidence it is wrong would risk un-revoking a credential. Both are checked.
"""
from __future__ import annotations

import hashlib
import hmac


COMPROMISED_QA_AGENT_TOKEN_SHA256 = "95376f15f429d6d50e8e36dcb517e859d3777588890de8813eeba0208daddd49"

# The token literally found in git history (see module docstring) —
# confirmed by direct computation, not assumed.
COMPROMISED_QA_AGENT_TOKEN_SHA256_2 = "19ef3c8a3852cdacbf594a4d58c600913f76ed3adc836f9f9ed9f14f034fc366"

_COMPROMISED_FINGERPRINTS = (
    COMPROMISED_QA_AGENT_TOKEN_SHA256,
    COMPROMISED_QA_AGENT_TOKEN_SHA256_2,
)


def is_compromised_qa_agent_token(value: str | None) -> bool:
    """Return whether *value* is a token known to have leaked into git history."""
    if not value:
        return False
    fingerprint = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return any(hmac.compare_digest(fingerprint, known) for known in _COMPROMISED_FINGERPRINTS)
