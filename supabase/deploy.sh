#!/usr/bin/env bash
# One-shot backend deploy for IPOBell.
#   export SUPABASE_ACCESS_TOKEN=sbp_...   (Supabase → Account → Access tokens)
#   ./supabase/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-ehpjxstddpkxijfjelax}"
: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN}"

echo "▸ Linking project $PROJECT_REF"
supabase link --project-ref "$PROJECT_REF" >/dev/null

echo "▸ Applying migrations"
supabase db push

if [ -f supabase/.env ]; then
  echo "▸ Setting Edge Function secrets from supabase/.env"
  supabase secrets set --env-file supabase/.env --project-ref "$PROJECT_REF"
else
  echo "!! supabase/.env not found — copy supabase/.env.example and fill it in" >&2
  exit 1
fi

echo "▸ Deploying Edge Functions"
supabase functions deploy --project-ref "$PROJECT_REF"

echo "▸ Vault secrets (project_url, cron_secret) must exist — see supabase/migrations/20261026000200_cron.sql"
echo "✓ Done. Trigger a first sync with:"
echo "  curl -X POST https://$PROJECT_REF.supabase.co/functions/v1/sync-ipos -H 'x-cron-secret: <CRON_SECRET>' -H 'Content-Type: application/json' -d '{\"full\":true}'"
