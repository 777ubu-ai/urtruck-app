import asyncio
import json

from fastapi import FastAPI, File, UploadFile
from starlette.testclient import TestClient

from services.form_limits import FormLimitsMiddleware


def app_with_limits(**limits):
    app = FastAPI()

    @app.post("/upload")
    async def upload(file: UploadFile = File(...)):
        return {"size": len(await file.read())}

    return FormLimitsMiddleware(app, **limits)


def test_valid_file_and_oversized_content_length():
    client = TestClient(app_with_limits(max_bytes=1024))
    assert client.post("/upload", files={"file": ("a.txt", b"hello")}).json() == {"size": 5}
    assert client.post("/upload", files={"file": ("a.txt", b"x" * 1024)}).status_code == 413


async def call(app, receive, content_type=b"multipart/form-data; boundary=BOUNDARY", length=None):
    sent = []
    headers = [(b"content-type", content_type)]
    if length is not None:
        headers.append((b"content-length", length))
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
             "method": "POST", "scheme": "http", "path": "/upload", "raw_path": b"/upload",
             "query_string": b"", "headers": headers, "server": ("test", 80), "client": ("test", 1)}

    async def send(message):
        sent.append(message)

    await app(scope, receive, send)
    return sent


def test_actual_bytes_limit_without_or_with_false_content_length(monkeypatch):
    import starlette.formparsers as parsers
    original = parsers.SpooledTemporaryFile
    files = []

    def capture(*args, **kwargs):
        f = original(*args, **kwargs)
        files.append(f)
        return f

    monkeypatch.setattr(parsers, "SpooledTemporaryFile", capture)

    async def scenario(length):
        chunks = iter([b'--BOUNDARY\r\nContent-Disposition: form-data; name="file"; filename="a"\r\n\r\n',
                       b"x" * 2048])

        async def receive():
            return {"type": "http.request", "body": next(chunks), "more_body": True}

        sent = await call(app_with_limits(max_bytes=1024), receive, length=length)
        assert sent[0]["status"] == 413
        assert len([m for m in sent if m["type"] == "http.response.start"]) == 1

    for length in (None, b"1"):
        asyncio.run(scenario(length))
    assert files and all(f.closed for f in files)


def test_slow_form_times_out_and_releases_slot():
    async def scenario():
        app = app_with_limits(timeout=0.01, max_concurrent=1)

        async def receive():
            await asyncio.Event().wait()

        sent = await call(app, receive)
        assert sent[0]["status"] == 408
        assert app.active == 0

    asyncio.run(scenario())


def test_excess_concurrent_forms_are_rejected_without_reading():
    async def scenario():
        entered, release = asyncio.Event(), asyncio.Event()

        async def inner(scope, receive, send):
            entered.set()
            await release.wait()

        app = FormLimitsMiddleware(inner, max_concurrent=1)

        async def forbidden_receive():
            raise AssertionError("Отвергнутую форму не читаем")

        first = asyncio.create_task(call(app, forbidden_receive))
        await entered.wait()
        sent = await call(app, forbidden_receive)
        assert sent[0]["status"] == 503
        release.set()
        await first
        assert app.active == 0

    asyncio.run(scenario())


def test_urlencoded_and_invalid_length():
    async def scenario():
        async def receive():
            return {"type": "http.request", "body": b"x" * 20, "more_body": False}

        async def inner(scope, receive, send):
            await receive()

        app = FormLimitsMiddleware(inner, max_bytes=10)
        assert (await call(app, receive, b"application/x-www-form-urlencoded"))[0]["status"] == 413
        assert (await call(app, receive, length=b"-1"))[0]["status"] == 400

    asyncio.run(scenario())


def test_non_form_requests_are_unchanged():
    async def scenario():
        async def inner(scope, receive, send):
            await send({"type": "http.response.start", "status": 202, "headers": []})

        async def receive():
            raise AssertionError

        sent = await call(FormLimitsMiddleware(inner), receive, b"application/json", b"999999999")
        assert sent[0]["status"] == 202

    asyncio.run(scenario())
