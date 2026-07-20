import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/base.css";

// Platform hook for CSS (e.g. macOS traffic-light inset).
if (navigator.userAgent.includes("Mac")) {
  document.documentElement.dataset.platform = "mac";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
