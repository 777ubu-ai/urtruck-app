#!/usr/bin/env python3
"""Локальный mock-бенчмарк ACK/backoff: старый и кандидатный adapter.

Не обращается к сети, QA2, Telegram или реальным базам; не измеряет серверную
пропускную способность. Один повторяемый набор: 50 сегментов, API отвечает
49 created + 1 expired, выполняются два последовательных flush.
"""
import argparse
import json
import os
import subprocess
import sys
import io
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HARNESS = r'''
import json, os, sqlite3, tempfile, time
from datetime import datetime, timezone
from services.external_freight_import_adapter import ExternalFreightFeedAdapter
clock=[1792576800.0]; stats={"writes":0,"transactions":0,"requests":0,"request_ms":[]}; active=[False]
connect=sqlite3.connect
def traced(*args, **kwargs):
    db=connect(*args, **kwargs)
    def trace(sql):
        if active[0]:
            op=sql.strip().split(None,1)[0].upper() if sql.strip() else ""
            if op in {"INSERT","UPDATE","DELETE","REPLACE"}: stats["writes"]+=1
            if op=="BEGIN": stats["transactions"]+=1
    db.set_trace_callback(trace)
    return db
sqlite3.connect=traced
class Response:
    status=200
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def read(self):
        return json.dumps({"results":[{"id":str(i),"result":"created"} for i in range(49)]+[{"id":"expired","result":"expired"}]}).encode()
def opener(request, timeout):
    stats["requests"]+=1; t=time.perf_counter(); time.sleep(.002)
    stats["request_ms"].append(round((time.perf_counter()-t)*1000,3)); return Response()
p=tempfile.mktemp(prefix="feed-bench-",suffix=".sqlite3")
a=ExternalFreightFeedAdapter(db_path=p,api_url="https://qa2.urtruck.kz",importer_key="fixture",opener=opener,clock=lambda:clock[0])
date=datetime.fromtimestamp(clock[0],timezone.utc).isoformat()
for i in range(50): a.enqueue({"source_id":"fixture","source_message_id":str(i),"segment_id":"0","source_published_at":date,"kind":"cargo","status":"active","original_text":"Обезличенная тестовая заявка"})
active[0]=True; t=time.perf_counter(); first=a.flush_once(); clock[0]+=10; second=a.flush_once(); elapsed=round((time.perf_counter()-t)*1000,3); active[0]=False
terminal_count=getattr(a,"terminal_expired_count",lambda:0)()
print(json.dumps({"first_status":first.get("status"),"second_status":second.get("status"),"pending_after":a.pending_count(),"terminal_expired_after":terminal_count,"api_requests":stats["requests"],"request_ms":stats["request_ms"],"sqlite_write_statements":stats["writes"],"sqlite_transactions":stats["transactions"],"two_flushes_ms":elapsed},sort_keys=True))
os.unlink(p)
for s in (".flush.lock",".bridge.lock"):
    try: os.unlink(p+s)
    except FileNotFoundError: pass
'''


def extract(revision, directory):
    archive = subprocess.check_output(
        ["git", "archive", "--format=tar", revision, "backend/services"], cwd=ROOT
    )
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as source:
        source.extractall(directory, filter="data")


def run(revision, parent):
    directory = parent / revision
    directory.mkdir()
    extract(revision, directory)
    env = dict(os.environ)
    env["PYTHONPATH"] = str(directory / "backend")
    env["EXTERNAL_FREIGHT_IMPORT_ENABLED"] = "true"
    return json.loads(subprocess.check_output([sys.executable, "-c", HARNESS], cwd=ROOT, env=env, text=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-sha", default="4a524b31ac97d8ecd57e7463352160244fe7a41b")
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="urtruck-feed-bench-") as temporary:
        root = Path(temporary)
        result = {"scope":"local synthetic mock only; not QA2 throughput", "rows":50,
                  "api_outcomes":{"created":49,"expired":1},
                  "baseline_sha":args.baseline_sha,"candidate_sha":args.candidate_sha,
                  "baseline":run(args.baseline_sha,root),"candidate":run(args.candidate_sha,root)}
    encoded=json.dumps(result,indent=2,sort_keys=True)+"\n"
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(encoded)
    print(encoded,end="")


if __name__ == "__main__":
    main()
