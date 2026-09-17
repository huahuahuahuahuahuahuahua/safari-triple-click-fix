(() => {
    "use strict";

    const namespace = globalThis.__tripleClickFix =
        globalThis.__tripleClickFix || {};

    const model = namespace.model;

    if (!model) {
        return;
    }

    const READY_CLASS = "__triple-click-fix-ready";
    const NATIVE_CLASS = "__triple-click-fix-native";

    let host = null;
    let shadowRoot = null;
    let rectLayer = null;
    let scheduledFrame = 0;
    let mutationObserver = null;

    function createOverlay() {
        host = document.createElement("div");
        host.id = "__triple-click-fix-overlay";
        host.setAttribute("aria-hidden", "true");

        host.style.setProperty("all", "initial", "important");
        host.style.setProperty("position", "fixed", "important");
        host.style.setProperty("inset", "0", "important");
        host.style.setProperty("display", "block", "important");
        host.style.setProperty("overflow", "visible", "important");
        host.style.setProperty("pointer-events", "none", "important");
        host.style.setProperty("z-index", "2147483647", "important");

        shadowRoot = host.attachShadow({ mode: "open" });

        const style = document.createElement("style");
        style.textContent = `
            :host {
                all: initial;
                position: fixed;
                inset: 0;
                display: block;
                overflow: visible;
                pointer-events: none;
                z-index: 2147483647;
            }

            #layer {
                position: fixed;
                inset: 0;
                display: block;
                overflow: hidden;
                pointer-events: none;
            }

            .rect {
                position: absolute;
                display: block;
                margin: 0;
                padding: 0;
                border: 0;
                background: rgba(0, 105, 220, 0.45);
                pointer-events: none;
                transform: translateZ(0);
            }

            @media (prefers-color-scheme: dark) {
                .rect {
                    background: rgba(10, 115, 235, 0.48);
                }
            }

            @media (forced-colors: active) {
                .rect {
                    background: Highlight;
                }
            }
        `;

        rectLayer = document.createElement("div");
        rectLayer.id = "layer";

        shadowRoot.append(style, rectLayer);
        mountOverlay();
    }

    function mountOverlay() {
        if (!host || host.isConnected) {
            return;
        }

        let parent = document.body;

        if (!parent && document.readyState !== "loading") {
            parent = document.documentElement;
        }

        if (parent) {
            parent.appendChild(host);
        }
    }

    function clearRects() {
        if (rectLayer) {
            rectLayer.replaceChildren();
        }
    }

    function useNativeSelection() {
        document.documentElement.classList.add(NATIVE_CLASS);
        clearRects();
    }

    function useCustomSelection() {
        document.documentElement.classList.remove(NATIVE_CLASS);
    }

    function appendRect(rect) {
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }

        const element = document.createElement("div");
        element.className = "rect";
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.top}px`;
        element.style.width = `${rect.width}px`;
        element.style.height = `${rect.height}px`;
        rectLayer.appendChild(element);
    }

    function renderSelection() {
        scheduledFrame = 0;
        mountOverlay();
        clearRects();

        const selection = window.getSelection();

        if (model.isCollapsedOrEmpty(selection)) {
            useCustomSelection();
            return;
        }

        if (model.isEditableSelection(selection)) {
            useNativeSelection();
            return;
        }

        let renderedAnyRect = false;

        for (let index = 0; index < selection.rangeCount; index += 1) {
            const range = selection.getRangeAt(index);

            if (range.collapsed) {
                continue;
            }

            for (const rect of Array.from(range.getClientRects())) {
                if (rect.width > 0 && rect.height > 0) {
                    appendRect(rect);
                    renderedAnyRect = true;
                }
            }
        }

        if (renderedAnyRect) {
            useCustomSelection();
        } else {
            useNativeSelection();
        }
    }

    function scheduleRender() {
        if (scheduledFrame) {
            return;
        }

        scheduledFrame = window.requestAnimationFrame(() => {
            try {
                renderSelection();
            } catch (_error) {
                scheduledFrame = 0;
                clearRects();
                document.documentElement.classList.remove(READY_CLASS);
            }
        });
    }

    function initialize() {
        createOverlay();

        if (!host || !rectLayer) {
            return;
        }

        document.documentElement.classList.add(READY_CLASS);
        scheduleRender();

        document.addEventListener("selectionchange", scheduleRender, true);
        document.addEventListener("pointerup", scheduleRender, true);
        document.addEventListener("keyup", scheduleRender, true);
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                mountOverlay();
                scheduleRender();
            },
            { once: true }
        );
        window.addEventListener("scroll", scheduleRender, true);
        window.addEventListener("resize", scheduleRender);

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", scheduleRender);
            window.visualViewport.addEventListener("scroll", scheduleRender);
        }

        mutationObserver = new MutationObserver(() => {
            const selection = window.getSelection();

            if (!model.isCollapsedOrEmpty(selection)) {
                scheduleRender();
            }
        });

        mutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    if (document.documentElement) {
        initialize();
    } else {
        document.addEventListener("DOMContentLoaded", initialize, {
            once: true
        });
    }
})();
