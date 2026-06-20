import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { motion, useAnimation } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const StartupSplash = () => {
  const wipeControls = useAnimation();

  useEffect(() => {
    let isMounted = true;

    const sequence = async () => {
      // Preload the heavy 3MB image and the trapcode logo so they don't pop in mid-animation
      const preloadImage = (src: string) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve; // Prevents hanging if the image is missing
          img.src = src;
        });
      };

      await Promise.all([
        preloadImage("/generated_images/new-dragon.png"),
        preloadImage("/trapcode.png")
      ]);

      if (!isMounted) return;

      // Un-hide the window ONLY after the dark background is rendered and heavy images are fully loaded.
      // This completely guarantees absolutely ZERO white flashes at startup!
      try {
        await getCurrentWindow().show();
      } catch (error) {
        console.error("Failed to show window:", error);
      }

      // 1. Wipe animation (Faster and smoother cinematic ease)
      await wipeControls.start({
        width: "100%",
        transition: { duration: 1.8, ease: [0.76, 0, 0.24, 1] }
      });
      
      // 2. Tiny hold so the user registers the final Trapcode logo before the main window abruptly replaces it
      await new Promise(resolve => setTimeout(resolve, 200));

      // 3. Close the splash screen and reveal the main application window immediately!
      try {
        await invoke("finish_startup_splash");
      } catch (error) {
        console.error("Error closing splash screen:", error);
      }
    };
    
    sequence();

    return () => {
      isMounted = false;
    };
  }, [wipeControls]);

  const bgColor = "#05090A";
  const wipeColor = "#FFFFFF";

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: bgColor }}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Background Layer (Black, new-dragon.png) */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <img 
            src="/generated_images/new-dragon.png" 
            alt="Dragon Logo" 
            loading="eager"
            decoding="sync"
            style={{ width: "180px", height: "auto", objectFit: "contain", userSelect: "none" }} 
          />
        </div>

        {/* Foreground Layer (White Wipe, trapcode.png) */}
        <motion.div 
          initial={{ width: "0%" }}
          animate={wipeControls}
          style={{
            position: "absolute",
            top: 0, left: 0, bottom: 0,
            backgroundColor: wipeColor,
            overflow: "hidden",
            borderRight: "1px solid rgba(255,255,255,0.3)"
          }}
        >
          <div style={{
            position: "absolute",
            top: 0, left: 0, width: "100vw", height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <img 
              src="/trapcode.png" 
              alt="Trapcode Logo" 
              loading="eager"
              decoding="sync"
              style={{ width: "180px", height: "auto", objectFit: "contain", userSelect: "none" }} 
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<StartupSplash />);
}
