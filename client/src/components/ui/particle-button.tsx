"use client"

import * as React from "react"
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ButtonProps } from "@/components/ui/button";

interface ParticleButtonProps extends ButtonProps {
  onSuccess?: () => void;
  successDuration?: number;
}

function SuccessParticles({
  buttonRef,
}: {
  buttonRef: React.RefObject<HTMLButtonElement>;
}) {
  const rect = buttonRef.current?.getBoundingClientRect();
  if (!rect) return null;

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      <AnimatePresence>
        {[...Array(12)].map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const distance = 60 + Math.random() * 40;
          return (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-white rounded-full shadow-lg"
              style={{ 
                left: centerX - 4, 
                top: centerY - 4,
              }}
              initial={{
                scale: 0,
                opacity: 1,
              }}
              animate={{
                scale: [0, 1.5, 0],
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 0.8,
                delay: i * 0.05,
                ease: "easeOut",
              }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ParticleButton({
  children,
  onClick,
  onSuccess,
  successDuration = 1000,
  className,
  ...props
}: ParticleButtonProps) {
  const [showParticles, setShowParticles] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    setShowParticles(true);
    
    if (onClick) {
      onClick(e);
    }
    
    setTimeout(() => {
      setShowParticles(false);
      if (onSuccess) {
        onSuccess();
      }
    }, successDuration);
  };

  return (
    <>
      {showParticles && <SuccessParticles buttonRef={buttonRef} />}
      <Button
        ref={buttonRef}
        onClick={handleClick}
        className={cn(
          "relative overflow-visible",
          showParticles && "scale-95",
          "transition-transform duration-100",
          className
        )}
        {...props}
      >
        {children}
      </Button>
    </>
  );
}

export { ParticleButton }
