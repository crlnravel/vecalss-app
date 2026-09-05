#!/usr/bin/env bash
set -euo pipefail

# Configured project copy of the reusable agent-resource-guard skill.
# It deliberately uses only POSIX-ish shell utilities so the check itself
# never starts Node.

readonly MAX_LOAD_FACTOR=1.25
readonly HOT_PROCESS_CPU=25
readonly MAX_HOT_PROCESSES=2
readonly MAX_TOTAL_CPU=160

script_name="$(basename "$0")"
project_root="$(pwd -P)"
project_key_source="$(git rev-parse --git-common-dir 2>/dev/null || printf '%s' "$project_root")"
project_key="$(printf '%s' "$project_key_source" | cksum | awk '{print $1}')"
temp_root="${TMPDIR:-/tmp}"
lock_dir="${temp_root%/}/vecalss-agent-resource-${project_key}.lock"
lock_held=0
last_process_report=""

usage() {
  cat <<EOF
Usage:
  $script_name status
  $script_name check
  $script_name run -- <command> [args...]

status  Print CPU/load and Node/process information without starting Node.
check   Print the same information and fail closed when the host is busy.
run     Acquire the shared repository lock, check resources, then run one
        command at a lower scheduling priority.
EOF
}

cpu_count() {
  local value

  if command -v sysctl >/dev/null 2>&1; then
    value="$(sysctl -n hw.logicalcpu 2>/dev/null || true)"
    if [ -n "$value" ] && printf '%s\n' "$value" | awk '$1 ~ /^[0-9]+$/ && $1 > 0 { valid = 1 } END { exit !valid }'; then
      printf '%s' "$value"
      return 0
    fi
  fi

  if command -v sysctl >/dev/null 2>&1; then
    value="$(sysctl -n hw.ncpu 2>/dev/null || true)"
    if [ -n "$value" ] && printf '%s\n' "$value" | awk '$1 ~ /^[0-9]+$/ && $1 > 0 { valid = 1 } END { exit !valid }'; then
      printf '%s' "$value"
      return 0
    fi
  fi

  if command -v nproc >/dev/null 2>&1; then
    value="$(nproc 2>/dev/null || true)"
    if [ -n "$value" ] && printf '%s\n' "$value" | awk '$1 ~ /^[0-9]+$/ && $1 > 0 { valid = 1 } END { exit !valid }'; then
      printf '%s' "$value"
      return 0
    fi
  fi

  return 1
}

load_one() {
  local value

  if command -v sysctl >/dev/null 2>&1; then
    value="$(sysctl -n vm.loadavg 2>/dev/null | awk '{gsub(/[{}]/, ""); print $1}')"
    if [ -n "$value" ] && printf '%s\n' "$value" | awk '$1 ~ /^[0-9]+([.][0-9]+)?$/ { valid = 1 } END { exit !valid }'; then
      printf '%s' "$value"
      return 0
    fi
  fi

  if [ -r /proc/loadavg ]; then
    value="$(awk '{print $1}' /proc/loadavg 2>/dev/null || true)"
    if [ -n "$value" ] && printf '%s\n' "$value" | awk '$1 ~ /^[0-9]+([.][0-9]+)?$/ { valid = 1 } END { exit !valid }'; then
      printf '%s' "$value"
      return 0
    fi
  fi

  if command -v uptime >/dev/null 2>&1; then
    value="$(uptime 2>/dev/null | awk -F 'load average[s]?:[[:space:]]*' 'NF > 1 { gsub(/,/, " ", $2); print $2 }' | awk '{print $1}')"
    if [ -n "$value" ] && printf '%s\n' "$value" | awk '$1 ~ /^[0-9]+([.][0-9]+)?$/ { valid = 1 } END { exit !valid }'; then
      printf '%s' "$value"
      return 0
    fi
  fi

  return 1
}

raw_process_list() {
  if ps -axo pid=,ppid=,%cpu=,%mem=,etime=,command= >/dev/null 2>&1; then
    ps -axo pid=,ppid=,%cpu=,%mem=,etime=,command=
    return 0
  fi

  if ps -eo pid=,ppid=,%cpu=,%mem=,etime=,command= >/dev/null 2>&1; then
    ps -eo pid=,ppid=,%cpu=,%mem=,etime=,command=
    return 0
  fi

  return 1
}

process_report() {
  raw_process_list | awk -v self_pid="$$" -v parent_pid="$PPID" -v hot_threshold="$HOT_PROCESS_CPU" '
    function is_agent_process(command) {
      return command ~ /(^|[[:space:]\/])(node|pnpm|tsx|ts-node|next(-server)?|prisma|npm|npx|yarn|bun|vite|turbo)([[:space:]]|$)/ ||
        command ~ /node_modules\/.*\/(eslint|tsc)([.]js|[[:space:]]|$)/
    }
    {
      command = ""
      for (field = 6; field <= NF; field++) {
        command = command (field == 6 ? "" : " ") $field
      }
      if ($1 == self_pid || $1 == parent_pid || !is_agent_process(command)) {
        next
      }
      printf "%s\t%s\t%.1f\t%.1f\t%s\t%s\n", $1, $2, $3 + 0, $4 + 0, $5, command
    }
  ' | sort -t '	' -k3,3nr
}

print_process_report() {
  local report
  if [ "$#" -gt 0 ]; then
    report="$1"
  else
    report="$(process_report 2>/dev/null || true)"
  fi

  if [ -z "$report" ]; then
    printf '%s\n' 'Matching Node/process rows: none'
    return 0
  fi

  printf '%s\n' 'Matching Node/process rows (pid  ppid  cpu%  mem%  elapsed  command):'
  printf '%s\n' "$report" | awk -F '	' '{ printf "  %-7s %-7s %6s %6s %-9s %s\n", $1, $2, $3, $4, $5, $6 }' | sed -n '1,40p'
  printf '%s\n' "$report" | awk -F '	' -v hot_threshold="$HOT_PROCESS_CPU" '
    BEGIN { hot = 0; total = 0; rows = 0 }
    { rows++; total += $3; if (($3 + 0) >= hot_threshold) hot++ }
    END { printf "Process summary: rows=%d hot(>=%s%%)=%d cpu_total=%.1f%%\n", rows, hot_threshold, hot, total }
  '
}

resource_snapshot() {
  local cpus load

  printf '%s\n' '=== Agent resource snapshot ==='
  if cpus="$(cpu_count 2>/dev/null)"; then
    printf 'Logical CPUs: %s\n' "$cpus"
  else
    printf '%s\n' 'Logical CPUs: unavailable'
  fi

  if load="$(load_one 2>/dev/null)"; then
    printf '1m load: %s\n' "$load"
  else
    printf '%s\n' '1m load: unavailable'
  fi

  printf 'Guard thresholds: load >= %s x CPUs, %s hot processes, or %.0f%% matching CPU\n' \
    "$MAX_LOAD_FACTOR" "$MAX_HOT_PROCESSES" "$MAX_TOTAL_CPU"

  if ! raw_process_list >/dev/null 2>&1; then
    printf '%s\n' 'Process listing: unavailable (the guard will fail closed)'
    return 0
  fi

  last_process_report="$(process_report 2>/dev/null || true)"
  print_process_report "$last_process_report"
}

check_resources() {
  local cpus load report metrics hot total

  resource_snapshot

  if ! raw_process_list >/dev/null 2>&1; then
    printf '%s\n' 'BLOCKED: ps is unavailable; refusing to start a process without a CPU check.' >&2
    return 75
  fi

  report="$last_process_report"
  metrics="$(printf '%s\n' "$report" | awk -F '	' -v hot_threshold="$HOT_PROCESS_CPU" '
    BEGIN { hot = 0; total = 0 }
    NF >= 3 { total += $3; if (($3 + 0) >= hot_threshold) hot++ }
    END { printf "%d %.1f", hot, total }
  ')"
  read -r hot total <<< "$metrics"

  if ! cpus="$(cpu_count 2>/dev/null)" || ! load="$(load_one 2>/dev/null)"; then
    printf '%s\n' 'BLOCKED: logical CPU count or load average is unavailable; refusing to start without a complete resource check.' >&2
    return 75
  fi

  if awk -v load="$load" -v cpus="$cpus" -v factor="$MAX_LOAD_FACTOR" 'BEGIN { exit !(load >= cpus * factor) }'; then
    printf 'BLOCKED: 1m load %s is at or above %.2f x %s CPUs; wait before launching another command.\n' \
      "$load" "$MAX_LOAD_FACTOR" "$cpus" >&2
    return 75
  fi

  if [ "${hot:-0}" -ge "$MAX_HOT_PROCESSES" ] || \
    awk -v total="${total:-0}" -v max="$MAX_TOTAL_CPU" 'BEGIN { exit !(total >= max) }'; then
    printf 'BLOCKED: existing matching work is using %s hot processes / %s%% CPU; wait before launching another command.\n' \
      "${hot:-0}" "${total:-0}" >&2
    return 75
  fi

  printf '%s\n' 'Resource check passed.'
}

release_lock() {
  if [ "$lock_held" -eq 1 ]; then
    rm -f "$lock_dir/pid" "$lock_dir/root"
    rmdir "$lock_dir" 2>/dev/null || true
    lock_held=0
  fi
}

on_signal() {
  release_lock
  exit 130
}

acquire_lock() {
  local owner_pid

  if mkdir "$lock_dir" 2>/dev/null; then
    lock_held=1
    printf '%s\n' "$$" > "$lock_dir/pid"
    printf '%s\n' "$project_root" > "$lock_dir/root"
    return 0
  fi

  owner_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  if [ -n "$owner_pid" ] && kill -0 "$owner_pid" 2>/dev/null; then
    printf 'BLOCKED: another agent command owns the repository resource lock (pid %s).\n' "$owner_pid" >&2
    resource_snapshot >&2
    return 75
  fi

  # Recover only this exact, stale temporary lock.  Never remove a directory
  # recursively or touch a user's project files.
  rm -f "$lock_dir/pid" "$lock_dir/root"
  rmdir "$lock_dir" 2>/dev/null || {
    printf '%s\n' 'BLOCKED: resource lock exists but its owner could not be verified.' >&2
    return 75
  }

  if ! mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' 'BLOCKED: another agent acquired the resource lock while it was being recovered.' >&2
    return 75
  fi

  lock_held=1
  printf '%s\n' "$$" > "$lock_dir/pid"
  printf '%s\n' "$project_root" > "$lock_dir/root"
}

run_command() {
  local exit_code

  if [ "$#" -eq 0 ]; then
    usage >&2
    return 64
  fi

  acquire_lock
  check_resources

  printf 'Running under shared resource guard: '
  printf '%q ' "$@"
  printf '%s\n' ''

  set +e
  if command -v nice >/dev/null 2>&1; then
    nice -n 10 "$@"
    exit_code=$?
  else
    "$@"
    exit_code=$?
  fi
  set -e

  return "$exit_code"
}

trap release_lock EXIT
trap on_signal INT TERM HUP

case "${1:-}" in
  status)
    [ "$#" -eq 1 ] || { usage >&2; exit 64; }
    resource_snapshot
    ;;
  check)
    [ "$#" -eq 1 ] || { usage >&2; exit 64; }
    check_resources
    ;;
  run)
    [ "${2:-}" = '--' ] || { usage >&2; exit 64; }
    shift 2
    run_command "$@"
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac
