import re

_SLOT = re.compile(r"\{([a-z][a-z0-9_]*)\}")


def render(template: str, slots: dict[str, str]) -> str | None:
    names = set(_SLOT.findall(template))
    if not names.issubset(slots):
        return None
    result = _SLOT.sub(lambda match: slots[match.group(1)], template)
    if "{" in result or "}" in result or "\x00" in result:
        return None
    return re.sub(r"[ \t]{2,}", " ", result).strip()
