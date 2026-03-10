import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyAppTheme, loadAppTheme } from "./lib/appThemes";

// Apply persisted theme before first render to avoid flash of default theme
applyAppTheme(loadAppTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
