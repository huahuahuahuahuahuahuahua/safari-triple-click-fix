(() => {
    "use strict";

    const namespace = globalThis.__tripleClickFix =
        globalThis.__tripleClickFix || {};

    const BLOCK_SELECTOR = [
        "p",
        "div",
        "li",
        "td",
        "th",
        "blockquote",
        "pre",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6"
    ].join(",");

    const EDITABLE_SELECTOR = [
        "input",
        "textarea",
        "select",
        "[contenteditable]:not([contenteditable='false'])"
    ].join(",");

    function elementFor(node) {
        if (!node) {
            return null;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            return node;
        }

        return node.parentElement || null;
    }

    function closest(element, selector) {
        if (!element || typeof element.closest !== "function") {
            return null;
        }

        return element.closest(selector);
    }

    function isEditableNode(node) {
        return Boolean(closest(elementFor(node), EDITABLE_SELECTOR));
    }

    function getSemanticBlock(node) {
        return closest(elementFor(node), BLOCK_SELECTOR);
    }

    function isWhitespaceOnlyText(node) {
        return (
            node &&
            node.nodeType === Node.TEXT_NODE &&
            /^\s*$/.test(node.data)
        );
    }

    function lastMeaningfulChild(element) {
        if (!element) {
            return null;
        }

        let child = element.lastChild;

        while (child) {
            if (!isWhitespaceOnlyText(child)) {
                return child;
            }

            child = child.previousSibling;
        }

        return null;
    }

    function hasTrailingLineBreak(node) {
        if (!node) {
            return false;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            return /(?:\r\n|\r|\n)$/.test(node.data);
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        if (node.tagName === "BR") {
            return true;
        }

        return hasTrailingLineBreak(lastMeaningfulChild(node));
    }

    function hasExplicitTrailingLineBreak(range) {
        let fragment;

        try {
            fragment = range.cloneContents();
        } catch (_error) {
            return true;
        }

        return hasTrailingLineBreak(lastMeaningfulChild(fragment));
    }

    function getSingleBlockRangeInfo(range) {
        if (!range || range.collapsed) {
            return null;
        }

        if (
            isEditableNode(range.startContainer) ||
            isEditableNode(range.endContainer)
        ) {
            return null;
        }

        const startBlock = getSemanticBlock(range.startContainer);
        const endBlock = getSemanticBlock(range.endContainer);

        if (!startBlock || startBlock !== endBlock) {
            return null;
        }

        return {
            block: startBlock,
            hasExplicitTrailingLineBreak:
                hasExplicitTrailingLineBreak(range)
        };
    }

    function removeOneTrailingLineBreak(text) {
        if (typeof text !== "string" || text.length === 0) {
            return null;
        }

        let breakLength = 0;

        if (text.endsWith("\r\n")) {
            breakLength = 2;
        } else if (text.endsWith("\n") || text.endsWith("\r")) {
            breakLength = 1;
        }

        if (breakLength === 0) {
            return null;
        }

        const withoutBreak = text.slice(0, -breakLength);

        // Multiple trailing breaks are more likely to be intentional.
        if (/(?:\r\n|\r|\n)$/.test(withoutBreak)) {
            return null;
        }

        return withoutBreak;
    }

    function isCollapsedOrEmpty(selection) {
        return (
            !selection ||
            selection.isCollapsed ||
            selection.rangeCount === 0
        );
    }

    function isEditableSelection(selection) {
        if (isCollapsedOrEmpty(selection)) {
            return false;
        }

        for (let index = 0; index < selection.rangeCount; index += 1) {
            const range = selection.getRangeAt(index);

            if (
                isEditableNode(range.startContainer) ||
                isEditableNode(range.endContainer)
            ) {
                return true;
            }
        }

        return false;
    }

    namespace.model = Object.freeze({
        getSemanticBlock,
        isEditableNode,
        isEditableSelection,
        isCollapsedOrEmpty,
        getSingleBlockRangeInfo,
        removeOneTrailingLineBreak
    });
})();
