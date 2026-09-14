"""§23 hardening (2026-09-14): an OTP code must not be usable twice, even
under concurrent verify requests for the same phone/email.

Root cause: api/registration.py's email_verify/wa_verify used to call
reg_dal.check_code(phone, code) and, only on success, call
reg_dal.delete_code(phone) as a SEPARATE follow-up -- two independent
get_conn() transactions with an open window between them. N concurrent
verify requests carrying the same still-valid code could all pass
check_code() before any of them got around to deleting the row, and each
would go on to mint its own session -- a real one-time-use violation, not
just a theoretical one (SQLite's own default connection-per-call pattern in
this codebase means there is no implicit cross-request lock preventing it).

Fix: database/registration_dal.consume_code() does validation AND deletion
in one get_conn() transaction, and the DELETE's rowcount -- not the earlier
SELECT -- is the single source of truth for "did this call win". This test
races many threads against one saved code and asserts exactly one wins.

No artificial synchronization/sleep is needed: the property under test is
structural (a single atomic DELETE), not timing-dependent -- SQLite
serializes concurrent writers on the same row (WAL + busy_timeout, see
db.py), so a threading.Barrier releasing every thread at once reliably
exercises the real contention this fix closes.
"""
import threading
from pathlib import Path

import pytest


@pytest.fixture()
def isolated_db(tmp_path, monkeypatch):
    import config
    db_path = str(tmp_path / "otp_race.db")
    monkeypatch.setattr(config, "DB_PATH", db_path)

    from database import db as ddb
    ddb.init_db()
    from database import registration_dal as reg_dal
    reg_dal.init_registration_schema()
    return reg_dal


def test_otp_code_cannot_be_consumed_twice_under_concurrent_verify(isolated_db):
    reg_dal = isolated_db
    phone = "+70000000001"
    code = "482913"
    reg_dal.save_code(phone, code)

    n = 20
    results = [None] * n
    barrier = threading.Barrier(n)

    def worker(i):
        barrier.wait()  # release every thread at (as close as possible to) once
        results[i] = reg_dal.consume_code(phone, code)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    winners = sum(1 for r in results if r)
    assert winners == 1, f"expected exactly one winning consume_code() call, got {winners}: {results}"

    # The row must be gone afterward -- not left in some half-consumed state
    # a retry could exploit.
    from database.db import get_conn
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM verification_codes WHERE phone = ?", (phone,)
        ).fetchone()
    assert row is None


def test_wrong_code_never_consumes_the_real_one(isolated_db):
    """Non-regression: a wrong-code attempt racing a correct one must not
    accidentally delete the row out from under the correct attempt (both
    reference the same phone; only the code differs)."""
    reg_dal = isolated_db
    phone = "+70000000002"
    real_code = "111222"
    reg_dal.save_code(phone, real_code)

    results = {}
    barrier = threading.Barrier(2)

    def try_wrong():
        barrier.wait()
        results["wrong"] = reg_dal.consume_code(phone, "999999")

    def try_right():
        barrier.wait()
        results["right"] = reg_dal.consume_code(phone, real_code)

    t1 = threading.Thread(target=try_wrong)
    t2 = threading.Thread(target=try_right)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert results["wrong"] is False
    assert results["right"] is True


def test_consume_code_replaces_the_two_step_check_then_delete_pattern_in_registration_endpoints():
    """Structural guard: api/registration.py's email_verify/wa_verify must
    call the atomic consume_code(), not the old separate check_code() +
    delete_code() pair -- a future edit reverting to the two-step pattern
    would silently reopen the race this file locks down."""
    import inspect
    from api import registration

    email_src = inspect.getsource(registration.email_verify)
    wa_src = inspect.getsource(registration.wa_verify)
    assert "reg_dal.consume_code(" in email_src
    assert "reg_dal.consume_code(" in wa_src
    # The old pattern must not have crept back in for the real-code path
    # (BETA/reviewer bypass branches never touch verification_codes at all).
    assert "reg_dal.check_code(" not in email_src
    assert "reg_dal.check_code(" not in wa_src
