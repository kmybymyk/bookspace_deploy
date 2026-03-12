#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/release-env.sh"

require_var CSC_LINK
require_var APPLE_KEYCHAIN_PROFILE
require_file "${CSC_LINK}" "CSC_LINK"

CSC_KEY_PASSWORD="$(read_keychain_password "${P12_ACCOUNT}" "${P12_SERVICE}")"

if [[ -z "${CSC_KEY_PASSWORD}" ]]; then
    echo "P12 password lookup returned an empty value." >&2
    exit 1
fi

echo "Validating notarization profile: ${APPLE_KEYCHAIN_PROFILE}"
xcrun notarytool history \
    --keychain-profile "${APPLE_KEYCHAIN_PROFILE}" \
    --keychain "${APPLE_KEYCHAIN}" \
    --output-format json >/dev/null

echo "Release preflight passed."
