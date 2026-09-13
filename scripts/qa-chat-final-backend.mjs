#!/usr/bin/env node
/**
 * qa:chat-final — бэкенд-часть.
 *
 * Прогоняет release-critical подмножество backend pytest: chat / deal room /
 * voice-STT / push / перевод / unread-бейдж / security-guards.
 *
 * ВАЖНО: каждый test_*.py запускается ОТДЕЛЬНЫМ процессом pytest, а не одним
 * общим прогоном. Проверено эмпирически (2026-09-13, QA harness pass): часть
 * файлов из этого набора (test_security_deal_room_idor_release_qa.py,
 * test_account_deletion_security.py) падает при совместном запуске в одной
 * pytest-сессии — они используют module-level STATE/фиксированные id поверх
 * общей SQLite (см. backend/tests/conftest.py про DB_PATH shared между
 * файлами), и коллизия с другими файлами из этого же списка даёт ложные
 * 404/409. По отдельности — все проходят чисто. Отдельные процессы стоят
 * дороже по времени, но не дают ложных провалов релизного гейта.
 *
 * Использует venv, который уже стоит в scratchpad QA-сессии (pytest +
 * backend/requirements.txt), если он существует; иначе падает на системный
 * `python3 -m pytest` (CI-контейнеры backend обычно имеют requirements
 * поставленными в системный python).
 *
 * Изоляция БД: backend/tests/conftest.py по умолчанию кладёт все test-модули
 * на ОДИН файл (/tmp/urtruck_tests_badge_suite.db), рассчитывая, что они все
 * идут в одной pytest-сессии. Здесь же каждый файл — отдельный процесс, и
 * повторные локальные прогоны этого скрипта иначе делят один и тот же
 * /tmp-файл между процессами разных прогонов (случайно словили
 * "OperationalError"/лишний conflict-ряд из предыдущего запуска). Поэтому
 * каждому файлу выдаётся СВОЙ DB_PATH в отдельной scratch-директории,
 * которая целиком удаляется и создаётся заново перед прогоном.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(REPO_ROOT, "backend");

// Release-critical подмножество: чат / deal room / voice-STT / push /
// перевод / unread-бейдж / security-guards. Пути — относительно backend/.
const TEST_FILES = [
  "tests/test_deal_rooms.py",
  "tests/test_fresh_db_chat_startup.py",
  "tests/test_security_deal_room_idor_release_qa.py",
  "tests/test_stt_contract.py",
  "tests/test_translation_fail_closed.py",
  "tests/test_unread_badge.py",
  "tests/test_unread_deduplication.py",
  "tests/test_push_idempotency.py",
  "tests/test_push_outbox_drain.py",
  "tests/test_push_receipts_poll.py",
  "tests/test_push_delivery_regressions.py",
  "tests/test_push_delivery_release_gate.py",
  "tests/test_push_anonymous_ownership_guard.py",
  "tests/test_push_token_security.py",
  "tests/test_push_event_matrix_contract.py",
  "tests/test_live_deal_push_lifecycle.py",
  "tests/test_attachment_push.py",
  "tests/test_logout_push_cleanup.py",
  "tests/test_production_security_guards.py",
  "tests/test_track1b_security.py",
  "tests/test_storage_path_security.py",
  "tests/test_otp_verify_security.py",
  "tests/test_account_deletion_security.py",
];

function resolvePython() {
  // 1) явный override
  if (process.env.QA_CHAT_FINAL_PYTHON && existsSync(process.env.QA_CHAT_FINAL_PYTHON)) {
    return process.env.QA_CHAT_FINAL_PYTHON;
  }
  // 2) venv из QA-сессии (scratchpad), если сохранился между сессиями
  const scratchVenv = process.env.QA_CHAT_FINAL_VENV;
  if (scratchVenv && existsSync(path.join(scratchVenv, "bin", "python"))) {
    return path.join(scratchVenv, "bin", "python");
  }
  // 3) venv рядом с backend/ (типичное локальное имя)
  const localVenv = path.join(BACKEND_DIR, ".venv", "bin", "python");
  if (existsSync(localVenv)) return localVenv;
  // 4) системный python3 — рабочий вариант для CI-образов, где
  //    requirements.txt уже стоит глобально.
  return "python3";
}

const PYTHON = resolvePython();

// Отдельная scratch-директория для БД этого прогона — не production-путь,
// не общий /tmp-файл conftest'а. Session-scratchpad в приоритете (изолирован
// от других параллельных QA-сессий); иначе — os.tmpdir().
const RUN_DB_DIR =
  process.env.QA_CHAT_FINAL_SCRATCH ||
  path.join(os.tmpdir(), "urtruck-qa-chat-final-db");
rmSync(RUN_DB_DIR, { recursive: true, force: true });
mkdirSync(RUN_DB_DIR, { recursive: true });

console.log(`[qa:chat-final:backend] python = ${PYTHON}`);
console.log(`[qa:chat-final:backend] db scratch dir = ${RUN_DB_DIR}`);
console.log(`[qa:chat-final:backend] ${TEST_FILES.length} файлов, каждый — отдельным процессом pytest`);

const failures = [];
let totalPassed = 0;
let totalFailed = 0;

for (const file of TEST_FILES) {
  const abs = path.join(BACKEND_DIR, file);
  if (!existsSync(abs)) {
    console.error(`[qa:chat-final:backend] ПРОПУЩЕН (файл не найден): ${file}`);
    failures.push({ file, reason: "missing" });
    continue;
  }
  const dbPath = path.join(RUN_DB_DIR, `${path.basename(file, ".py")}.db`);
  const res = spawnSync(PYTHON, ["-m", "pytest", file, "-q"], {
    cwd: BACKEND_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: {
      ...process.env,
      // Переопределяет conftest.py's setdefault — свой файл БД на каждый
      // test-модуль/процесс, никогда не /home/ubuntu (production).
      DB_PATH: dbPath,
      ENV: "test",
      URTRUCK_ENV: "test",
    },
  });
  const out = (res.stdout || "") + (res.stderr || "");
  const summaryLine = out.trim().split("\n").filter(Boolean).slice(-1)[0] || "";
  if (res.status !== 0) {
    console.error(`[qa:chat-final:backend] FAIL  ${file}  ->  ${summaryLine}`);
    console.error(out.split("\n").slice(-40).join("\n"));
    failures.push({ file, reason: "pytest-fail", summary: summaryLine });
  } else {
    console.log(`[qa:chat-final:backend] PASS  ${file}  ->  ${summaryLine}`);
  }
  const m = /(\d+) passed/.exec(out);
  const f = /(\d+) failed/.exec(out);
  if (m) totalPassed += parseInt(m[1], 10);
  if (f) totalFailed += parseInt(f[1], 10);
}

console.log("");
console.log(`[qa:chat-final:backend] итого: ${totalPassed} passed, ${totalFailed} failed, ${failures.length} файлов с проблемой из ${TEST_FILES.length}`);

if (failures.length > 0) {
  console.error("[qa:chat-final:backend] ЕСТЬ ПРОВАЛЫ:");
  for (const f of failures) console.error(`  - ${f.file}: ${f.reason}${f.summary ? " (" + f.summary + ")" : ""}`);
  process.exit(1);
}

console.log("[qa:chat-final:backend] OK — весь release-critical backend-набор прошёл.");
