#!/usr/bin/env bash
#
# find_env_variables — read env var values from running Docker Compose service containers.
#
# Usage (source the script):
#   source scripts/find_env_variables.sh
#   find_env_variables env_map Points_Service/docker-compose.points.services.yml PORT BEARER_TOKEN
#   env_map_get env_map PORT
#
#   # Limit to specific compose services:
#   find_env_variables env_map compose.yml PORT --services points-blue-service points-central-service
#
# Usage (CLI):
#   ./scripts/find_env_variables.sh Points_Service/docker-compose.points.services.yml PORT BEARER_TOKEN
#   ./scripts/find_env_variables.sh compose.yml PORT --services points-blue-service
#
# Compose file path resolution (in order):
#   1. Absolute path (if starts with /)
#   2. Project root (relative to this script's parent directory)
#   3. Current working directory
#
# Output (CLI): one line per found variable: NAME=value
# Unset variables are omitted from the map / stdout.
#
# Note: requires bash (not zsh). Source with: bash -c 'source scripts/find_env_variables.sh'

if [[ -z "${BASH_VERSION:-}" ]]; then
  echo "find_env_variables.sh requires bash" >&2
  (return 1 2>/dev/null) || exit 1
fi

set -eo pipefail

_resolve_file_path() {
  local file_path="$1"
  local resolved_path

  # Strategy 1: Absolute path (if starts with /)
  if [[ "$file_path" == /* ]]; then
    if [[ -f "$file_path" ]]; then
      echo "$file_path"
      return 0
    fi
    return 1
  fi

  # Strategy 2: Project root + path
  # Project root is the parent directory of the script directory
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local project_root
  project_root="$(cd "$script_dir/.." && pwd)"
  resolved_path="$project_root/$file_path"
  if [[ -f "$resolved_path" ]]; then
    echo "$resolved_path"
    return 0
  fi

  # Strategy 3: Current directory + path
  resolved_path="./$file_path"
  if [[ -f "$resolved_path" ]]; then
    echo "$resolved_path"
    return 0
  fi

  # File not found in any strategy
  return 1
}

_find_compose_service_containers() {
  local yml_file="$1"
  local _services_out="$2"
  local _containers_out="$3"

  local resolved_yml
  resolved_yml="$(_resolve_file_path "$yml_file")" || {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root
    project_root="$(cd "$script_dir/.." && pwd)"
    echo "find_env_variables: compose file not found: $yml_file" >&2
    echo "  Tried:" >&2
    echo "    1. Absolute path: $yml_file" >&2
    echo "    2. Project root:  $project_root/$yml_file" >&2
    echo "    3. Current dir:   ./$yml_file" >&2
    return 1
  }
  yml_file="$resolved_yml"

  eval "${_services_out}=()"
  eval "${_containers_out}=()"

  local svc container
  while IFS=$'\t' read -r svc container; do
    [[ -n "$svc" ]] || continue
    eval "${_services_out}+=(\"\$svc\")"
    eval "${_containers_out}+=(\"\$container\")"
  done < <(awk '
    BEGIN { in_services=0; svc="" }
    /^services:[[:space:]]*$/ { in_services=1; next }
    in_services && /^[^[:space:]#]/ { in_services=0 }
    !in_services { next }
    /^  [a-zA-Z0-9_.-]+:[[:space:]]*$/ {
      if (svc != "") print svc "\t" container
      svc=$1
      sub(/:$/, "", svc)
      container=svc
      next
    }
    /^    container_name:[[:space:]]/ {
      container=$2
      gsub(/^["'\''"]|["'\''"]$/, "", container)
    }
    END { if (svc != "") print svc "\t" container }
  ' "$yml_file")
}

_is_container_running() {
  local container_name="$1"
  docker ps --format '{{.Names}}' 2>/dev/null | grep -Fxq "$container_name" || return 1
  return 0
}

_get_container_env_value() {
  local container_name="$1"
  local var_name="$2"
  docker inspect "$container_name" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="$var_name" '$1 == key { print substr($0, index($0, "=") + 1); exit }'
}

_env_map_has_key() {
  local map_name="$1"
  local key="$2"
  local keys_var="${map_name}__keys"
  local keys="${!keys_var-}"
  case " ${keys} " in
    *" ${key} "*) return 0 ;;
    *) return 1 ;;
  esac
}

_env_map_set() {
  local map_name="$1"
  local key="$2"
  local value="$3"
  local value_var="${map_name}__${key}"
  local keys_var="${map_name}__keys"

  printf -v "$value_var" '%s' "$value"

  if ! _env_map_has_key "$map_name" "$key"; then
    if [[ -z "${!keys_var-}" ]]; then
      printf -v "$keys_var" '%s' "$key"
    else
      printf -v "$keys_var" '%s' "${!keys_var} ${key}"
    fi
  fi
}

_env_map_clear() {
  local map_name="$1"
  shift
  local key
  for key in "$@"; do
    unset "${map_name}__${key}"
  done
  unset "${map_name}__keys"
}

# Read a value from a map created by find_env_variables.
env_map_get() {
  local map_name="$1"
  local key="$2"
  local value_var="${map_name}__${key}"
  printf '%s' "${!value_var-}"
}

# List keys populated in a map created by find_env_variables.
env_map_keys() {
  local map_name="$1"
  local keys_var="${map_name}__keys"
  local keys="${!keys_var-}"
  [[ -n "$keys" ]] || return 0
  printf '%s\n' $keys
}

# find_env_variables <map_name> <compose.yml> <ENV> [ENV ...] [--services <svc> ...]
#
# Populates:
#   ${map_name}__<ENV>     value for each found variable
#   ${map_name}__keys       space-separated list of found variable names
#
# Compose file path resolution:
#   1. Absolute path (if starts with /)
#   2. Project root (parent of script directory)
#   3. Current working directory
find_env_variables() {
  local map_name="$1"
  shift

  local yml_file="$1"
  shift

  local env_names=()
  local filter_services=()
  local parsing_services=0

  local arg
  for arg in "$@"; do
    if [[ "$arg" == "--services" ]]; then
      parsing_services=1
      continue
    fi
    if [[ $parsing_services -eq 1 ]]; then
      filter_services+=("$arg")
    else
      env_names+=("$arg")
    fi
  done

  if [[ ${#env_names[@]} -eq 0 ]]; then
    echo "find_env_variables: at least one environment variable name is required" >&2
    return 1
  fi

  local compose_services=()
  local compose_containers=()
  _find_compose_service_containers "$yml_file" compose_services compose_containers

  if [[ ${#compose_services[@]} -eq 0 ]]; then
    echo "find_env_variables: no services found in $yml_file" >&2
    return 1
  fi

  _env_map_clear "$map_name" "${env_names[@]}"

  local i svc container include wanted env_name value
  for i in "${!compose_services[@]}"; do
    svc="${compose_services[$i]}"
    container="${compose_containers[$i]}"

    include=1
    if [[ ${#filter_services[@]} -gt 0 ]]; then
      include=0
      for wanted in "${filter_services[@]}"; do
        if [[ "$svc" == "$wanted" ]]; then
          include=1
          break
        fi
      done
    fi
    [[ $include -eq 1 ]] || continue
    _is_container_running "$container" || continue

    for env_name in "${env_names[@]}"; do
      _env_map_has_key "$map_name" "$env_name" && continue

      value="$(_get_container_env_value "$container" "$env_name" || true)"
      if [[ -n "$value" ]]; then
        _env_map_set "$map_name" "$env_name" "$value"
      fi
    done
  done
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [[ $# -lt 2 ]]; then
    cat >&2 <<'EOF'
Usage:
  find_env_variables.sh <compose.yml> <ENV> [ENV ...] [--services <service> ...]

File path resolution (tries in order):
  1. Absolute path (if starts with /)
  2. Project root (relative to script's parent directory)
  3. Current working directory

Examples:
  find_env_variables.sh Points_Service/docker-compose.points.services.yml PORT BEARER_TOKEN
  find_env_variables.sh docker-compose.points.services.yml PORT BEARER_TOKEN
  find_env_variables.sh /absolute/path/to/docker-compose.yml PORT \
    --services points-blue-service points-central-service
EOF
    exit 1
  fi

  map_name="__find_env_cli_map"
  find_env_variables "$map_name" "$@"

  if ! env_map_keys "$map_name" | grep -q .; then
    echo "No requested environment variables found in running containers." >&2
    exit 2
  fi

  env_map_keys "$map_name" | while IFS= read -r key; do
    printf '%s=%s\n' "$key" "$(env_map_get "$map_name" "$key")"
  done | sort
fi
