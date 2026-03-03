import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts (variable) — keeps typography consistent across devices.
// If you remove these, we fall back to system stacks.
import "@fontsource-variable/inter";
import "@fontsource-variable/quicksand";
import "@fontsource-variable/literata";

import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);