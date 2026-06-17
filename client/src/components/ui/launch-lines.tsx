"use client"

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LaunchLinesProps {
  trigger: boolean;
  progress?: number;
  onComplete?: () => void;
  onStarReached?: () => void;
  primaryColor?: string;
  secondaryColor?: string;
}

const appleEasing: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

export function LaunchLines({ trigger, progress = 0, onComplete, onStarReached, primaryColor = 'rgba(59,130,246,1)', secondaryColor = 'rgba(255,255,255,1)' }: LaunchLinesProps) {
  const [showLines, setShowLines] = useState(false);

  useEffect(() => {
    if (!trigger) return;

    setShowLines(true);

    setTimeout(() => {
      console.log('Lines reached star - triggering glow');
      onStarReached?.();
    }, 1600);

    setTimeout(() => {
      setShowLines(false);
      onComplete?.();
    }, 2000);
  }, [trigger, onComplete, onStarReached]);

  const clampedProgress = Math.max(0, Math.min(100, progress));
  const stageBottom = Math.max(0, Math.min(1, clampedProgress / 33)); // 0-33
  const stageVertical = Math.max(0, Math.min(1, (clampedProgress - 34) / 33)); // 34-67
  const stageTop = Math.max(0, Math.min(1, (clampedProgress - 67) / 33)); // 67-100

  const primaryColorTransparent = primaryColor.replace('1)', '0)');
  const primaryGlow = `0 0 10px ${primaryColor.replace('1)', '0.6)')}`;

  return (
    <div className="fixed inset-0 pointer-events-none z-[10000]">
      <AnimatePresence>
        {showLines && (
          <>
            {/* LEFT SIDE */}
            <motion.div
              initial={{ bottom: 0, right: '50%', width: 0, height: '3px' }}
              animate={{ width: 'calc(50% - 18px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: appleEasing }}
              className="absolute"
              style={{
                background: `linear-gradient(to left, ${primaryColorTransparent} 0%, ${primaryColor} 20%, ${secondaryColor} 50%, ${primaryColor} 80%, ${primaryColor} 100%)`,
                boxShadow: primaryGlow,
                willChange: 'width'
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.55, duration: 0.1 }}
              className="absolute"
              style={{
                bottom: 0, left: 0, width: '18px', height: '18px',
                borderBottom: `3px solid ${primaryColor}`,
                borderLeft: `3px solid ${primaryColor}`,
                borderBottomLeftRadius: '18px',
                filter: `drop-shadow(0 0 10px ${primaryColor.replace('1)', '0.6)')})`
              }}
            />
            <motion.div
              initial={{ bottom: '18px', left: 0, height: 0 }}
              animate={{ height: 'calc(100% - 36px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: appleEasing }}
              className="absolute"
              style={{
                width: '3px',
                background: `linear-gradient(to top, ${primaryColor} 0%, ${secondaryColor} 50%, ${primaryColor} 90%, ${primaryColor} 100%)`,
                boxShadow: primaryGlow,
                willChange: 'height'
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 1.25, duration: 0.1 }}
              className="absolute"
              style={{
                top: 0, left: 0, width: '18px', height: '18px',
                borderTop: `3px solid ${primaryColor}`,
                borderLeft: `3px solid ${primaryColor}`,
                borderTopLeftRadius: '18px',
                filter: `drop-shadow(0 0 10px ${primaryColor.replace('1)', '0.6)')})`
              }}
            />
            <motion.div
              initial={{ top: 0, left: '18px', width: 0 }}
              animate={{ width: 'calc(50% - 18px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 1.3, ease: appleEasing }}
              className="absolute"
              style={{
                height: '3px',
                background: `linear-gradient(to right, ${primaryColor} 0%, ${secondaryColor} 50%, ${primaryColor} 100%)`,
                boxShadow: primaryGlow,
                willChange: 'width'
              }}
            />

            {/* RIGHT SIDE */}
            <motion.div
              initial={{ bottom: 0, left: '50%', width: 0, height: '3px' }}
              animate={{ width: 'calc(50% - 18px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: appleEasing }}
              className="absolute"
              style={{
                background: `linear-gradient(to right, ${primaryColorTransparent} 0%, ${primaryColor} 20%, ${secondaryColor} 50%, ${primaryColor} 80%, ${primaryColor} 100%)`,
                boxShadow: primaryGlow,
                willChange: 'width'
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.55, duration: 0.1 }}
              className="absolute"
              style={{
                bottom: 0, right: 0, width: '18px', height: '18px',
                borderBottom: `3px solid ${primaryColor}`,
                borderRight: `3px solid ${primaryColor}`,
                borderBottomRightRadius: '18px',
                filter: `drop-shadow(0 0 10px ${primaryColor.replace('1)', '0.6)')})`
              }}
            />
            <motion.div
              initial={{ bottom: '18px', right: 0, height: 0 }}
              animate={{ height: 'calc(100% - 36px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: appleEasing }}
              className="absolute"
              style={{
                width: '3px',
                background: `linear-gradient(to top, ${primaryColor} 0%, ${secondaryColor} 50%, ${primaryColor} 90%, ${primaryColor} 100%)`,
                boxShadow: primaryGlow,
                willChange: 'height'
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 1.25, duration: 0.1 }}
              className="absolute"
              style={{
                top: 0, right: 0, width: '18px', height: '18px',
                borderTop: `3px solid ${primaryColor}`,
                borderRight: `3px solid ${primaryColor}`,
                borderTopRightRadius: '18px',
                filter: `drop-shadow(0 0 10px ${primaryColor.replace('1)', '0.6)')})`
              }}
            />
            <motion.div
              initial={{ top: 0, right: '18px', width: 0 }}
              animate={{ width: 'calc(50% - 18px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 1.3, ease: appleEasing }}
              className="absolute"
              style={{
                height: '3px',
                background: `linear-gradient(to left, ${primaryColor} 0%, ${secondaryColor} 50%, ${primaryColor} 100%)`,
                boxShadow: primaryGlow,
                willChange: 'width'
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Progress Mode Lines */}
      {clampedProgress > 0 && (
        <>
          <motion.div className="absolute bottom-0 right-[50%]" style={{ width: `max(0px, calc(${stageBottom * 50}% - 18px))`, height: '3px', background: `linear-gradient(to left, ${primaryColor} 0%, ${primaryColorTransparent} 100%)`, boxShadow: primaryGlow }} />
          <motion.div className="absolute bottom-0 left-[50%]" style={{ width: `max(0px, calc(${stageBottom * 50}% - 18px))`, height: '3px', background: `linear-gradient(to right, ${primaryColor} 0%, ${primaryColorTransparent} 100%)`, boxShadow: primaryGlow }} />
          
          {stageBottom === 1 && (
            <>
              <div className="absolute" style={{ bottom: 0, left: 0, width: '18px', height: '18px', borderBottom: `3px solid ${primaryColor}`, borderLeft: `3px solid ${primaryColor}`, borderBottomLeftRadius: '18px', filter: `drop-shadow(0 0 10px ${primaryColor.replace('1)', '0.6)')})` }} />
              <div className="absolute" style={{ bottom: 0, right: 0, width: '18px', height: '18px', borderBottom: `3px solid ${primaryColor}`, borderRight: `3px solid ${primaryColor}`, borderBottomRightRadius: '18px', filter: `drop-shadow(0 0 10px ${primaryColor.replace('1)', '0.6)')})` }} />
            </>
          )}

          <motion.div className="absolute left-0" style={{ bottom: '18px', width: '3px', height: `max(0px, calc(${stageVertical * 100}% - 36px))`, background: `linear-gradient(to top, ${primaryColor} 0%, ${primaryColorTransparent} 100%)`, boxShadow: primaryGlow }} />
          <motion.div className="absolute right-0" style={{ bottom: '18px', width: '3px', height: `max(0px, calc(${stageVertical * 100}% - 36px))`, background: `linear-gradient(to top, ${primaryColor} 0%, ${primaryColorTransparent} 100%)`, boxShadow: primaryGlow }} />

          {stageVertical === 1 && (
            <>
              <div className="absolute" style={{ top: 0, left: 0, width: '18px', height: '18px', borderTop: `3px solid ${primaryColor}`, borderLeft: `3px solid ${primaryColor}`, borderTopLeftRadius: '18px', filter: `drop-shadow(0 0 10px ${primaryColor.replace('1)', '0.6)')})` }} />
              <div className="absolute" style={{ top: 0, right: 0, width: '18px', height: '18px', borderTop: `3px solid ${primaryColor}`, borderRight: `3px solid ${primaryColor}`, borderTopRightRadius: '18px', filter: `drop-shadow(0 0 10px ${primaryColor.replace('1)', '0.6)')})` }} />
            </>
          )}

          <motion.div className="absolute top-0" style={{ left: '18px', height: '3px', width: `max(0px, calc(${stageTop * 50}% - 18px))`, background: `linear-gradient(to right, ${primaryColor} 0%, ${primaryColorTransparent} 100%)`, boxShadow: primaryGlow }} />
          <motion.div className="absolute top-0" style={{ right: '18px', height: '3px', width: `max(0px, calc(${stageTop * 50}% - 18px))`, background: `linear-gradient(to left, ${primaryColor} 0%, ${primaryColorTransparent} 100%)`, boxShadow: primaryGlow }} />
        </>
      )}
    </div>
  );
}
