#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/release-env.sh"

require_var CSC_LINK
require_var APPLE_KEYCHAIN_PROFILE
require_file "${CSC_LINK}" "CSC_LINK"

CSC_KEY_PASSWORD="$(read_keychain_password "${P12_ACCOUNT}" "${P12_SERVICE}")"

export CSC_LINK
export CSC_KEY_PASSWORD
export APPLE_KEYCHAIN_PROFILE
export APPLE_KEYCHAIN

unset APPLE_ID
unset APPLE_APP_SPECIFIC_PASSWORD
unset APPLE_TEAM_ID

"${SCRIPT_DIR}/release-preflight.sh"

npm run package:release:editor
