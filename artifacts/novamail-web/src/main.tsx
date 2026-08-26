import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import App from "./App";
import "./index.css";

setAuthTokenGetter(() => sessionStorage.getItem("novamail-access"));

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
