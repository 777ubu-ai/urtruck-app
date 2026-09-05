"""Public Documents contract placeholder for the modular boundary."""
from typing import Protocol


class DocumentsApplication(Protocol):
    def finalize_upload(self, upload_id: str, actor_id: int) -> dict: ...
