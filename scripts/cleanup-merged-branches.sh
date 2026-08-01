#!/usr/bin/env bash
# Удаление веток, ПОЛНОСТЬЮ влитых в main (их работа уже в main — терять нечего).
# Запускать со СВОЕЙ машины, где есть push-доступ к GitHub (в облачной среде
# агента удаление рефов блокирует прокси).
#
#   bash scripts/cleanup-merged-branches.sh            # dry-run: только показать
#   bash scripts/cleanup-merged-branches.sh --yes      # реально удалить
#
# Защищены (никогда не удаляются): main, рабочая ветка, release/*, build-*,
# reserv, integration/build-30. Не-влитые ветки НЕ трогаются вообще.
set -euo pipefail

DO_IT="${1:-}"
git fetch origin --prune -q

PROTECT='^(main|claude/youthful-cerf-barf3|release/.*|build-.*|reserv|integration/build-30)$'

mapfile -t BRANCHES < <(
  git branch -r --merged origin/main \
    | grep -v HEAD \
    | sed 's#origin/##; s/^[[:space:]]*//' \
    | grep -vE "$PROTECT" \
    | sort -u
)

echo "Влито в main и под удаление: ${#BRANCHES[@]}"
printf '  %s\n' "${BRANCHES[@]}"

if [ "$DO_IT" != "--yes" ]; then
  echo
  echo "DRY-RUN. Чтобы удалить — запусти:  bash $0 --yes"
  exit 0
fi

echo
for b in "${BRANCHES[@]}"; do
  echo "удаляю origin/$b …"
  git push origin --delete "$b" || echo "  ! не удалось: $b (пропускаю)"
done
echo "Готово. Осталось веток на origin:"
git branch -r | grep -v HEAD | wc -l
