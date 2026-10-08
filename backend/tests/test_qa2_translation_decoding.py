"""Executable latency-bound contract for QA2 local NLLB decoding."""

from qa_ai_service.translation_decoding import (
    TRANSLATE_BEAM_SIZE,
    TRANSLATE_MAX_DECODING_LENGTH,
    TRANSLATE_MIN_DECODING_LENGTH,
    translation_max_decoding_length,
)


def test_short_message_bound_has_no_excessive_cpu_decode_budget():
    assert TRANSLATE_BEAM_SIZE == 2
    assert translation_max_decoding_length(0) == TRANSLATE_MIN_DECODING_LENGTH
    assert translation_max_decoding_length(1) == TRANSLATE_MIN_DECODING_LENGTH
    assert translation_max_decoding_length(13) == TRANSLATE_MIN_DECODING_LENGTH
    assert translation_max_decoding_length(14) == 66


def test_long_message_bound_retains_capacity_without_unbounded_decode():
    assert translation_max_decoding_length(100) == 324
    assert translation_max_decoding_length(163) == TRANSLATE_MAX_DECODING_LENGTH
    assert translation_max_decoding_length(1000) == TRANSLATE_MAX_DECODING_LENGTH
