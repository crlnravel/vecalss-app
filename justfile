# Vecalss database workflows.
#
# `just setup` provisions local Docker services, creates a disposable
# `.env.local` when missing, and resets/migrates/seeds PostgreSQL.
# `just local-env` and `just staging-env` switch only the app's database and
# local Redis settings. Staging database commands read the first DATABASE_URL
# assignment in `.env`; they never depend on `.env.local` being switched.
#
# Staging is disposable by project policy. The guarded CBT migrations require
# acknowledgement settings including a snapshot ID; these recipes pass a
# clearly named no-snapshot marker rather than implying a backup was created.

default: help

help:
    @just --list

# Create or repair the local environment, start Docker services, then seed it.
setup: local-reset

# Copy the safe template only when `.env.local` does not exist, then update
# only app/database connection settings. Other local secrets and settings stay.
local-env:
    #!/usr/bin/env bash
    set -euo pipefail
    env_file=.env.local
    if [[ ! -f "$env_file" ]]; then
      cp .env.example "$env_file"
    fi
    tmp_file="$(mktemp "${env_file}.XXXXXX")"
    trap 'rm -f "$tmp_file"' EXIT
    awk \
      -v db_url='postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev?schema=public' \
      -v redis_url='redis://127.0.0.1:56379/0' \
      -v base_url='http://localhost:5023' \
      -v vera_db_url='postgresql://vecalss:vecalss@127.0.0.1:55432/vera_test?schema=public' \
      -v vera_redis_url='redis://127.0.0.1:56379/15' '
      function emit(key, value) {
        if (!seen[key]) {
          print key "=" value
          seen[key] = 1
        }
      }
      {
        probe = $0
        sub(/^[[:space:]]*/, "", probe)
        if (match(probe, /^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/)) {
          key = substr(probe, 1, RLENGTH)
          sub(/[[:space:]]*=$/, "", key)
          if (key == "DATABASE_URL") { emit(key, db_url); next }
          if (key == "REDIS_URL") { emit(key, redis_url); next }
          if (key == "APP_BASE_URL") { emit(key, base_url); next }
          if (key == "VERA_DISPOSABLE_DATABASE_URL") { emit(key, vera_db_url); next }
          if (key == "VERA_DISPOSABLE_REDIS_URL") { emit(key, vera_redis_url); next }
          if (key == "VERA_DISPOSABLE_DB_ACK") { emit(key, "1"); next }
        }
        print $0
      }
      END {
        emit("DATABASE_URL", db_url)
        emit("REDIS_URL", redis_url)
        emit("APP_BASE_URL", base_url)
        emit("VERA_DISPOSABLE_DATABASE_URL", vera_db_url)
        emit("VERA_DISPOSABLE_REDIS_URL", vera_redis_url)
        emit("VERA_DISPOSABLE_DB_ACK", "1")
      }' "$env_file" > "$tmp_file"
    chmod 600 "$tmp_file"
    mv "$tmp_file" "$env_file"
    trap - EXIT
    echo 'Configured .env.local for local PostgreSQL and Redis.'

# Switch the app to Neon staging for database reads/writes; Redis remains local.
staging-env:
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ ! -r .env ]]; then
      echo 'Cannot find .env. Put the Neon staging DATABASE_URL there first.' >&2
      exit 1
    fi
    staging_url="$(awk -F= '$1 == "DATABASE_URL" { value = substr($0, index($0, "=") + 1); sub(/^"/, "", value); sub(/"$/, "", value); sub(/\r$/, "", value); print value; exit }' .env)"
    if [[ "$staging_url" != *neon.tech* ]]; then
      echo 'The first DATABASE_URL in .env must point to Neon staging.' >&2
      exit 1
    fi
    env_file=.env.local
    if [[ ! -f "$env_file" ]]; then cp .env.example "$env_file"; fi
    tmp_file="$(mktemp "${env_file}.XXXXXX")"
    trap 'rm -f "$tmp_file"' EXIT
    awk \
      -v db_url="$staging_url" \
      -v redis_url='redis://127.0.0.1:56379/0' \
      -v base_url='http://localhost:5023' \
      -v vera_db_url='postgresql://vecalss:vecalss@127.0.0.1:55432/vera_test?schema=public' \
      -v vera_redis_url='redis://127.0.0.1:56379/15' '
      function emit(key, value) {
        if (!seen[key]) {
          print key "=" value
          seen[key] = 1
        }
      }
      {
        probe = $0
        sub(/^[[:space:]]*/, "", probe)
        if (match(probe, /^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/)) {
          key = substr(probe, 1, RLENGTH)
          sub(/[[:space:]]*=$/, "", key)
          if (key == "DATABASE_URL") { emit(key, db_url); next }
          if (key == "REDIS_URL") { emit(key, redis_url); next }
          if (key == "APP_BASE_URL") { emit(key, base_url); next }
          if (key == "VERA_DISPOSABLE_DATABASE_URL") { emit(key, vera_db_url); next }
          if (key == "VERA_DISPOSABLE_REDIS_URL") { emit(key, vera_redis_url); next }
          if (key == "VERA_DISPOSABLE_DB_ACK") { emit(key, "1"); next }
        }
        print $0
      }
      END {
        emit("DATABASE_URL", db_url)
        emit("REDIS_URL", redis_url)
        emit("APP_BASE_URL", base_url)
        emit("VERA_DISPOSABLE_DATABASE_URL", vera_db_url)
        emit("VERA_DISPOSABLE_REDIS_URL", vera_redis_url)
        emit("VERA_DISPOSABLE_DB_ACK", "1")
      }' "$env_file" > "$tmp_file"
    chmod 600 "$tmp_file"
    mv "$tmp_file" "$env_file"
    trap - EXIT
    echo 'Configured .env.local for Neon staging and local Redis.'

_resource-status:
    @./_harness/resource-guard.sh status 2>&1 | awk '/^(Logical CPUs:|1m load:|Guard thresholds:|Process summary:)/'

_ensure-deps: _resource-status
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ ! -x node_modules/.bin/prisma ]]; then
      set +e
      ./_harness/resource-guard.sh run -- rtk pnpm install --frozen-lockfile 2>&1 \
        | sed -E 's#postgres(ql)?://[^[:space:]]+#<redacted DATABASE_URL>#g; s/figd_[[:alnum:]_-]+/<redacted API token>/g'
      command_status=${PIPESTATUS[0]}
      set -e
      exit "$command_status"
    fi

_local-services: _ensure-deps
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose -f docker-compose.dev.yml up -d
    ready=0
    for attempt in {1..60}; do
      if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U vecalss -d vecalss_dev >/dev/null 2>&1 \
        && docker compose -f docker-compose.dev.yml exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        ready=1
        break
      fi
      sleep 2
    done
    if [[ "$ready" != 1 ]]; then
      docker compose -f docker-compose.dev.yml ps
      echo 'Local PostgreSQL or Redis did not become ready.' >&2
      exit 1
    fi

# Start only PostgreSQL for local workflows that do not need Redis or Obscura.
_local-postgres: _ensure-deps
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose -f docker-compose.dev.yml up -d postgres
    ready=0
    for attempt in {1..60}; do
      if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U vecalss -d vecalss_dev >/dev/null 2>&1; then
        ready=1
        break
      fi
      sleep 2
    done
    if [[ "$ready" != 1 ]]; then
      docker compose -f docker-compose.dev.yml ps postgres
      echo 'Local PostgreSQL did not become ready.' >&2
      exit 1
    fi

# Reset/migrate/seed PostgreSQL and clear disposable local Redis databases 0/15.
local-reset: local-env _local-services _resource-status
    #!/usr/bin/env bash
    set -euo pipefail
    database_url='postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev?schema=public'
    db_name=vecalss_dev
    marker="local-reset-no-snapshot-$(date -u +%Y%m%dT%H%M%SZ)"
    if [[ "$database_url" == *options=* ]]; then
      echo 'The local database URL already has an options parameter; refusing to duplicate it.' >&2
      exit 1
    fi
    options="$(printf '%s' "-c cbt.cutover_ack=REMOVE_CAT -c cbt.cutover_snapshot_id=$marker -c cbt.cutover_database=$db_name -c cbt.schema_retirement_ack=RETIRE_CAT_SCHEMA -c cbt.schema_retirement_snapshot_id=$marker -c cbt.schema_retirement_database=$db_name" | sed 's/ /%20/g; s/=/%3D/g')"
    export DATABASE_URL="${database_url}&options=${options}"
    set +e
    ./_harness/resource-guard.sh run -- rtk pnpm db:seed 2>&1 \
      | sed -E 's#postgres(ql)?://[^[:space:]]+#<redacted DATABASE_URL>#g; s/figd_[[:alnum:]_-]+/<redacted API token>/g'
    command_status=${PIPESTATUS[0]}
    set -e
    if [[ "$command_status" != 0 ]]; then exit "$command_status"; fi
    docker compose -f docker-compose.dev.yml exec -T redis redis-cli -n 0 FLUSHDB
    docker compose -f docker-compose.dev.yml exec -T redis redis-cli -n 15 FLUSHDB
    echo 'Local PostgreSQL was reset, migrated, and seeded; local Redis DBs 0 and 15 were cleared.'

# Apply pending local migrations without dropping PostgreSQL data.
local-migrate: local-env _local-services _resource-status
    #!/usr/bin/env bash
    set -euo pipefail
    database_url='postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev?schema=public'
    db_name=vecalss_dev
    marker="local-migrate-no-snapshot-$(date -u +%Y%m%dT%H%M%SZ)"
    options="$(printf '%s' "-c cbt.cutover_ack=REMOVE_CAT -c cbt.cutover_snapshot_id=$marker -c cbt.cutover_database=$db_name -c cbt.schema_retirement_ack=RETIRE_CAT_SCHEMA -c cbt.schema_retirement_snapshot_id=$marker -c cbt.schema_retirement_database=$db_name" | sed 's/ /%20/g; s/=/%3D/g')"
    export DATABASE_URL="${database_url}&options=${options}"
    set +e
    ./_harness/resource-guard.sh run -- rtk pnpm exec prisma migrate deploy 2>&1 \
      | sed -E 's#postgres(ql)?://[^[:space:]]+#<redacted DATABASE_URL>#g; s/figd_[[:alnum:]_-]+/<redacted API token>/g'
    command_status=${PIPESTATUS[0]}
    set -e
    exit "$command_status"

# Seed the existing local database without resetting it.
local-seed: local-env _local-services _resource-status
    #!/usr/bin/env bash
    set -euo pipefail
    export DATABASE_URL='postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev?schema=public'
    set +e
    ./_harness/resource-guard.sh run -- rtk pnpm exec node prisma/seed.mjs 2>&1 \
      | sed -E 's#postgres(ql)?://[^[:space:]]+#<redacted DATABASE_URL>#g; s/figd_[[:alnum:]_-]+/<redacted API token>/g'
    command_status=${PIPESTATUS[0]}
    set -e
    exit "$command_status"

# Add repeatable, clearly labeled stress records to the local demo database.
# Override LOCAL_HUGE_SEED_STUDENTS / LOCAL_HUGE_SEED_MODULES to change the
# requested rows per group (10,000 each by default). This does not reset data.
local-huge-seed: local-env _local-postgres _resource-status
    #!/usr/bin/env bash
    set -euo pipefail
    export DATABASE_URL='postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev?schema=public'
    set +e
    ./_harness/resource-guard.sh run -- rtk pnpm exec node prisma/seed-huge.mjs 2>&1 \
      | sed -E 's#postgres(ql)?://[^[:space:]]+#<redacted DATABASE_URL>#g; s/figd_[[:alnum:]_-]+/<redacted API token>/g'
    command_status=${PIPESTATUS[0]}
    set -e
    exit "$command_status"

# Apply pending Neon staging migrations with the direct (non-pooler) URL.
staging-migrate: staging-env _ensure-deps _resource-status
    #!/usr/bin/env bash
    set -euo pipefail
    staging_url="$(awk -F= '$1 == "DATABASE_URL" { value = substr($0, index($0, "=") + 1); sub(/^"/, "", value); sub(/"$/, "", value); sub(/\r$/, "", value); print value; exit }' .env)"
    if [[ "$staging_url" != *neon.tech* ]]; then
      echo 'The first DATABASE_URL in .env must point to Neon staging.' >&2
      exit 1
    fi
    database_url="${staging_url/-pooler./.}"
    if [[ "$database_url" == *-pooler.* ]]; then
      echo 'Could not derive a direct Neon connection URL.' >&2
      exit 1
    fi
    url_path="${database_url%%\?*}"
    db_name="${url_path##*/}"
    if [[ -z "$db_name" || "$db_name" == "$url_path" ]]; then
      echo 'Could not determine the staging database name from .env.' >&2
      exit 1
    fi
    if [[ "$database_url" == *options=* ]]; then
      echo 'The staging URL already has an options parameter; refusing to duplicate it.' >&2
      exit 1
    fi
    marker="disposable-staging-migrate-no-snapshot-$(date -u +%Y%m%dT%H%M%SZ)"
    options="$(printf '%s' "-c cbt.cutover_ack=REMOVE_CAT -c cbt.cutover_snapshot_id=$marker -c cbt.cutover_database=$db_name -c cbt.schema_retirement_ack=RETIRE_CAT_SCHEMA -c cbt.schema_retirement_snapshot_id=$marker -c cbt.schema_retirement_database=$db_name" | sed 's/ /%20/g; s/=/%3D/g')"
    if [[ "$database_url" == *\?* ]]; then separator='&'; else separator='?'; fi
    export DATABASE_URL="${database_url}${separator}options=${options}"
    set +e
    ./_harness/resource-guard.sh run -- rtk pnpm exec prisma migrate deploy 2>&1 \
      | sed -E 's#postgres(ql)?://[^[:space:]]+#<redacted DATABASE_URL>#g; s/figd_[[:alnum:]_-]+/<redacted API token>/g'
    command_status=${PIPESTATUS[0]}
    set -e
    exit "$command_status"

# Seed Neon staging with mentor accounts only (no demo fixtures).
staging-seed: staging-env _ensure-deps _resource-status
    #!/usr/bin/env bash
    set -euo pipefail
    staging_url="$(awk -F= '$1 == "DATABASE_URL" { value = substr($0, index($0, "=") + 1); sub(/^"/, "", value); sub(/"$/, "", value); sub(/\r$/, "", value); print value; exit }' .env)"
    if [[ "$staging_url" != *neon.tech* ]]; then
      echo 'The first DATABASE_URL in .env must point to Neon staging.' >&2
      exit 1
    fi
    export DATABASE_URL="${staging_url/-pooler./.}"
    set +e
    ./_harness/resource-guard.sh run -- rtk pnpm exec node prisma/seed-staging.mjs 2>&1 \
      | sed -E 's#postgres(ql)?://[^[:space:]]+#<redacted DATABASE_URL>#g; s/figd_[[:alnum:]_-]+/<redacted API token>/g'
    command_status=${PIPESTATUS[0]}
    set -e
    exit "$command_status"

# Destructively reset Neon staging, replay migrations, then seed mentor accounts.
staging-reset: staging-env _ensure-deps _resource-status
    #!/usr/bin/env bash
    set -euo pipefail
    staging_url="$(awk -F= '$1 == "DATABASE_URL" { value = substr($0, index($0, "=") + 1); sub(/^"/, "", value); sub(/"$/, "", value); sub(/\r$/, "", value); print value; exit }' .env)"
    if [[ "$staging_url" != *neon.tech* ]]; then
      echo 'The first DATABASE_URL in .env must point to Neon staging.' >&2
      exit 1
    fi
    database_url="${staging_url/-pooler./.}"
    if [[ "$database_url" == *-pooler.* ]]; then
      echo 'Could not derive a direct Neon connection URL.' >&2
      exit 1
    fi
    url_path="${database_url%%\?*}"
    db_name="${url_path##*/}"
    if [[ -z "$db_name" || "$db_name" == "$url_path" ]]; then
      echo 'Could not determine the staging database name from .env.' >&2
      exit 1
    fi
    if [[ "$database_url" == *options=* ]]; then
      echo 'The staging URL already has an options parameter; refusing to duplicate it.' >&2
      exit 1
    fi
    marker="disposable-staging-reset-no-snapshot-$(date -u +%Y%m%dT%H%M%SZ)"
    options="$(printf '%s' "-c cbt.cutover_ack=REMOVE_CAT -c cbt.cutover_snapshot_id=$marker -c cbt.cutover_database=$db_name -c cbt.schema_retirement_ack=RETIRE_CAT_SCHEMA -c cbt.schema_retirement_snapshot_id=$marker -c cbt.schema_retirement_database=$db_name" | sed 's/ /%20/g; s/=/%3D/g')"
    if [[ "$database_url" == *\?* ]]; then separator='&'; else separator='?'; fi
    export DATABASE_URL="${database_url}${separator}options=${options}"
    set +e
    ./_harness/resource-guard.sh run -- rtk pnpm db:seed 2>&1 \
      | sed -E 's#postgres(ql)?://[^[:space:]]+#<redacted DATABASE_URL>#g; s/figd_[[:alnum:]_-]+/<redacted API token>/g'
    command_status=${PIPESTATUS[0]}
    set -e
    exit "$command_status"
