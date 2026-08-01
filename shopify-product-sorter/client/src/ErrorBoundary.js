import { Component, createElement } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || "An unexpected error occurred.";
      return createElement(
        "main",
        { className: "dashboard", role: "alert", "aria-live": "assertive" },
        createElement(
          "div",
          { className: "panel", style: { padding: 24, textAlign: "center" } },
          createElement("h2", null, "Something went wrong"),
          createElement("p", { className: "error-text" }, message),
          createElement(
            "button",
            {
              className: "button accent",
              type: "button",
              onClick: () => this.setState({ hasError: false, error: null }),
            },
            "Retry"
          )
        )
      );
    }
    return this.props.children;
  }
}
