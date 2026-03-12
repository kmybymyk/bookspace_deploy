#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RELEASE_ENV_FILE="${RELEASE_ENV_FILE:-${PROJECT_ROOT}/.env.release}"

if [[ -f "${RELEASE_ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${RELEASE_ENV_FILE}"
    set +a
fi

APPLE_KEYCHAIN_PROFILE="${APPLE_KEYCHAIN_PROFILE:-bookspace-notary}"
APPLE_KEYCHAIN="${APPLE_KEYCHAIN:-${HOME}/Library/Keychains/login.keychain-db}"
NOTARY_SERVICE="${NOTARY_SERVICE:-bookspace_notary_password}"
P12_SERVICE="${P12_SERVICE:-bookspace_p12_password}"
P12_ACCOUNT="${P12_ACCOUNT:-bookspace}"
GITHUB_TOKEN_SERVICE="${GITHUB_TOKEN_SERVICE:-bookspace_github_token}"
GITHUB_TOKEN_ACCOUNT="${GITHUB_TOKEN_ACCOUNT:-bookspace}"

require_var() {
    local name="$1"
    if [[ -z "${!name:-}" ]]; then
        echo "${name} is required. Set it in ${RELEASE_ENV_FILE} or the current shell." >&2
        return 1
    fi
}

require_file() {
    local path_value="$1"
    local label="$2"
    if [[ ! -f "${path_value}" ]]; then
        echo "${label} file not found: ${path_value}" >&2
        return 1
    fi
}

read_keychain_password() {
    local account="$1"
    local service="$2"
    security find-generic-password -a "${account}" -s "${service}" -w
}
