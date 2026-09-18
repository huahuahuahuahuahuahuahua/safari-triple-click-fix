# Safari Triple Click Fix - Engineering Handoff

## Current requirement — 2026-09-18

The user explicitly changed the required selection semantics: a triple-click
must select **one visual line under the pointer**, not the entire paragraph.
This supersedes the previous instruction to preserve native triple-click
paragraph semantics. The older render/copy validation below is historical.

`line-selector.js` now cancels the third unmodified primary-button mousedown
after selecting the clicked line using `caretRangeFromPoint` and native
`Selection.modify(..., "lineboundary")`. The actual `Selection` is changed;
CSS Custom Highlights continue to paint its ranges without a fixed overlay.

Soft-wrap affinity matters: clicking the trailing half of a line's final glyph
can return the next line's starting DOM offset. A preceding-glyph geometry
check moves the caret inside the clicked line before extending to boundaries.
Do not remove this adjustment: the Safari regression page reproduced this
failure in both plain text and inline markup.

Editable surfaces, designMode, modifier clicks, other mouse buttons and
single/double clicks use native behavior. Missing APIs, empty lines and failed
selection attempts fall back to Safari. The handler runs synchronously before
the native paragraph-selection default; no delayed selection rewrite is used.

Validation of this change: Safari's regression page passed 19/19 checks for
wrapped first/middle/last lines, both soft-wrap edges, inline markup, BR/pre
line breaks, Chinese, horizontal scrolling, and excluded click/editable cases.
A real mouse triple-click also selected exactly the middle wrapped line.
The fixture is `tests/line-selection.html`; synthetic events alone do not
establish native mouse-event or installed-extension behavior on other sites.

Installed validation completed with signed version **1.1.3 (build 3)**.
App, extension and manifest versions match; installed `line-selector.js` matches
the tested source and `codesign --verify --deep --strict` passed.

On the existing Safari V2EX tab (`https://v2ex.com/t/1242839#reply13`),
real triple-clicks separately selected the first wrapped line ending in
`Decision`, the final line `Model 产品。`, and reply 4 without selecting reply 5.
Copying the first wrapped line and pasting into the local fixture textarea
contained only that line. No page-context injection was used on V2EX.

## 1. Purpose

This document is the engineering handoff for maintaining
`safari-triple-click-fix`. It records the observed Safari behavior, the
implemented fixes, design constraints, validation history, build and signing
workflow, known limitations, and the recommended next work.

It is intentionally more direct than `README.md`. `README.md` describes how a
user installs and uses the extension. This document describes what a developer
must know before changing it.

Repository:

```text
git@github.com:huahuahuahuahuahuahuahua/safari-triple-click-fix.git
```

Local checkout:

```text
/Users/bangcheng.tan/Documents/triple-click-fix
```

Current committed baseline:

```text
64e7544 Use native highlights for scroll-stable selection
```

As of 2026-09-18, the working tree also contains uncommitted automatic
versioning changes. See section 10.

## 2. Problem Statement

The extension addresses two Safari-specific symptoms caused by triple-clicking
a paragraph on macOS:

1. Safari can place a synthetic trailing newline or blank line in the
   `text/plain` clipboard flavor even when there is no concrete trailing `<br>`
   or newline in the selected DOM fragment.
2. Safari can paint the selection highlight across a much wider block,
   including margins and empty space, instead of tightly following the selected
   text.

The same pages did not show these symptoms in Chrome or Edge. The DOM
`Selection` and `Range` could be correct while Safari's rendering or clipboard
serialization was not.

The original fix preserved Safari's paragraph-selection semantics and made
two narrow corrections (the new line-selection requirement above supersedes
that restriction):

- remove only a demonstrably synthetic trailing newline from plain text;
- replace only the visual painting layer while continuing to use Safari's
  native `Selection` and `Range`.

## 3. Target and Scope

- Target platform: macOS 27 only
- Browser: Safari 27
- Not a target: iOS or iPadOS Safari
- Deployment target in Xcode: `27.0`
- The project intentionally does not support older macOS releases.

The extension is a Safari Web Extension packaged inside a macOS container App.
The container App registers the extension and opens Safari settings. The actual
behavior runs as content scripts inside Safari.

## 4. Repository Layout

```text
triple-click-fix/
├── HANDOFF.md
├── README.md
├── build-number.txt
├── scripts/
│   └── build-and-install.sh
├── triple-click-fix.xcodeproj/
├── triple-click-fix/
│   ├── AppDelegate.swift
│   ├── ViewController.swift
│   ├── Assets.xcassets/
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
        ├── _locales/
        ├── images/
        └── popup files
```

Important source files:

| File | Responsibility |
| --- | --- |
| `line-selector.js` | Selects the clicked visual line and cancels native paragraph selection |
| `selection-model.js` | Shared selection classification and newline rules |
| `copy-sanitizer.js` | Mutates `text/plain` only when the selected fragment proves that Safari appended a synthetic newline |
| `selection-renderer.js` | Registers native ranges with the CSS Custom Highlight API |
| `selection-fix.css` | Suppresses native selected background and styles the custom highlight |
| `manifest.json` | Declares content scripts, all URLs, all frames, and `document_start` |
| `ViewController.swift` | Reports extension state and opens Safari extension settings |
| `build-and-install.sh` | Increments version, builds, verifies signature, and installs |

## 5. Implemented Design

### 5.1 Native Selection with visual line boundaries

`line-selector.js` changes triple-click selection to a visual line using
WebKit line-boundary navigation. The renderer still consumes the resulting
native `Selection` and `Range` without a separate coordinate system.

`selection-renderer.js` reads the existing selection:

```js
window.getSelection()
selection.getRangeAt(index).cloneRange()
```

It registers those ranges with the CSS Custom Highlight API:

```js
CSS.highlights.set(
    "triple-click-fix-highlight",
    new Highlight(...ranges)
);
```

The browser then owns the painting layer. This is why the highlight follows
horizontal scrolling, nested scroll containers, zoom changes, and layout
updates without manual coordinate synchronization.

`selection-fix.css` makes the native selection background transparent while
the custom highlight is active:

```css
html.__triple-click-fix-ready ::selection {
    background-color: transparent !important;
    color: inherit !important;
}

::highlight(triple-click-fix-highlight) {
    background-color: rgba(0, 98, 210, 0.58);
    color: inherit;
}
```

The actual highlight color is intentionally stronger than the earlier
lightweight overlay: `rgba(0, 98, 210, 0.58)` in light mode and
`rgba(0, 112, 225, 0.62)` in dark mode.

### 5.2 Why the previous overlay was removed

An earlier implementation used a fixed overlay and manually copied
`Range.getClientRects()` rectangles into it. The overlay could drift outside
nested horizontal scroll containers because viewport coordinates were
recomputed at the wrong level or at the wrong time.

That approach was replaced in commit `64e7544` with native CSS Custom
Highlights. Do not reintroduce a fixed overlay merely to control appearance
unless a concrete Safari limitation requires it. It creates a second
coordinate system that must stay synchronized with every scroll container,
zoom level, and layout mutation.

### 5.3 Custom highlight fallback

`selection-renderer.js` checks for:

```js
window.CSS &&
CSS.highlights &&
typeof Highlight === "function"
```

If the API is unavailable, or registration throws, it removes the custom-ready
class and the custom highlight. Safari then uses its native selection
rendering. The fallback is deliberate: hiding the native selection without a
working replacement would make text appear unselected.

Editable controls are excluded:

- `input`
- `textarea`
- `select`
- `[contenteditable]` unless explicitly set to `false`

When the selection is collapsed, empty, invalid, or editable, the extension
returns to native rendering.

### 5.4 Copy sanitization

`copy-sanitizer.js` listens to the native `copy` event during capture phase.
It mutates the clipboard only when all of these conditions hold:

1. A triple-click was observed within the previous 5 seconds.
2. The selection has exactly one range.
3. The range starts and ends in the same semantic block.
4. The block is not an editable control.
5. The selected DOM fragment has no explicit trailing line break.
6. The plain text ends with exactly one newline sequence.
7. The preceding text does not end with another newline.

When those checks pass, it removes exactly one trailing `\n`, `\r`, or `\r\n`
from `text/plain`, preserves the HTML flavor, and prevents Safari's original
copy action from overwriting the correction.

The semantic block selector is:

```text
p, div, li, td, th, blockquote, pre, h1, h2, h3, h4, h5, h6
```

The conservative behavior is intentional. A false positive corrupts copied
content. A false negative leaves one Safari quirk in place. The implementation
prefers the latter.

### 5.5 Container App behavior

The container App is deliberately minimal. `ViewController.swift` checks
Safari extension state through `SFSafariExtensionManager` and provides a
button that opens Safari settings through
`SFSafariApplication.showPreferencesForExtension`.

The extension bundle identifier is hard-coded in Swift:

```swift
let extensionBundleIdentifier = "com.bangcheng.tripleclickfix.Extension"
```

If the bundle identifiers are changed, this string and both Xcode target
settings must be updated together.

## 6. Runtime Flow

1. The user launches the signed container App once.
2. Safari registers the embedded extension.
3. The user enables `Triple Click Fix` in Safari Settings and grants website
   access.
4. The content scripts load at `document_start` in all frames for all URLs.
5. `selection-model.js` exposes shared classification helpers.
6. `copy-sanitizer.js` records triple-click timing and intercepts copy events.
   `line-selector.js` replaces the third mousedown default with visual-line selection.
7. `selection-renderer.js` listens for selection changes and posts native
   ranges to the CSS Custom Highlight API.
8. If custom highlight support fails, native Safari selection rendering
   remains active.

The container App does not need to remain open after registration.

## 7. Validation History

The following behavior was validated on the local macOS 27 and Safari 27
environment during development:

- Triple-click paragraph selection renders with the custom highlight color.
- The highlight remains attached to the selected text while horizontal
  scrolling occurs.
- The previous fixed-overlay drift bug was reproduced and eliminated by the
  native highlight implementation.
- Copy correction was tested through the browser console and through clipboard
  inspection.
- The native selection and range behavior is preserved.

This is not a complete compatibility claim. There is no automated test suite,
no cross-site matrix, and no CI verification in the repository. Treat the
current implementation as a validated local fix, not as a release-grade
verified product.

## 8. Known Limitations and Risks

### 8.1 Regression coverage

`tests/line-selection.html` runs browser regression assertions in Safari.
There is still no CI runner or complete browser integration suite.
The highest-value future tests are:

- a synthetic DOM corpus for `removeOneTrailingLineBreak`;
- copy-event tests for one-block versus multi-block selections;
- explicit `<br>` and multiple-newline negative cases;
- editable control negative cases;
- scroll and nested-scroll rendering checks;
- fallback behavior when `CSS.highlights` is unavailable.

The model logic is small enough to unit test without Safari. Rendering behavior
requires Safari automation or a real manual matrix.

### 8.2 The three-click time window is heuristic

`copy-sanitizer.js` only sanitizes if a pointer or mouse event with
`event.detail >= 3` occurred within 5 seconds. This prevents the extension from
silently changing ordinary keyboard or programmatic copies, but it also means
that a delayed copy after a triple-click may not be corrected.

Do not broaden this rule without proving that the new path cannot damage
intentional line breaks.

### 8.3 Semantic block matching is intentionally narrow

The selection must start and end inside the same element matched by
`BLOCK_SELECTOR`. Nested or non-standard layouts may fall back to native copy
behavior. That is safer than guessing whether a newline was meaningful.

### 8.4 The custom highlight changes appearance globally

The extension suppresses native `::selection` background while its custom
highlight is active. It preserves color, but site-specific selection styles
may not be reproduced exactly. The forced-colors fallback uses system
`Highlight` and `HighlightText`.

### 8.5 All URLs and all frames

The manifest injects into `<all_urls>` and all frames. This is necessary for a
general-purpose Safari fix, but it increases blast radius. Any future change
must be tested on hostile or unusual pages:

- SPAs that replace the document tree;
- cross-origin iframes;
- pages with shadow DOM;
- pages with many nested scroll containers;
- pages that already use `CSS.highlights`;
- editable rich-text surfaces.

In particular, the extension currently calls
`CSS.highlights.set("triple-click-fix-highlight", ...)`. The name is namespaced,
but the extension still shares the page's highlight registry. Verify that it
does not collide with a site's own highlight names before broadening the
implementation.

### 8.6 Platform-specific API dependency

The approach depends on CSS Custom Highlight API support in Safari 27. The
fallback keeps the page usable if support is unavailable, but the visual fix
will not apply.

### 8.7 Local development identity

The Xcode project currently contains:

```text
DEVELOPMENT_TEAM = 2U4LK3CJHS
```

This is a local development team setting, not a distribution identity. A
standard `Apple Development` signature is tied to the developer's Apple ID,
team, machine, and certificate. Copying a local `.app` to another person is not
a supported distribution path.

### 8.8 Source metadata still contains personal identifiers

Git commit authors and committers have been rewritten to:

```text
huahuahuahuahuahuahuahua <assans82@hotmail.com>
```

The reachable Git history reflects that identity. However, source comments,
the Bundle ID, and Xcode project metadata still contain `Tan Bangcheng` or
`bangcheng` strings. If the goal is complete anonymity or a neutral public
project, those must be cleaned separately from Git history.

## 9. Build, Sign, and Install

### 9.1 Prerequisites

- macOS 27
- Xcode 27 at `/Applications/Xcode.app`
- A valid local Apple Development signing identity in the login keychain
- Xcode account/signing access

The shell's default `xcode-select` may point at Command Line Tools. The build
script sets `DEVELOPER_DIR` explicitly, so use the script instead of relying on
the global selection.

### 9.2 Automatic version build

From the repository root:

```bash
./scripts/build-and-install.sh
```

Each invocation:

1. Reads `build-number.txt`.
2. Increments the number.
3. Writes `MARKETING_VERSION=1.1.N` into `manifest.json`.
4. Passes `MARKETING_VERSION=1.1.N` to Xcode.
5. Passes `CURRENT_PROJECT_VERSION=N` to Xcode.
6. Builds the Debug configuration.
7. Runs `codesign --verify --deep --strict` on the result.
8. Replaces `$HOME/Applications/triple-click-fix.app`.

Example output:

```text
==> Building version 1.1.2 (build 2)
** BUILD SUCCEEDED **
==> Installed 1.1.2 (build 2)
    /Users/bangcheng.tan/Applications/triple-click-fix.app
```

The script's version increment is authoritative only when the script is used.
A normal Xcode GUI Build does not increment `build-number.txt` or
`manifest.json`.

### 9.3 Manual Xcode build

Open `triple-click-fix.xcodeproj`, select the `triple-click-fix` scheme, select
`My Mac`, and build or run. The embedded extension is produced at:

```text
triple-click-fix.app/Contents/PlugIns/triple-click-fix Extension.appex
```

Manual builds may use the project's default version values rather than the
latest script-generated values.

### 9.4 Verify a built installation

```bash
APP="$HOME/Applications/triple-click-fix.app"

/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleShortVersionString' \
  "$APP/Contents/Info.plist"

/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleVersion' \
  "$APP/Contents/Info.plist"

EXT="$APP/Contents/PlugIns/triple-click-fix Extension.appex"

/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleShortVersionString' \
  "$EXT/Contents/Info.plist"

/usr/libexec/PlistBuddy \
  -c 'Print :CFBundleVersion' \
  "$EXT/Contents/Info.plist"

rg '"version"' "$EXT/Contents/Resources/manifest.json"

codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP"
```

For the tested local installation, the expected version tuple is:

```text
App CFBundleShortVersionString: 1.1.2
App CFBundleVersion:            2
Extension CFBundleShortVersionString: 1.1.2
Extension CFBundleVersion:            2
manifest.json version:         1.1.2
```

The successful signature inspection showed:

```text
Authority=Apple Development: assans82@hotmail.com (M8GNBWNHGP)
Authority=Apple Worldwide Developer Relations Certification Authority
Authority=Apple Root CA
TeamIdentifier=2U4LK3CJHS
Runtime Version=27.0.0
```

### 9.5 Opening the installed App

Launch the container App once after installation:

```bash
open "$HOME/Applications/triple-click-fix.app"
```

Launching registers the extension with Safari. Existing pages should then be
reloaded so the content scripts are injected.

## 10. Git and Publication State

Remote:

```text
origin git@github.com:huahuahuahuahuahuahuahua/safari-triple-click-fix.git
```

The remote uses SSH, not HTTPS.

At handoff time:

```text
HEAD: 64e7544 Use native highlights for scroll-stable selection
origin/main: 64e7544

Working tree changes:
M  triple-click-fix Extension/Resources/manifest.json
?? build-number.txt
?? scripts/build-and-install.sh
```

The uncommitted changes are the automatic versioning tool. Before publishing
them:

```bash
git add build-number.txt scripts/build-and-install.sh \
  "triple-click-fix Extension/Resources/manifest.json" \
  HANDOFF.md
git commit -m "Add automatic build versioning and handoff notes"
git push origin main
```

Do not commit certificates, private keys, provisioning profiles, API keys, or
other credentials.

## 11. Debugging Playbook

### Use Safari Web Inspector

1. Enable Safari Developer settings.
2. Open the target page.
3. Connect Web Inspector to the page.
4. Inspect the console for content-script errors.
5. Evaluate:

```js
window.getSelection().toString()
window.getSelection().rangeCount
window.getSelection().getRangeAt(0).cloneContents()
CSS.highlights.has("triple-click-fix-highlight")
document.documentElement.classList.contains("__triple-click-fix-ready")
```

### Diagnose copy behavior

Inspect the clipboard through Safari or a controlled test page. Check for:

- a trailing newline;
- whether the DOM fragment has an explicit trailing `<br>`;
- whether the selection starts and ends in the same semantic block;
- whether a triple-click event was recorded recently.

### Diagnose render behavior

Check whether:

- `window.CSS.highlights` exists;
- `Highlight` is a function;
- the custom highlight key exists;
- the ready class is present;
- editable selection detection is excluding the target;
- a site-owned highlight registry is interfering.

Before changing coordinate logic, verify that the actual failure is not a
selection-model classification failure. The current renderer has no manual
coordinates to adjust.

## 12. Recommended Next Work

Priority order:

1. Add unit tests for `selection-model.js`.
2. Extend `tests/line-selection.html` with bidi, vertical text, shadow DOM and
   nested editable boundaries; keep real Safari mouse-event checks.
3. Decide whether versioning metadata should be committed. If yes, commit
   `build-number.txt`, the script, and the synchronized manifest.
4. Remove or replace remaining personal metadata if the public repository is
   intended to be neutral.
5. Test the extension against sites that use `CSS.highlights` themselves.
6. Test cross-origin iframes and shadow-DOM-heavy pages.
7. Define a real distribution path before promising anyone else a usable app.

Do not add a Safari App Extension alternative or a fixed overlay until the
current native-highlight implementation has a reproducible failure that cannot
be fixed within the current design.

## 13. Acceptance Criteria for Future Changes

Any change that claims to preserve the current fix must demonstrate:

- triple-click selects exactly the clicked visual line; native Selection and
  Range remain the source for painting and copying;
- copied plain text is unchanged unless the synthetic-newline predicate is
  satisfied;
- HTML clipboard flavor is preserved;
- explicit line breaks and multiple paragraphs are not damaged;
- editable controls retain native selection behavior;
- the highlight follows nested horizontal scrolling and zoom changes;
- the extension falls back to native rendering when custom highlights fail;
- app, extension, manifest, and build numbers remain consistent.

## 14. License

The project is released without restrictions. It may be used, modified, and
distributed freely, including for commercial purposes.
