import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-kr/wght.css";
import { App } from "./App.jsx";
import "./styles.css";

const root = document.getElementById("root");
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
