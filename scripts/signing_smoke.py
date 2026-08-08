#!/usr/bin/env python3
"""Signed-document smoke для проверки FILE_SIGNING_KEY на сервере.
Читает ключ из окружения (FILE_SIGNING_KEY), гоняет sign→verify→tamper→expired
через реально задеплоенный services.file_signing. Печатает ТОЛЬКО результаты,
НИКОГДА само значение ключа. Запуск: cd <BACKEND_DIR> && python3 signing_smoke.py
Exit != 0 при провале.
"""
import sys
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, ".")
from services import file_signing as fs  # noqa: E402

u = fs.sign("/security/storage/licenses/smoke.jpg", ttl=60)
q = parse_qs(urlparse(u).query)
key = fs.extract_key(u)
legit = fs.verify(key, q["exp"][0], q["sig"][0])
bad_sig = ("0" if q["sig"][0][0] != "0" else "1") + q["sig"][0][1:]
tampered = fs.verify(key, q["exp"][0], bad_sig)
expired = fs.verify(key, str(int(q["exp"][0]) - 3600 - 120), q["sig"][0])

print("legit_ok=" + str(legit))
print("tampered_rejected=" + str(not tampered))
print("expired_rejected=" + str(not expired))
assert legit and not tampered and not expired, "SIGNING_SMOKE_FAILED"
print("SIGNING_SMOKE=ok")
