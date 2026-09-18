(() => {
    "use strict";

    const namespace = globalThis.__tripleClickFix =
        globalThis.__tripleClickFix || {};

    const model = namespace.model;

    if (!model) {
        return;
    }

    const READY_CLASS = "__triple-click-fix-ready";
    const HIGHLIGHT_NAME = "triple-click-fix-highlight";

    let scheduledFrame = 0;

    function supportsCustomHighlight() {
        return Boolean(
            window.CSS &&
            CSS.highlights &&
            typeof Highlight === "function"
        );
    }

    function clearHighlight() {
        if (supportsCustomHighlight()) {
            CSS.highlights.delete(HIGHLIGHT_NAME);
        }
    }

    function useNativeSelection() {
        document.documentElement.classList.remove(READY_CLASS);
        clearHighlight();
    }

    function useCustomSelection(ranges) {
        if (!supportsCustomHighlight()) {
            useNativeSelection();
            return false;
        }

        try {
            CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
            return true;
        } catch (_error) {
            useNativeSelection();
            return false;
        }
    }

    function validRanges(selection) {
        const ranges = [];

        for (let index = 0; index < selection.rangeCount; index += 1) {
            const range = selection.getRangeAt(index);

            if (!range.collapsed) {
                ranges.push(range.cloneRange());
            }
        }

        return ranges;
    }

    function renderSelection() {
        scheduledFrame = 0;

        const selection = window.getSelection();

        if (model.isCollapsedOrEmpty(selection)) {
            document.documentElement.classList.remove(READY_CLASS);
            useNativeSelection();
            return;
        }

        if (model.isEditableSelection(selection)) {
            document.documentElement.classList.remove(READY_CLASS);
            useNativeSelection();
            return;
        }

        const ranges = validRanges(selection);

        if (ranges.length === 0) {
            document.documentElement.classList.remove(READY_CLASS);
            useNativeSelection();
            return;
        }

        if (useCustomSelection(ranges)) {
            document.documentElement.classList.add(READY_CLASS);
        } else {
            document.documentElement.classList.remove(READY_CLASS);
        }
    }

    function scheduleRender() {
        if (scheduledFrame) {
            return;
        }

        scheduledFrame = window.requestAnimationFrame(renderSelection);
    }

    function initialize() {
        if (!supportsCustomHighlight()) {
            return;
        }

        document.addEventListener("selectionchange", scheduleRender, true);
        document.addEventListener("pointerup", scheduleRender, true);
        document.addEventListener("keyup", scheduleRender, true);

        scheduleRender();
    }

    if (document.documentElement) {
        initialize();
    } else {
        document.addEventListener("DOMContentLoaded", initialize, {
            once: true
        });
    }
})();
