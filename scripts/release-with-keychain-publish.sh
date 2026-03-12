#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/release-env.sh"

require_var CSC_LINK
require_var APPLE_KEYCHAIN_PROFILE
require_file "${CSC_LINK}" "CSC_LINK"

CSC_KEY_PASSWORD="$(read_keychain_password "${P12_ACCOUNT}" "${P12_SERVICE}")"
GH_TOKEN="$(read_keychain_password "${GITHUB_TOKEN_ACCOUNT}" "${GITHUB_TOKEN_SERVICE}")"

export CSC_LINK
export CSC_KEY_PASSWORD
export APPLE_KEYCHAIN_PROFILE
export APPLE_KEYCHAIN
export GH_TOKEN
export GITHUB_TOKEN="${GH_TOKEN}"

unset APPLE_ID
unset APPLE_APP_SPECIFIC_PASSWORD
unset APPLE_TEAM_ID

"${SCRIPT_DIR}/release-preflight.sh"

PUBLISH_CMD=(
    npx
    cross-env
    VITE_EDITOR_ONLY_RELEASE=1
    BOOKSPACE_EDITOR_ONLY_RELEASE=1
    electron-builder
    --publish
    always
    -c.extraMetadata.bookspaceEditorOnlyRelease=true
)

if [[ "${BOOKSPACE_RELEASE_DRY_RUN:-0}" == "1" ]]; then
    printf 'Would run:'
    printf ' %q' "${PUBLISH_CMD[@]}"
    printf '\nThen run: node scripts/finalize-github-release.mjs\n'
    exit 0
fi

npm run release:ready:editor
"${PUBLISH_CMD[@]}"
node scripts/finalize-github-release.mjs
