# Safari Triple Click Fix

A macOS Safari Web Extension that fixes two Safari-specific problems caused by
triple-click paragraph selection.

## Problems

On macOS Safari, triple-clicking a paragraph can produce two unexpected
results:

1. The copied plain text can end with an extra newline or blank line, even
   though the visible paragraph does not contain an explicit line break.
2. The blue selection highlight can extend across the full width of the
   content block, including margins and empty space, while the actual selected
   text is narrower.

Chrome and Edge do not show the same rendering behavior on the same pages.
The DOM `Selection` and `Range` can be correct while Safari's visual highlight
still paints a much larger block.

## Solution

The extension does not reimplement Safari's triple-click selection logic and
does not replace the native `Selection` or `Range`.

It applies two narrowly scoped fixes:

### 1. Plain-text copy cleanup

`copy-sanitizer.js` listens for the native `copy` event. When all of the
following are true:

- the selection is a single semantic block;
- the block is not editable;
- the selected fragment has no real trailing `<br>` or newline;
- and Safari's plain-text output ends with one synthetic newline;

the extension removes exactly one trailing newline from `text/plain`.

It preserves intentional line breaks, multiple paragraphs, explicit `<br>`
elements, editable fields, and the HTML clipboard flavor.

### 2. Selection highlight repaint

`selection-renderer.js` uses the browser's CSS Custom Highlight API. It
registers Safari's native selection ranges with `CSS.highlights`, while
`selection-fix.css` suppresses the native `::selection` background and styles
the custom `::highlight(...)` layer.

Because the browser owns the custom highlight, it follows text through normal
scrolling, nested horizontal scroll containers, zooming, and layout updates
without manual coordinate synchronization.

If the custom highlight cannot be produced, the extension falls back to the
native Safari rendering rather than hiding the selection.

## Repository Structure

```text
triple-click-fix/
├── triple-click-fix.xcodeproj
├── triple-click-fix/
│   ├── AppDelegate.swift
│   ├── ViewController.swift
│   └── Resources/
└── triple-click-fix Extension/
    ├── Info.plist
    ├── SafariWebExtensionHandler.swift
    └── Resources/
        ├── manifest.json
        ├── selection-model.js
        ├── copy-sanitizer.js
        ├── selection-renderer.js
        ├── selection-fix.css
        └── _locales/
```

The Xcode project contains a macOS container App and an embedded Safari Web
Extension.

## Requirements

- macOS 27 or later
- Safari 27 or later
- Xcode 27 or later
- A local Apple Development signing identity for normal development use

The current project is intentionally built for macOS 27 and is not intended to
support older macOS versions.

## Build

### Xcode

1. Open `triple-click-fix.xcodeproj`.
2. Select the `triple-click-fix` scheme.
3. Select `My Mac` as the run destination.
4. Build the project with `Product > Build` or Run it with `Product > Run`.

### Command line

Use Xcode's developer directory explicitly:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -project triple-click-fix.xcodeproj \
  -scheme triple-click-fix \
  -configuration Debug \
  -derivedDataPath /private/tmp/triple-click-fix-derived \
  build
```

The built container App is:

```text
/private/tmp/triple-click-fix-derived/Build/Products/Debug/triple-click-fix.app
```

The Safari extension is embedded at:

```text
triple-click-fix.app/Contents/PlugIns/triple-click-fix Extension.appex
```

## Signing

### Local development

Safari must be able to validate the extension's code signature. An ad-hoc
signature can work only with Safari's temporary unsigned-extension developer
mode and is not a suitable normal installation.

For normal local development:

1. Sign in to Xcode with an Apple ID.
2. Select a Personal Team or another Apple Development team.
3. Set the same `DEVELOPMENT_TEAM` on both targets:
   - `triple-click-fix`
   - `triple-click-fix Extension`
4. Keep `Automatically manage signing` enabled.
5. Build again with Xcode or with `-allowProvisioningUpdates`.

Command-line example using a placeholder team ID:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild \
  -project triple-click-fix.xcodeproj \
  -scheme triple-click-fix \
  -configuration Debug \
  -derivedDataPath /private/tmp/triple-click-fix-signed \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID \
  build
```

Do not commit certificates, private keys, provisioning profiles, saved
passwords, or personal team identifiers to the repository.

### Local installation

Copy the built App to a stable location after it is signed:

```bash
mkdir -p "$HOME/Applications"
cp -R \
  /private/tmp/triple-click-fix-signed/Build/Products/Debug/triple-click-fix.app \
  "$HOME/Applications/triple-click-fix.app"
```

Launch it once to register the extension with Safari. The container App does
not need to remain open after registration.

### Distribution

An `Apple Development` build is tied to the developer's Apple ID, team, signing
identity, and development environment. It is not a distribution artifact.

Do not send a locally built `.app` directly to another person as a production
release. External distribution requires:

1. A paid Apple Developer Program membership.
2. A `Developer ID Application` signing identity.
3. Hardened Runtime and release signing.
4. A Release Archive.
5. Notarization and stapling.
6. Distribution as a signed and notarized `.dmg` or equivalent package.

Development signatures and certificates also expire, so a released product
must be rebuilt and re-signed through the release process when required.

## Usage

1. Launch the signed `triple-click-fix.app` once.
2. Click the button in the container App or open:
   `Safari > Settings > Extensions`.
3. Enable `Triple Click Fix`.
4. Grant website access. To apply the fix everywhere, allow access on all
   websites.
5. Reload any already-open pages.
6. Triple-click a paragraph and verify:
   - the highlight follows the selected text;
   - copying the paragraph does not append a synthetic blank line.

The container App only registers and manages the Safari extension. The
extension itself runs inside Safari's extension process.

## Compatibility and Limitations

- The extension is designed for macOS Safari and does not change iOS or iPadOS
  Safari.
- The native selection is preserved. The extension only adjusts clipboard
  plain text and the visual highlight layer.
- The copy cleanup is deliberately conservative. If the extension cannot prove
  that a trailing newline is synthetic, it leaves the clipboard unchanged.
- The renderer excludes inputs, textareas, selects, and contenteditable
  elements.
- Custom highlight painting depends on the CSS Custom Highlight API. If the
  API is unavailable or registration fails, Safari's native selection
  rendering is used.

## License

This project is released without restrictions. You may use, modify, and
distribute it freely, including for commercial purposes.
