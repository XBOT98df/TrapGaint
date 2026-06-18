import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable default right-click context menu globally
if (typeof window !== "undefined") {
  document.addEventListener("contextmenu", (e) => {
    // Let text inputs keep their context menu for copy/paste if needed,
    // but disable it everywhere else (especially to remove "Reload")
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    e.preventDefault();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
