"""Изолированная проверка настоящих ASGI GET-маршрутов. Production недоступен."""
import os, sys, tempfile, socket, sqlite3, json, time, statistics
from pathlib import Path
repo = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
sandbox = Path(tempfile.mkdtemp(prefix="urtruck-capacity-20261015-")).resolve()
dbpath = sandbox / "synthetic.sqlite"
# Ни секреты оболочки, ни production .env в процесс не переносятся.
os.environ.clear()
os.environ.update(PATH="/usr/bin:/bin", HOME=str(sandbox), URTRUCK_ENV="test",
 ENV="test", DB_PATH=str(dbpath), URTRUCK_TEST_HARNESS_OWNS_DB="1",
 FILE_SIGNING_KEY="capacity-only-signing-key-not-for-production")
original_connect = sqlite3.connect
def connect(database, *a, **kw):
    assert Path(database).resolve() == dbpath, "Запрещена другая база"
    return original_connect(database, *a, **kw)
sqlite3.connect = connect
original_socket_connect = socket.socket.connect
def socket_connect(sock, address):
    if sock.family in (socket.AF_INET, socket.AF_INET6):
        raise RuntimeError("Сеть отключена в capacity probe")
    return original_socket_connect(sock, address)
socket.socket.connect = socket_connect
socket.socket.connect_ex = socket_connect
sys.path.insert(0, str(repo / "backend"))
from tests import test_market_dashboard as harness
from database.db import get_conn
from config import DB_PATH, IS_PRODUCTION
assert Path(DB_PATH).resolve() == dbpath and not IS_PRODUCTION
with get_conn() as c:
    c.executemany("""INSERT INTO cargos
     (id,owner_id,owner_name,from_city,to_city,cargo_desc,cargo_type,
      price,pickup_date,published_at,created_at,status)
     VALUES (?,?,'Перевозчик','Almaty','Astana','Мебель','tent',
      10000,'2099-01-01','2026-10-15 00:00:00','2026-10-15 00:00:00','active')""",
     [(f"capacity-cargo-{i:05d}", "capacity-client") for i in range(5000)])
    c.executemany("""INSERT INTO trips
     (id,driver_id,driver_name,from_city,to_city,truck_type,price,
      departure,published_at,created_at,status)
     VALUES (?,?,'Перевозчик','Almaty','Astana','tent',10000,
     '2099-01-01','2026-10-15 00:00:00','2026-10-15 00:00:00','active')""",
     [(f"capacity-trip-{i:05d}", "capacity-driver") for i in range(5000)])
result = {"sha": __import__("subprocess").check_output(["/usr/bin/git","-C",str(repo),"rev-parse","HEAD"],text=True).strip(),
 "working_diff_sha256": __import__("hashlib").sha256(__import__("subprocess").check_output(["/usr/bin/git","-C",str(repo),"diff","--binary","HEAD"])).hexdigest(),
 "database":str(dbpath),"outbound_network":"blocked","seed":{"cargos":5000,"trips":5000},
 "scope":"In-process ASGI на Mac; не нагрузка production и не native FPS/память"}
def request(url,uid="capacity-client",role="client"):
    harness.as_user(uid, role)
    started = time.perf_counter()
    r = harness.client.get("/api/v1/market"+url)
    elapsed=(time.perf_counter()-started)*1000
    assert r.status_code==200, (r.status_code,r.text[:300])
    return r.json(),elapsed,len(r.content)
for kind,uid,role,key in [("cargo","capacity-client","client","my_cargos"),("trip","capacity-driver","driver","my_trips")]:
    timings=[]
    for i in range(12):
        data,ms,size=request("/my",uid,role)
        timings.append(ms)
    result[kind]={"dashboard_visible":len(data[key]),"payload_bytes":size,
      "p50_ms":round(statistics.median(timings[2:]),2),
      "p95_ms":round(sorted(timings[2:])[-1],2)}
    # Новый route проверяется при наличии; старый baseline фиксируется отдельно.
    if any(getattr(r,"path","")=="/api/v1/market/my/listings" for r in harness.app.routes):
        ids=[]; timings=[]; sizes=[]; offset=0
        while True:
            page,ms,size=request(f"/my/listings?kind={kind}&section=active&limit=50&offset={offset}",uid,role)
            assert page["total"]==5000
            ids.extend(x["id"] for x in page["items"])
            timings.append(ms);sizes.append(size)
            if page["next_offset"] is None:break
            assert page["next_offset"]>offset
            offset=page["next_offset"]
        assert len(ids)==len(set(ids))==5000
        result[kind]["paged"]={"unique_records":len(set(ids)),"requests":len(timings),
          "page_bytes_max":max(sizes),"p50_ms":round(statistics.median(timings),2),
          "p95_ms":round(sorted(timings)[int(.95*(len(timings)-1))],2)}
with get_conn() as c:
    c.execute("UPDATE cargos SET status='unpublished' WHERE id IN (SELECT id FROM cargos ORDER BY created_at DESC LIMIT 100)")
data,_,_=request("/my")
result["archive_masks_active_baseline"]={"active_in_database":4900,
 "active_in_dashboard":sum(x["status"]=="active" for x in data["my_cargos"])}
if any(getattr(r,"path","")=="/api/v1/market/my/listings" for r in harness.app.routes):
    active,_,_=request("/my/listings?kind=cargo&section=active")
    archive,_,_=request("/my/listings?kind=cargo&section=archive")
    assert active["total"]==4900 and archive["total"]==100 and len(active["items"])==50
    third,_,_=request("/my/listings?kind=cargo&section=active","capacity-outsider")
    assert third["items"]==[] and third["total"]==0
    result["archive_and_owner_isolation"]="PASS"
# Второй сценарий: 5000 грузоотправителей + 5000 водителей, по одному объявлению.
from database import reviews_dal
reviews_dal.init_reviews_schema()
with get_conn() as c:
    for role in ('client', 'driver'):
        c.executemany("INSERT INTO drivers_registration(id,role,full_name,status,verification_level) VALUES (?,?,'Перевозчик','approved',3)",
                      [(f"capacity-{role}-{i:05d}",role) for i in range(5000)])
    c.executemany("UPDATE cargos SET owner_id=?, status='active' WHERE id=?",
                  [(f"capacity-client-{i:05d}",f"capacity-cargo-{i:05d}") for i in range(5000)])
    c.executemany("UPDATE trips SET driver_id=? WHERE id=?",
                  [(f"capacity-driver-{i:05d}",f"capacity-trip-{i:05d}") for i in range(5000)])
result['distributed_accounts'] = {'clients':5000,'drivers':5000}
for resource in ['cargos','trips']:
    ids=[]; timings=[]; sizes=[]; offset=0
    while True:
        data,ms,size=request(f'/{resource}?limit=50&offset={offset}')
        ids.extend(x['id'] for x in data[resource]); timings.append(ms); sizes.append(size)
        if resource=='trips': assert all(x['driver_verified'] for x in data[resource])
        if data.get('next_offset') is None:break
        assert data['next_offset']>offset
        offset=data['next_offset']
    assert len(ids)==len(set(ids))==5000
    result['distributed_accounts'][resource] = {'unique_records':len(ids),'requests':len(timings),
      'page_bytes_max':max(sizes),'p50_ms':round(statistics.median(timings),2),
      'p95_ms':round(sorted(timings)[int(.95*(len(timings)-1))],2)}
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(result,ensure_ascii=False,indent=2))
