import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getExtensionEnv } from "../../src/env";
import { PopupApp } from "../../src/popup-app";
import "./style.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("The popup root element is missing");
}

createRoot(container).render(
  <StrictMode>
    <PopupApp googleEnabled={getExtensionEnv().googleAuthEnabled} />
  </StrictMode>,
);
