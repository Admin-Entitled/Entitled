import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import OrderMapping from "./OrderMapping.jsx";
import "./styles.css";

if (window.location.pathname === "/delivery-resolution") {
  window.history.replaceState({}, "", "/order-mapping");
}

const Root = window.location.pathname === "/order-mapping" ? OrderMapping : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
