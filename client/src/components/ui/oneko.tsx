/**
 * Oneko - Cat follows cursor
 * Based on oneko.js by adryd325
 * https://github.com/adryd325/oneko.js
 * 
 * Local implementation to work in production builds
 */

import { useEffect, useRef } from "react";

let onekoLoaded = false;

export function Oneko() {
  const loadedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple instances
    if (onekoLoaded || loadedRef.current) {
      return;
    }

    // Check if oneko already exists
    if (document.getElementById("oneko")) {
      return;
    }

    loadedRef.current = true;
    onekoLoaded = true;

    // Load local oneko.js script
    const script = document.createElement("script");
    script.src = "/oneko.js";
    script.async = true;
    script.onerror = (err) => {
      console.error("Failed to load oneko:", err);
      onekoLoaded = false;
      loadedRef.current = false;
    };
    document.body.appendChild(script);

    // Cleanup on unmount
    return () => {
      document.getElementById("oneko")?.remove();
      script.remove();
      onekoLoaded = false;
    };
  }, []);

  return null;
}
