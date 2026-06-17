"use client"

import * as React from "react"
import { motion } from "motion/react";

interface ShiningTextProps {
  text: string;
  className?: string;
  duration?: number;
  baseColor?: string;
  highlightColor?: string;
}

export function ShiningText({
  text,
  className,
  duration = 2,
  baseColor = "#404040",
  highlightColor = "#ffffff",
}: ShiningTextProps) {
  return (
    <motion.span
      className={`bg-clip-text font-regular text-transparent bg-[length:200%_100%] ${className ?? ""}`}
      style={{
        fontFamily: "inherit",
        fontSize: "inherit",
        letterSpacing: "inherit",
        backgroundImage: `linear-gradient(110deg, ${baseColor} 35%, ${highlightColor} 50%, ${baseColor} 75%)`,
      }}
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{
        repeat: Infinity,
        duration,
        ease: "linear",
      }}
    >
      {text}
    </motion.span>
  );
}
