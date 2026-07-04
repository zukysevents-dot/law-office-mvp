#!/bin/sh
# Calls one internal cron endpoint with the Bearer secret. The endpoints
# authorize via authorizeCronRequest() and accept GET or POST.
set -eu

name="$1"
url="http://app:3000/api/internal/${name}/run"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "cron[$name]: CRON_SECRET not set — skipping" >&2
  exit 0
fi

code=$(curl -fsS -o /dev/null -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  --max-time 300 \
  "$url") && echo "cron[$name]: ok ($code)" || {
    echo "cron[$name]: FAILED (${code:-no-response})" >&2
    exit 1
  }
