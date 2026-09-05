// P1-D (аудит 2026-09-05): контракт fail-closed подписи Android-релиза.
//
// Инцидент-класс: release молча подписывался debug-ключом (тихий фолбэк в
// build.gradle), а build-android-apk.yml публиковал такой APK в GitHub
// Releases как «release» — установившие не могли обновиться на Play-версию.
//
// Контракт:
//  1. android/app/build.gradle содержит taskGraph-guard, который роняет
//     release-сборку GradleException-ом при отсутствии URTRUCK_UPLOAD_*;
//  2. build-android-apk.yml собирает ЯВНО debug-вариант и называет артефакт
//     debug (assembleRelease без ключа там больше нет);
//  3. deploy-play.yml по-прежнему прокидывает ORG_GRADLE_PROJECT_URTRUCK_UPLOAD_*.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const apkWorkflow = fs.readFileSync('.github/workflows/build-android-apk.yml', 'utf8');
const playWorkflow = fs.readFileSync('.github/workflows/deploy-play.yml', 'utf8');

test('build.gradle: release без URTRUCK_UPLOAD_* падает fail-closed', () => {
  assert.ok(gradle.includes('gradle.taskGraph.whenReady'),
    'guard должен быть отложен до графа задач (не ломать debug/config-фазу)');
  assert.ok(/throw new GradleException\(\s*\n?\s*"UrTruck release build REFUSED/.test(gradle),
    'guard обязан кидать GradleException с понятным текстом');
  assert.ok(gradle.includes("URTRUCK_UPLOAD_STORE_FILE"),
    'guard проверяет именно свойство URTRUCK_UPLOAD_STORE_FILE');
  // Guard не должен трогать debug: срабатывание только на Release-тасках.
  assert.ok(/endsWith\('Release'\)/.test(gradle),
    'guard срабатывает только на Release-тасках');
});

test('build-android-apk.yml: явный debug-вариант, артефакт назван debug', () => {
  assert.ok(apkWorkflow.includes('./gradlew assembleDebug'),
    'workflow обязан собирать assembleDebug');
  assert.ok(!apkWorkflow.includes('./gradlew assembleRelease'),
    'assembleRelease без upload-ключа запрещён в этом workflow');
  assert.ok(apkWorkflow.includes('UrTruck-debug.apk'),
    'артефакт обязан быть назван debug — это не релиз');
  assert.ok(apkWorkflow.includes('outputs/apk/debug'),
    'путь артефакта — debug-выход Gradle');
  assert.ok(apkWorkflow.includes('DEBUG'),
    'GitHub Release обязан явно маркироваться как DEBUG-сборка');
});

test('deploy-play.yml: прод-подпись upload-ключом сохранена', () => {
  for (const prop of [
    'ORG_GRADLE_PROJECT_URTRUCK_UPLOAD_STORE_FILE',
    'ORG_GRADLE_PROJECT_URTRUCK_UPLOAD_STORE_PASSWORD',
    'ORG_GRADLE_PROJECT_URTRUCK_UPLOAD_KEY_ALIAS',
    'ORG_GRADLE_PROJECT_URTRUCK_UPLOAD_KEY_PASSWORD',
  ]) {
    assert.ok(playWorkflow.includes(prop), `deploy-play.yml должен передавать ${prop}`);
  }
  assert.ok(playWorkflow.includes('bundleRelease'),
    'прод-.aab собирается bundleRelease именно в deploy-play.yml');
});
