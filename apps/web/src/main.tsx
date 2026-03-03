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

const el = document.getElementById("root");
if (!el) {
    throw new Error('Root element "#root" not found. Check apps/web/index.html');
}

createRoot(el).render(
    <StrictMode>
        <App />
    </StrictMode>,
);