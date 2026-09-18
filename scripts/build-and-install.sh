#!/bin/bash
#
# Builds, signs, and installs the Safari extension with an automatically
# incremented version number.
#
# Each run:
#   1. increments build-number.txt
#   2. writes the new version into manifest.json (Safari shows this value)
#   3. passes the same number to Xcode as CFBundleVersion
#   4. signs with the configured Apple Development team
#   5. copies the signed app to ~/Applications
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NUMBER_FILE="$ROOT/build-number.txt"
MANIFEST="$ROOT/triple-click-fix Extension/Resources/manifest.json"
MARKETING_VERSION="${MARKETING_VERSION:-1.1}"
DERIVED_DATA="${DERIVED_DATA:-/private/tmp/triple-click-fix-build}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/Applications}"
APP_NAME="triple-click-fix.app"

cd "$ROOT"

if [[ ! -f "$NUMBER_FILE" ]]; then
    echo "0" > "$NUMBER_FILE"
fi

LAST_NUMBER="$(tr -d '[:space:]' < "$NUMBER_FILE")"
BUILD_NUMBER=$((LAST_NUMBER + 1))

if [[ "$BUILD_NUMBER" -gt 9999 ]]; then
    echo "error: build number overflow" >&2
    exit 1
fi

echo "$BUILD_NUMBER" > "$NUMBER_FILE"

# Safari displays the extension manifest version, so keep it in sync with the
# build number. Three-part versions are valid manifest values.
MANIFEST_VERSION="${MARKETING_VERSION}.${BUILD_NUMBER}"
/usr/bin/sed -i '' -E \
    "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]*(\")/\1${MANIFEST_VERSION}\2/" \
    "$MANIFEST"

echo "==> Building version ${MANIFEST_VERSION} (build ${BUILD_NUMBER})"

DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}" \
    /usr/bin/xcodebuild \
    -project triple-click-fix.xcodeproj \
    -scheme triple-click-fix \
    -configuration Debug \
    -derivedDataPath "$DERIVED_DATA" \
    -allowProvisioningUpdates \
    MARKETING_VERSION="$MANIFEST_VERSION" \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
    build

BUILT_APP="$DERIVED_DATA/Build/Products/Debug/$APP_NAME"

if [[ ! -d "$BUILT_APP" ]]; then
    echo "error: build product not found at $BUILT_APP" >&2
    exit 1
fi

/usr/bin/codesign --verify --deep --strict "$BUILT_APP"

mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/$APP_NAME"
cp -R "$BUILT_APP" "$INSTALL_DIR/$APP_NAME"

echo
echo "==> Installed $MANIFEST_VERSION (build $BUILD_NUMBER)"
echo "    $INSTALL_DIR/$APP_NAME"
echo
echo "Open the app once, then enable the extension in Safari settings."
