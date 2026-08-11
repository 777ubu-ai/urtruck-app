"""Guards for privileged QA-only backend endpoints.

The SHA-256 fingerprint below identifies the QA agent token that was exposed
in a committed Maestro runner.  The original value is intentionally not kept
in source.  Keeping only its one-way fingerprint lets a deployment reject the
old credential until the operator rotates ``QA_AGENT_TOKEN`` in its secret
store.
"""
from __future__ import annotations

import hashlib
import hmac


COMPROMISED_QA_AGENT_TOKEN_SHA256 = "95376f15f429d6d50e8e36dcb517e859d3777588890de8813eeba0208daddd49"


def is_compromised_qa_agent_token(value: str | None) -> bool:
    """Return whether *value* is the token leaked by the old QA runner."""
    if not value:
        return False
    fingerprint = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return hmac.compare_digest(fingerprint, COMPROMISED_QA_AGENT_TOKEN_SHA256)
