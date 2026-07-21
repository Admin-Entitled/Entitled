import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import DeliveryResolution from "./DeliveryResolution.jsx";
import "./styles.css";

const Root = window.location.pathname === "/delivery-resolution" ? DeliveryResolution : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
