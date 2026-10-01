#!/usr/bin/env bash
# Daily backup of the production DB + storage files → encrypted → Google Drive (FY-System-Backups).
# Runs from cron on the Oracle VM (see CLAUDE.md "Backups"). Needs on the VM, outside git:
#   ~/fy-backup/passphrase   gpg passphrase (Doppler infra: BACKUP_PASSPHRASE), chmod 600
#   ~/fy-backup/rclone/rclone.conf   rclone "gdrive" remote (scope drive.file), chmod 600
#   ~/fy-backup/alert.env    TELEGRAM_BOT_TOKEN + ALERT_CHAT_ID for the failure message
# Restore: gpg -d fy-backup_<ts>.tar.gpg | tar x  →  pg_restore -d postgres fy_<ts>.dump ; tar xzf storage_<ts>.tgz
set -euo pipefail
cd "$HOME/fy-backup"
TS=$(date -u +%Y%m%d_%H%M%S)
OUT="$HOME/backups"
mkdir -p "$OUT"

alert() {
  # shellcheck disable=SC1091
  [ -f alert.env ] && . ./alert.env && [ -n "${ALERT_CHAT_ID:-}" ] && curl -s -m 20 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${ALERT_CHAT_ID}" --data-urlencode "text=$1" >/dev/null || true
}
MENTION="@oyatillonabijonov"
trap 'alert "⚠️ FY-System: kunlik zaxira OLINMADI ($TS UTC). Log: ~/fy-backup/backup.log $MENTION"' ERR

# 1. Database (includes the storage.objects metadata)
# _realtime = Realtime's own bookkeeping (owner supabase_admin, unreadable to postgres); its migrate + seed rebuild it
docker exec supabase-db-1 pg_dump -U postgres -d postgres -Fc --exclude-schema=_realtime -f /tmp/fy_auto.dump
docker cp supabase-db-1:/tmp/fy_auto.dump "$OUT/fy_$TS.dump"
docker exec supabase-db-1 rm -f /tmp/fy_auto.dump
# 2. Uploaded files (receipts, task files, images)
docker run --rm -v supabase_storage-data:/d:ro -v "$OUT":/out alpine tar czf "/out/storage_$TS.tgz" -C /d .
# 3. One encrypted bundle
tar cf - -C "$OUT" "fy_$TS.dump" "storage_$TS.tgz" \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-file passphrase --symmetric --cipher-algo AES256 -o "$OUT/fy-backup_$TS.tar.gpg"
rm -f "$OUT/storage_$TS.tgz"
# 4. Off the server
RCLONE=(docker run --rm -v "$HOME/fy-backup/rclone:/config/rclone" -v "$OUT":/data:ro rclone/rclone)
if ! up=$("${RCLONE[@]}" copy "/data/fy-backup_$TS.tar.gpg" gdrive:FY-System-Backups 2>&1); then
  echo "$up"
  # The Google key (rclone token / shared client id) expired or was revoked: say exactly that
  if echo "$up" | grep -qiE 'invalid_grant|invalid_client|unauthorized_client|token.*(expired|revoked)|oauth2'; then
    trap - ERR
    alert "🔑 FY-System: Google Drive kaliti muddati tugadi — zaxira Drive'ga yuklanmadi (serverda saqlandi). Kalitni yangilash kerak (CLAUDE.md → Backups). $MENTION"
    exit 1
  fi
  false
fi
"${RCLONE[@]}" delete gdrive:FY-System-Backups --min-age 60d
# 5. Keep two weeks locally
find "$OUT" -name 'fy-backup_*.tar.gpg' -mtime +14 -delete
find "$OUT" -name 'fy_*.dump' -mtime +30 -delete
# 6. Tell /hooks/health the backup is fresh
docker exec supabase-db-1 psql -U postgres -d postgres -qc \
  "insert into amo_sync_state (key, value, updated_at) values ('backup_last_ok', now()::text, now()) on conflict (key) do update set value = excluded.value, updated_at = now()"
echo "$(date -u +%FT%TZ) ok fy-backup_$TS.tar.gpg $(du -h "$OUT/fy-backup_$TS.tar.gpg" | cut -f1)"
