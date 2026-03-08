// apps/web/src/main.tsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts (variable) — keeps typography consistent across devices.
// If you remove these, we fall back to system stacks.
import "@fontsource-variable/inter";
import "@fontsource-variable/quicksand";
import "@fontsource-variable/literata";

import "./index.css";
import App from "./App";

/**
 * Biblia.to bootstrap
 *
 * Hardened / improved:
 * - explicit root-element assertion
 * - one root only (guards accidental double-mount in weird embeds / HMR edges)
 * - early document markers for app-ready state
 * - safe bootstrap error surfacing
 * - preserves React StrictMode
 */

declare global {
     interface Window {
          __BIBLIA_WEB_ROOT__?: ReturnType<typeof createRoot>;
     }
}

function invariantRootElement(): HTMLElement {
     const element = document.getElementById("root");
     if (!element) {
          throw new Error('Root element "#root" not found. Check apps/web/index.html');
     }
     return element;
}

function markDocumentBootState(state: "booting" | "ready" | "crashed"): void {
     document.documentElement.setAttribute("data-app-state", state);
}

function renderBootstrapError(error: unknown): void {
     const root = document.getElementById("root");
     if (!root) return;

     const message =
          error instanceof Error
               ? error.message
               : typeof error === "string"
                    ? error
                    : "Unknown bootstrap error.";

     root.innerHTML = `
      <main
        style="
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: 24px;
          background: var(--bg, #0b0b0c);
          color: var(--fg, #f4f3f1);
          font: 14px/1.6 Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        "
      >
        <div
          style="
            width: min(680px, 100%);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            padding: 18px 20px;
            background: rgba(255,255,255,0.04);
            box-shadow: 0 18px 50px rgba(0,0,0,0.28);
          "
        >
          <div style="font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.72; margin-bottom:8px;">
            Biblia.to
          </div>
          <h1 style="margin:0 0 8px; font-size:18px; line-height:1.2;">App failed to start</h1>
          <p style="margin:0; opacity:.88; white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>
      </main>
    `;
}

function escapeHtml(value: string): string {
     return value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
}

function bootstrap(): void {
     markDocumentBootState("booting");

     const rootElement = invariantRootElement();
     const root = window.__BIBLIA_WEB_ROOT__ ?? createRoot(rootElement);

     window.__BIBLIA_WEB_ROOT__ = root;

     root.render(
          <StrictMode>
               <App />
          </StrictMode>,
     );

     markDocumentBootState("ready");
}

try {
     bootstrap();
} catch (error) {
     markDocumentBootState("crashed");
     renderBootstrapError(error);
     throw error;
}