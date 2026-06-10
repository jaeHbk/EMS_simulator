// React 18 root render. Mounts the app shell into #root (see index.html).

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" not found in index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
