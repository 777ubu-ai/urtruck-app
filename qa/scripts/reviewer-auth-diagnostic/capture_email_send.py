import json
import os
import time

from mitmproxy import ctx, http


OUT = os.environ["MITM_EVENTS_JSONL"]


def append(event):
    with open(OUT, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=True) + "\n")


class ReviewerAuthCapture:
    def request(self, flow: http.HTTPFlow) -> None:
        req = flow.request
        if req.pretty_host != "urtruck.kz":
            return
        if not req.path.startswith("/api/v1/register/email/send"):
            return
        append(
            {
                "kind": "request",
                "ts": time.time(),
                "method": req.method,
                "host": req.pretty_host,
                "path": req.path,
            }
        )
        ctx.log.info(f"REVIEWER_DIAG_HTTP_REQUEST {req.method} {req.pretty_host}{req.path}")

    def response(self, flow: http.HTTPFlow) -> None:
        req = flow.request
        if req.pretty_host != "urtruck.kz":
            return
        if not req.path.startswith("/api/v1/register/email/send"):
            return
        append(
            {
                "kind": "response",
                "ts": time.time(),
                "method": req.method,
                "host": req.pretty_host,
                "path": req.path,
                "status_code": flow.response.status_code,
            }
        )
        ctx.log.info(
            f"REVIEWER_DIAG_HTTP_RESPONSE {flow.response.status_code} {req.method} {req.pretty_host}{req.path}"
        )


addons = [ReviewerAuthCapture()]
