import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import OrderMapping from "./OrderMapping.jsx";
import { legacyRedirectFor, resolveRootPath, ROOT_NAMES } from "./routeConfig.js";
import "./styles.css";

const legacyPath = legacyRedirectFor(window.location.pathname);
if (legacyPath) {
  window.history.replaceState({}, "", legacyPath);
}

const Root = resolveRootPath(window.location.pathname) === ROOT_NAMES.ORDER_MAPPING ? OrderMapping : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
