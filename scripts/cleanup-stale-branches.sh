#!/usr/bin/env bash
# Удаление НЕ-влитых, но мёртвых веток (их работа устарела/уже в main/дубль).
# Разбор 38 неслитых веток от 27.07.2026. Запускать со СВОЕЙ машины — в
# облачной среде агента удаление рефов блокирует прокси.
#
#   bash scripts/cleanup-stale-branches.sh          # dry-run: только показать
#   bash scripts/cleanup-stale-branches.sh --yes    # реально удалить
#
# Список ниже — только те ветки, по которым терять нечего:
#   • TIER 1 — содержимое уже в main (git cherry: 0 уникальных коммитов);
#   • TIER 2 — старая линейная dev-цепочка stage5…stage18 + ui-redesign
#     (4–6 мая, отстали от main на 645 коммитов, stage18 — надмножество всех);
#   • TIER 3 — точный дубль (testPrepPlayCons побайтово == ADG1, оставляем ADG1).
#
# НЕ входят сюда и НЕ трогаются (решает владелец отдельно): свежие build-38/39,
# claude/biz-chat-inquiry-6v7qi2 (26 июля, крупная), а также старые feature/fix
# ветки мая–июня с уникальным несмёрженным кодом — см. блок REVIEW в конце.
set -euo pipefail

DO_IT="${1:-}"
git fetch origin --prune -q

# ── Подтверждённо мёртвые ветки ──────────────────────────────────────────────
STALE=(
  # TIER 1 — содержимое полностью в main
  design-system-phase1
  design-system-phase2a-ui-polish
  feature/driver-verification-selfie-step
  stage45-46-guest-phone
  stage48-otp-honest-response
  # TIER 2 — старая dev-цепочка stage5…stage18 + ui-redesign
  ui-redesign
  stage5-production-hardening-ui-i18n
  stage6-ui-theme-polish
  stage7-forms-geo-cleanup
  stage8-product-completion-polish
  stage9-role-cta-ux-audit
  stage10-shipper-trip-bid
  stage11-final-product-polish-audit
  stage12-shipper-trip-crash-fix
  stage13-deeper-hardening
  stage14-mobile-qa-lane
  stage15-final-polish
  stage16-visual-quietness
  stage17-detail-ux-polish
  stage18-full-image-role-screen
  # TIER 3 — точный дубль ADG1
  testPrepPlayCons
)

echo "Под удаление (мёртвые): ${#STALE[@]}"
printf '  %s\n' "${STALE[@]}"

if [ "$DO_IT" != "--yes" ]; then
  echo
  echo "DRY-RUN. Чтобы удалить — запусти:  bash $0 --yes"
  echo
  echo "REVIEW (решить вручную, НЕ удаляются этим скриптом — есть уникальный код):"
  echo "  audit-roles-and-registration  chore-gitignore-native-folders"
  echo "  claude/epic-goodall-7dR7Z  claude/fix-loader-race-condition"
  echo "  claude/profile-wechat-redesign  claude/qa-testing-urtruck-EiRlA"
  echo "  feat/qa-chat-and-observability  feat/rc2-otp-role-profile"
  echo "  feature/border-queue-audit  fix/client-deal-chat-flow"
  echo "  fix/driver-verification-onboarding  fix/marketplace-cargo-form-and-bid-basics"
  echo "  release/1.0.1-android-build-78  ADG1"
  echo "  (оставить как есть: build-38-1.0.2  build-39-1.0.2  claude/biz-chat-inquiry-6v7qi2)"
  exit 0
fi

echo
for b in "${STALE[@]}"; do
  git rev-parse --verify "origin/$b" >/dev/null 2>&1 || { echo "пропуск (нет): $b"; continue; }
  echo "удаляю origin/$b …"
  git push origin --delete "$b" || echo "  ! не удалось: $b (пропускаю)"
done
echo "Готово. Осталось веток на origin:"
git branch -r | grep -v HEAD | wc -l
