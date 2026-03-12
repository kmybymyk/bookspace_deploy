#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/release-env.sh"

require_var APPLE_ID
require_var APPLE_TEAM_ID
require_var APPLE_KEYCHAIN_PROFILE

APPLE_APP_SPECIFIC_PASSWORD="$(read_keychain_password "${APPLE_ID}" "${NOTARY_SERVICE}")"

echo "Updating notarytool keychain profile: ${APPLE_KEYCHAIN_PROFILE}"
xcrun notarytool store-credentials "${APPLE_KEYCHAIN_PROFILE}" \
    --apple-id "${APPLE_ID}" \
    --team-id "${APPLE_TEAM_ID}" \
    --password "${APPLE_APP_SPECIFIC_PASSWORD}" \
    --keychain "${APPLE_KEYCHAIN}"

echo "Keychain profile is ready: ${APPLE_KEYCHAIN_PROFILE}"
