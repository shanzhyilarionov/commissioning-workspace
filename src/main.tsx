import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeTheme } from "./styles/theme";
import { initializeWindowMaterial } from "./styles/windowMaterial";

import "./styles/index.css";

initializeTheme();
initializeWindowMaterial();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
