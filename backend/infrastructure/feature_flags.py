"""Foundation flags. Defaults are deliberately fail-safe."""
import os


def deals_v2_enabled() -> bool:
    return os.getenv("DEALS_V2_ENABLED", "false").lower() in {"1", "true", "yes"}
