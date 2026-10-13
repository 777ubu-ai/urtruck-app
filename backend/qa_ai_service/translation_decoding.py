"""Bounded NLLB decoding limits and candidate count for the private QA2 service."""

TRANSLATE_BEAM_SIZE = 4
TRANSLATE_NUM_HYPOTHESES = 3
TRANSLATE_MIN_DECODING_LENGTH = 64
TRANSLATE_MAX_DECODING_LENGTH = 512


def translation_max_decoding_length(source_token_count: int) -> int:
    """Give short messages a tight bound while retaining long-message capacity."""
    return min(
        TRANSLATE_MAX_DECODING_LENGTH,
        max(TRANSLATE_MIN_DECODING_LENGTH, max(0, source_token_count) * 3 + 24),
    )
