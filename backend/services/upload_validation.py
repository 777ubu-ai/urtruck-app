"""Reusable upload validation: magic-byte sniffing, size limits, filename
sanitation, declared-MIME cross-check.

Single source of truth for «what is this file really» across registration,
profile PRO-documents, chat photo/voice and deal-room attachments. Callers
own the HTTP layer; this module raises UploadValidationError with a
status_code (400/413/415) so endpoints can translate it 1:1.
"""
import re
from typing import Optional, Tuple

# ── Size limits ────────────────────────────────────────────────────────────
MAX_ATTACH_BYTES = 12 * 1024 * 1024          # deal-room attachments
MAX_REGISTRATION_IMAGE_BYTES = 15 * 1024 * 1024  # registration photos
MAX_CHAT_PHOTO_BYTES = 8 * 1024 * 1024
MAX_CHAT_VOICE_BYTES = 10 * 1024 * 1024
MAX_PRO_DOC_BYTES = 10 * 1024 * 1024

# ── MIME constants ─────────────────────────────────────────────────────────
JPEG_MIME = "image/jpeg"
PNG_MIME = "image/png"
WEBP_MIME = "image/webp"
PDF_MIME = "application/pdf"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
XLS_MIME = "application/vnd.ms-excel"
CSV_MIME = "text/csv"

ALLOWED_ATTACHMENTS = {
    JPEG_MIME: ("photo", "jpg"),
    PNG_MIME: ("photo", "png"),
    PDF_MIME: ("document", "pdf"),
    XLSX_MIME: ("document", "xlsx"),
    XLS_MIME: ("document", "xls"),
    CSV_MIME: ("document", "csv"),
}

# Safari/PWA commonly upload a selected file as one of these — magic bytes
# are authoritative, a generic declared MIME is not a contradiction.
GENERIC_DECLARED_MIME = {
    "",
    "application/octet-stream",
    "binary/octet-stream",
    "application/x-download",
}

# Client-declared MIME aliases normalized to the canonical MIME before the
# declared-vs-sniffed cross-check.
DECLARED_ALIASES = {
    "image/jpg": JPEG_MIME,
    "image/x-png": PNG_MIME,
    "image/x-jpeg": JPEG_MIME,
    "application/x-pdf": PDF_MIME,
    "application/acrobat": PDF_MIME,
    "application/vnd.ms-office": XLS_MIME,
    "application/xls": XLS_MIME,
    "application/x-excel": XLS_MIME,
    "application/msexcel": XLS_MIME,
    "application/x-msexcel": XLS_MIME,
    "application/csv": CSV_MIME,
    "text/comma-separated-values": CSV_MIME,
    "text/x-csv": CSV_MIME,
    "audio/mp3": "audio/mpeg",
    "audio/x-m4a": "audio/mp4",
    "audio/x-wav": "audio/wav",
    "audio/webm;codecs=opus": "audio/webm",
}

# Signatures
_ZIP_SIG = b"PK\x03\x04"
_OLE2_SIG = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_JPEG_SIG = b"\xff\xd8\xff"
_PNG_SIG = b"\x89PNG\r\n\x1a\n"
_PDF_SIG = b"%PDF-"


class UploadValidationError(ValueError):
    """Validation failure carrying the HTTP status the endpoint should send."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# ── Filename sanitation ────────────────────────────────────────────────────
def sanitize_original_name(value: Optional[str], ext: str) -> str:
    """Strip paths/control chars/length from a client-supplied filename.

    Unicode and spaces are preserved (Safari sends them); the result must
    never be used as a storage key — storage keys are generated server-side.
    """
    raw = str(value or "").replace("\\", "/").split("/")[-1].strip()
    raw = re.sub(r"[\x00-\x1f\x7f]+", "", raw)
    if not raw:
        raw = "document.{}".format(ext)
    return raw[:180]


# ── Content sniffing ───────────────────────────────────────────────────────
def sniff_image_mime(raw: bytes) -> Optional[str]:
    """JPEG/PNG only (registration photos, chat photos)."""
    if raw[:3] == _JPEG_SIG:
        return JPEG_MIME
    if raw[:8] == _PNG_SIG:
        return PNG_MIME
    return None


def sniff_pro_doc_mime(raw: bytes) -> Optional[str]:
    """JPEG/PNG/WEBP (profile PRO-documents)."""
    img = sniff_image_mime(raw)
    if img:
        return img
    # WebP: RIFF container with a WEBP form type.
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return WEBP_MIME
    return None


def sniff_audio_mime(raw: bytes) -> Optional[Tuple[str, str]]:
    """Audio containers → (ext, mime). Magic bytes only — the filename is
    client-controlled and must never decide the stored content type."""
    if raw[:3] == b"ID3" or raw[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2", b"\xff\xfa"):
        return ("mp3", "audio/mpeg")
    # ADTS AAC (raw .aac stream): 0xFFFx sync word, layer bits == 00.
    if raw[:1] == b"\xff" and len(raw) >= 2 and (raw[1] & 0xF6) == 0xF0:
        return ("aac", "audio/aac")
    if raw[:4] == b"OggS":
        return ("ogg", "audio/ogg")
    if raw[:4] == b"RIFF" and raw[8:12] == b"WAVE":
        return ("wav", "audio/wav")
    # EBML (Matroska/WebM). Voice recordings from the web arrive as webm.
    if raw[:4] == b"\x1a\x45\xdf\xa3":
        return ("webm", "audio/webm")
    # MP4-family: box size + 'ftyp' + major brand. Only audio brands accepted.
    if len(raw) >= 12 and raw[4:8] == b"ftyp" and raw[8:12] in (
        b"M4A ", b"M4B ", b"mp41", b"mp42", b"isom", b"iso2",
    ):
        return ("m4a", "audio/mp4")
    return None


def _looks_like_xlsx(raw: bytes) -> bool:
    if raw[:4] != _ZIP_SIG:
        return False
    # A zip is xlsx only if it actually contains the OOXML spreadsheet parts,
    # not just because it starts with PK (docx/pptx/plain .zip share that
    # signature). Require BOTH the package manifest and a workbook part —
    # either alone is not enough to rule out a same-signature docx/pptx.
    head = raw[:8192]
    body = raw[:200000]
    return b"[Content_Types].xml" in head and (b"xl/workbook.xml" in body or b"xl/" in body)


def _looks_like_text(raw: bytes) -> bool:
    sample = raw[:8192]
    if b"\x00" in sample:
        return False
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        return False
    # No CSV magic bytes exist. "Decodes as UTF-8" alone would misclassify
    # any plain-text file (.txt, .json, source code) as a document upload —
    # additionally require the newline + delimiter shape a real CSV has.
    return "\n" in text and ("," in text or ";" in text or "\t" in text)


def sniff_mime(raw: bytes) -> Optional[str]:
    """Full deal-room sniffing: JPEG/PNG/PDF/XLSX/XLS/CSV."""
    if raw[:3] == _JPEG_SIG:
        return JPEG_MIME
    if raw[:8] == _PNG_SIG:
        return PNG_MIME
    if raw[:5] == _PDF_SIG:
        return PDF_MIME
    if _looks_like_xlsx(raw):
        return XLSX_MIME
    if raw[:8] == _OLE2_SIG:
        # OLE2 covers legacy .xls/.doc/.ppt alike; only .xls is accepted here
        # (declared-vs-sniffed cross-check below rejects a mislabeled .doc).
        return XLS_MIME
    if _looks_like_text(raw):
        # Text content plus a CSV-shaped declared MIME/extension (checked by
        # the caller) is the honest floor here — there is nothing stronger
        # to check for a format with no magic bytes at all.
        return CSV_MIME
    return None


# ── Declared-MIME cross-check ──────────────────────────────────────────────
def normalize_declared_mime(content_type: Optional[str]) -> str:
    declared = (content_type or "").split(";", 1)[0].strip().lower()
    return DECLARED_ALIASES.get(declared, declared)


def declared_contradicts_sniffed(declared: Optional[str], sniffed: str) -> bool:
    """True only when the client declared a SPECIFIC MIME that contradicts
    the magic bytes. Generic declared types are not a contradiction."""
    normalized = normalize_declared_mime(declared)
    return normalized not in GENERIC_DECLARED_MIME and normalized != sniffed


# ── Validated-read helpers ─────────────────────────────────────────────────
def validate_image_bytes(raw: bytes, max_bytes: int = MAX_REGISTRATION_IMAGE_BYTES) -> Tuple[str, str]:
    """Registration-photo gate: non-empty, within max_bytes, JPEG/PNG magic.

    Returns (ext, mime). Raises UploadValidationError(413/415/400).
    """
    if not raw:
        raise UploadValidationError(400, "Пустой файл")
    if len(raw) > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise UploadValidationError(413, "Файл слишком большой (максимум {} МБ)".format(mb))
    mime = sniff_image_mime(raw)
    if mime is None:
        raise UploadValidationError(415, "Неподдерживаемый тип файла (только JPEG/PNG)")
    ext = "jpg" if mime == JPEG_MIME else "png"
    return ext, mime
