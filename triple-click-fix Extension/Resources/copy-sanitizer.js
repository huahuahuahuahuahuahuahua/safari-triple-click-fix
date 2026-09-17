(() => {
    "use strict";

    const namespace = globalThis.__tripleClickFix =
        globalThis.__tripleClickFix || {};

    const model = namespace.model;

    if (!model) {
        return;
    }

    const TRIPLE_CLICK_WINDOW_MS = 5000;

    let lastTripleClickAt = Number.NEGATIVE_INFINITY;

    function recordPointerClick(event) {
        if (event.detail >= 3) {
            lastTripleClickAt = performance.now();
        }
    }

    function recordMouseClick(event) {
        if (event.detail >= 3) {
            lastTripleClickAt = performance.now();
        }
    }

    function wasRecentTripleClick() {
        return performance.now() - lastTripleClickAt <=
            TRIPLE_CLICK_WINDOW_MS;
    }

    function readClipboardData(clipboardData, type) {
        if (!clipboardData || typeof clipboardData.getData !== "function") {
            return "";
        }

        try {
            return clipboardData.getData(type) || "";
        } catch (_error) {
            return "";
        }
    }

    function getPlainText(clipboardData, selection) {
        return (
            readClipboardData(clipboardData, "text/plain") ||
            selection.toString()
        );
    }

    function readHtml(clipboardData, range) {
        const nativeHtml = readClipboardData(clipboardData, "text/html");

        if (nativeHtml) {
            return nativeHtml;
        }

        const container = document.createElement("div");
        container.appendChild(range.cloneContents());
        return container.innerHTML;
    }

    function shouldSanitize(range, plainText) {
        const rangeInfo = model.getSingleBlockRangeInfo(range);

        if (!rangeInfo) {
            return null;
        }

        if (rangeInfo.hasExplicitTrailingLineBreak) {
            return null;
        }

        return model.removeOneTrailingLineBreak(plainText);
    }

    function onCopy(event) {
        const clipboardData = event.clipboardData;
        const selection = window.getSelection();

        if (
            !clipboardData ||
            !wasRecentTripleClick() ||
            model.isCollapsedOrEmpty(selection) ||
            selection.rangeCount !== 1
        ) {
            return;
        }

        const range = selection.getRangeAt(0);
        const plainText = getPlainText(clipboardData, selection);
        const html = readHtml(clipboardData, range);
        const fixedText = shouldSanitize(range, plainText);

        if (fixedText === null || fixedText === plainText) {
            return;
        }

        let wrotePlainText = false;

        try {
            clipboardData.setData("text/plain", fixedText);
            wrotePlainText = true;
        } catch (_error) {
            // If Safari rejects clipboard mutation, leave the native copy alone.
        }

        if (!wrotePlainText) {
            return;
        }

        if (html) {
            try {
                clipboardData.setData("text/html", html);
            } catch (_error) {
                // Keep the corrected plain-text flavor if HTML cannot be set.
            }
        }

        event.preventDefault();
    }

    document.addEventListener("pointerdown", recordPointerClick, true);
    document.addEventListener("mousedown", recordMouseClick, true);
    document.addEventListener("copy", onCopy, true);
})();
