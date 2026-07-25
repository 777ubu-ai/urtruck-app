#!/usr/bin/env bash
# =====================================================================
# Biz Chat — сборка iOS и заливка в TestFlight с локального Mac.
# =====================================================================
# ЗАПУСК на Mac (не на Linux!):
#   cd urtruck-app/bizchat/mobile/ios
#   ./upload-testflight.sh
#
# Что нужно на Mac (проверяется ниже автоматически):
#   - Xcode (из App Store) + Command Line Tools
#   - Flutter SDK           (https://docs.flutter.dev/get-started/install/macos)
#   - CocoaPods             (sudo gem install cocoapods  или  brew install cocoapods)
#   - fastlane              (brew install fastlane       или  gem install fastlane)
#
# Ключи App Store Connect API (задать перед запуском — export или ниже в файле):
#   export ASC_KEY_ID=XXXXXXXXXX
#   export ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#   export APPLE_TEAM_ID=XXXXXXXXXX
#   export ASC_KEY_P8_PATH=~/Downloads/AuthKey_XXXXXXXXXX.p8
#
# ПРЕДВАРИТЕЛЬНО: в App Store Connect создано приложение с bundle id app.bizchat.
# =====================================================================
set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GRN}[i]${NC} $*"; }
warn() { echo -e "${YLW}[!]${NC} $*"; }
die()  { echo -e "${RED}[x]${NC} $*" >&2; exit 1; }

# --- 0. Проверка платформы ---
[[ "$(uname)" == "Darwin" ]] || die "Этот скрипт работает только на macOS. iOS нельзя собрать на Linux/Windows."

# --- 1. Проверка инструментов ---
command -v xcodebuild >/dev/null || die "Не найден Xcode. Установите из App Store и запустите: sudo xcode-select --switch /Applications/Xcode.app"
command -v flutter    >/dev/null || die "Не найден Flutter. Установка: https://docs.flutter.dev/get-started/install/macos"
command -v pod        >/dev/null || die "Не найден CocoaPods. Установка: sudo gem install cocoapods"
command -v fastlane   >/dev/null || die "Не найден fastlane. Установка: brew install fastlane"
info "Инструменты на месте: Xcode, Flutter, CocoaPods, fastlane"

# --- 2. Проверка ключей ---
: "${ASC_KEY_ID:?Задайте ASC_KEY_ID (Key ID из App Store Connect API)}"
: "${ASC_ISSUER_ID:?Задайте ASC_ISSUER_ID (Issuer ID)}"
: "${APPLE_TEAM_ID:?Задайте APPLE_TEAM_ID (Team ID, 10 символов)}"
: "${ASC_KEY_P8_PATH:?Задайте ASC_KEY_P8_PATH — путь к файлу AuthKey_XXXX.p8}"
[[ -f "$ASC_KEY_P8_PATH" ]] || die "Файл ключа не найден: $ASC_KEY_P8_PATH"

# fastlane ждёт содержимое .p8 в base64 через ASC_KEY_CONTENT
export ASC_KEY_CONTENT="$(base64 < "$ASC_KEY_P8_PATH")"

# --- 3. Каталоги ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../bizchat/mobile/ios
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"                 # .../bizchat/mobile
cd "${MOBILE_DIR}"
info "Рабочая папка: ${MOBILE_DIR}"

# --- 4. Номер сборки: текущее время (монотонно растёт, уникально для TestFlight) ---
BUILD_NUMBER="$(date +%Y%m%d%H%M)"
info "Build number: ${BUILD_NUMBER}"

# --- 5. Сборка Dart/Flutter (без подписи) ---
info "flutter pub get…"
flutter pub get
info "flutter build ios (release, без подписи)…"
flutter build ios --release --no-codesign \
  --build-name=1.0.15 --build-number="${BUILD_NUMBER}"

# --- 6. Подпись + экспорт .ipa + заливка в TestFlight (fastlane) ---
cd "${SCRIPT_DIR}"
info "fastlane beta — подпись, экспорт .ipa и загрузка в TestFlight…"
fastlane beta

echo
info "Готово. Сборка ушла в TestFlight — она появится в App Store Connect → TestFlight"
info "через несколько минут (после обработки Apple). Оттуда пригласите тестировщиков."
