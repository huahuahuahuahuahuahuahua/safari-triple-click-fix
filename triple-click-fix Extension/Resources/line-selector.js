(() => {
    "use strict";

    const namespace = globalThis.__tripleClickFix =
        globalThis.__tripleClickFix || {};
    const model = namespace.model;

    if (!model || namespace.lineSelectorInstalled) {
        return;
    }
    namespace.lineSelectorInstalled = true;

    function keepCaretOnClickedLine(caret, event) {
        const node = caret.startContainer;
        const offset = caret.startOffset;
        if (node.nodeType !== Node.TEXT_NODE || offset === 0) {
            return;
        }

        // A click on the right half of the last glyph can return the offset
        // shared by two soft-wrapped lines. Range loses WebKit's upstream
        // affinity, so collapse inside the preceding glyph when it is on the
        // clicked line. At the next line's start its geometry will not match.
        let previousOffset = offset - 1;
        if (previousOffset > 0 && /[\uDC00-\uDFFF]/.test(node.data[previousOffset]) &&
            /[\uD800-\uDBFF]/.test(node.data[previousOffset - 1])) {
            previousOffset -= 1;
        }
        const glyph = document.createRange();
        glyph.setStart(node, previousOffset);
        glyph.setEnd(node, offset);
        const vertical = getComputedStyle(node.parentElement)
            .writingMode.startsWith("vertical");
        const onClickedLine = Array.from(glyph.getClientRects()).some(rect =>
            rect.width > 0 && rect.height > 0 && (vertical
                ? event.clientX >= rect.left && event.clientX < rect.right
                : event.clientY >= rect.top && event.clientY < rect.bottom)
        );
        if (onClickedLine) {
            caret.setStart(node, previousOffset);
            caret.collapse(true);
        }
    }

    function onMouseDown(event) {
        if (
            event.detail !== 3 || event.button !== 0 ||
            event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ||
            event.defaultPrevented || !event.cancelable ||
            document.designMode === "on" ||
            event.composedPath().some(node => model.isEditableNode(node))
        ) {
            return;
        }

        const selection = window.getSelection();
        if (!selection || typeof selection.modify !== "function" ||
            typeof document.caretRangeFromPoint !== "function") {
            return;
        }

        const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
        if (!caret || model.isEditableNode(caret.startContainer)) {
            return;
        }

        // Save direction as well as endpoints for the unsupported/empty fallback.
        const previous = {
            anchorNode: selection.anchorNode,
            anchorOffset: selection.anchorOffset,
            focusNode: selection.focusNode,
            focusOffset: selection.focusOffset
        };

        try {
            keepCaretOnClickedLine(caret, event);
            selection.removeAllRanges();
            selection.addRange(caret);
            // WebKit computes visual line boundaries, including soft wrapping,
            // inline markup and bidi text. Do not use paragraph or DOM boundaries.
            selection.modify("move", "backward", "lineboundary");
            selection.modify("extend", "forward", "lineboundary");
            if (selection.isCollapsed || !selection.toString() ||
                model.isEditableSelection(selection)) {
                throw new Error("No selectable line at the click position");
            }

            // Cancel the third mousedown's paragraph-selection default action.
            // Updating only the highlight would leave extra lines in the clipboard.
            event.preventDefault();
        } catch (_error) {
            selection.removeAllRanges();
            if (previous.anchorNode && previous.focusNode) {
                selection.setBaseAndExtent(
                    previous.anchorNode, previous.anchorOffset,
                    previous.focusNode, previous.focusOffset
                );
            }
        }
    }

    document.addEventListener("mousedown", onMouseDown, true);
})();
