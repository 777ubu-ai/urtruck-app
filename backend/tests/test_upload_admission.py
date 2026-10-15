import asyncio
import os
import sys
from pathlib import Path
os.environ.setdefault("ENV", "test")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi import HTTPException
from services.upload_admission import bounded_attachment_upload


def test_third_upload_rejected_before_body_read_and_slots_reused():
    async def run():
        release = asyncio.Event()
        entered = []
        @bounded_attachment_upload
        async def upload(identifier):
            entered.append(identifier)
            await release.wait()
            return identifier
        first = asyncio.create_task(upload(1))
        second = asyncio.create_task(upload(2))
        await asyncio.sleep(0)
        with pytest.raises(HTTPException) as exc:
            await upload(3)
        assert exc.value.status_code == 429
        assert exc.value.headers["Retry-After"] == "2"
        assert entered == [1, 2]
        release.set()
        assert await asyncio.gather(first, second) == [1, 2]
        assert await upload(4) == 4
    asyncio.run(run())


def test_failure_and_cancellation_release_capacity():
    async def run():
        @bounded_attachment_upload
        async def fail():
            raise ValueError("storage failure")
        for _ in range(3):
            with pytest.raises(ValueError):
                await fail()
        gate = asyncio.Event()
        @bounded_attachment_upload
        async def wait():
            await gate.wait()
        task = asyncio.create_task(wait())
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        gate.set()
        await asyncio.gather(wait(), wait())
    asyncio.run(run())
