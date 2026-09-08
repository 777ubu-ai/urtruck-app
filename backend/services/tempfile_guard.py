"""Гарантированная очистка временных файлов загрузок.

Endpoints, принимающие UploadFile, раньше писали во
`NamedTemporaryFile(delete=False)` и не удаляли файл — /tmp рос
неограниченно. Этот контекстный менеджер пишет байты во временный
файл и удаляет его в finally (и при успехе, и при исключении).
"""
import os
import tempfile
from contextlib import contextmanager


@contextmanager
def temp_upload_file(data: bytes, suffix: str = ".jpg"):
    """Записать bytes во временный файл и всегда удалить его на выходе."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        yield path
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
