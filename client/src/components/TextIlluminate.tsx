import { motion, useInView } from "framer-motion";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

const THEMES = {
  midnight: { textColor: "#E2E8F0", accentColor: "#A78BFA" },
  ember: { textColor: "#FDE68A", accentColor: "#FB923C" },
  ocean: { textColor: "#CFFAFE", accentColor: "#22D3EE" },
  aurora: { textColor: "#D1FAE5", accentColor: "#6EE7B7" },
  monochrome: { textColor: "#F5F5F5", accentColor: "#D4D4D4" }
};

// =============================================================================
// STAGGER UTILITIES
// =============================================================================
function shuffleIndices(length) {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function getCenterOutOrder(length) {
  const center = Math.floor(length / 2);
  const order = [];
  const visited = new Set();
  order.push(center);
  visited.add(center);
  let offset = 1;
  while (order.length < length) {
    const left = center - offset;
    const right = center + offset;
    if (left >= 0 && !visited.has(left)) {
      order.push(left);
      visited.add(left);
    }
    if (right < length && !visited.has(right)) {
      order.push(right);
      visited.add(right);
    }
    offset++;
  }
  return order;
}

function getStaggerOrder(length, direction) {
  switch (direction) {
    case "rtl":
      return Array.from({ length }, (_, i) => length - 1 - i);
    case "center":
      return getCenterOutOrder(length);
    case "random":
      return shuffleIndices(length);
    default:
      return Array.from({ length }, (_, i) => i);
  }
}

const IlluminateChar = React.memo(({ char, revealed, textColor, accentColor, glowEnabled, glowIntensity, duration, fontFamily, fontWeight, fontSize, isSpace }) => {
  const [glowPhase, setGlowPhase] = useState("none");
  const timerRefs = useRef([]);

  const clearTimers = useCallback(() => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
  }, []);

  useEffect(() => {
    if (isSpace) return;
    clearTimers();
    if (revealed && glowEnabled) {
      const flashTimer = setTimeout(() => setGlowPhase("flash"), duration * 450);
      const steadyTimer = setTimeout(() => setGlowPhase("steady"), duration * 1000 + 800);
      timerRefs.current.push(flashTimer, steadyTimer);
    } else {
      setGlowPhase("none");
    }
    return clearTimers;
  }, [revealed, isSpace, duration, glowEnabled, clearTimers]);

  if (isSpace) {
    return <span style={{ display: "inline-block", width: fontSize * 0.3 }}></span>;
  }

  const typoStyle = {
    fontFamily,
    fontWeight,
    fontSize,
    lineHeight: 1.2,
    letterSpacing: "0.02em",
    whiteSpace: "pre" as any
  };

  const gradient = `linear-gradient(
    180deg,
    ${textColor} 0%,
    ${textColor} 32%,
    ${accentColor} 50%,
    ${accentColor}90 58%,
    ${accentColor}20 66%,
    transparent 74%,
    transparent 100%
  )`;

  let glowShadow = "none";
  if (glowPhase === "flash") {
    const r = glowIntensity * 2.5;
    glowShadow = `0 0 ${r}px ${accentColor}, 0 0 ${r * 2}px ${accentColor}60, 0 0 ${r * 3}px ${accentColor}20`;
  } else if (glowPhase === "steady") {
    glowShadow = `0 0 ${glowIntensity}px ${accentColor}, 0 0 ${glowIntensity * 2}px ${accentColor}35`;
  }

  const settleDelay = duration * 0.55;

  return (
    <motion.span
      style={{ display: "inline-block", position: "relative", overflow: "visible" }}
      animate={revealed ? { y: [2.5, -1.2, 0.3, 0], scale: [1, 1.04, 0.995, 1] } : { y: 0, scale: 1 }}
      transition={revealed ? {
        y: { duration: 0.65, delay: settleDelay, ease: [0.22, 1, 0.36, 1] },
        scale: { duration: 0.7, delay: settleDelay, ease: [0.22, 1, 0.36, 1] }
      } : { duration: 0.35, ease: "easeInOut" }}
    >
      <span style={{ ...typoStyle, display: "inline-block", color: textColor, opacity: 0.1 }}>
        {char}
      </span>
      <span style={{
        ...typoStyle,
        display: "inline-block",
        position: "absolute",
        top: 0,
        left: 0,
        background: gradient,
        backgroundSize: "100% 300%",
        backgroundPosition: revealed ? "0% 0%" : "0% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        transition: `background-position ${duration}s cubic-bezier(0.22, 1, 0.36, 1)`,
        willChange: "background-position"
      }}>
        {char}
      </span>
      {glowEnabled && (
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: glowPhase === "flash" ? 0.6 : glowPhase === "steady" ? 0.2 : 0 }}
          transition={{ opacity: { duration: glowPhase === "flash" ? 0.25 : glowPhase === "steady" ? 1.8 : 1.4, ease: [0.4, 0, 0.2, 1] } }}
          style={{
            ...typoStyle,
            display: "inline-block",
            position: "absolute",
            top: 0,
            left: 0,
            color: accentColor,
            textShadow: glowShadow,
            pointerEvents: "none",
            zIndex: -1,
            willChange: "opacity"
          }}
        >
          {char}
        </motion.span>
      )}
    </motion.span>
  );
});

export default function TextIlluminate(props) {
  const {
    text = "Hello World",
    fontFamily: fontFamilyProp,
    fontSize = 64,
    textAlign = "center",
    theme = "custom",
    palette = {},
    reveal = {},
    glow = {},
    hoverLift = false,
    style
  } = props;

  const tv = theme !== "custom" ? THEMES[theme] : null;
  const textColor = tv?.textColor ?? palette.textColor ?? "#F5F5F5";
  const accentColor = tv?.accentColor ?? palette.accentColor ?? "#A78BFA";

  const trigger = reveal.trigger ?? "onView";
  const direction = reveal.direction ?? "ltr";
  const stagger = reveal.stagger ?? 0.05;
  const duration = reveal.duration ?? 0.8;
  const loopPause = reveal.loopPause ?? 2.5;

  const glowEnabled = glow.enabled ?? true;
  const glowIntensity = glow.intensity ?? 10;

  const fontFamily = fontFamilyProp?.fontFamily ? `${fontFamilyProp.fontFamily}, 'Inter', -apple-system, BlinkMacSystemFont, sans-serif` : "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif";
  const fontWeight = fontFamilyProp?.fontWeight || 600;

  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: false, amount: 0.3 });
  const [isHovered, setIsHovered] = useState(false);
  const [revealedSet, setRevealedSet] = useState(new Set());
  const [animationKey, setAnimationKey] = useState(0);
  const timerRefs = useRef([]);

  const characters = useMemo(() => text.split(""), [text]);
  const nonSpaceIndices = useMemo(() => characters.map((c, i) => c === " " ? -1 : i).filter(i => i !== -1), [characters]);

  const staggerOrder = useMemo(() => {
    const order = getStaggerOrder(nonSpaceIndices.length, direction);
    return order.map(oi => nonSpaceIndices[oi]);
  }, [nonSpaceIndices, direction, animationKey]);

  const clearTimers = useCallback(() => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
  }, []);

  const runRevealSequence = useCallback(() => {
    clearTimers();
    setRevealedSet(new Set());
    staggerOrder.forEach((charIndex, orderIndex) => {
      const delay = orderIndex * stagger * 1000;
      const timer = setTimeout(() => {
        setRevealedSet(prev => {
          const next = new Set(prev);
          next.add(charIndex);
          return next;
        });
      }, delay);
      timerRefs.current.push(timer);
    });
    return (staggerOrder.length * stagger * 1000) + (duration * 1000) + 400;
  }, [staggerOrder, stagger, duration, clearTimers]);

  const resetAnimation = useCallback(() => {
    clearTimers();
    setRevealedSet(new Set());
  }, [clearTimers]);

  useEffect(() => {
    if (trigger !== "onView") return;
    if (isInView) runRevealSequence();
    else resetAnimation();
    return clearTimers;
  }, [isInView, trigger, runRevealSequence, resetAnimation, clearTimers]);

  useEffect(() => {
    if (trigger !== "onHover") return;
    if (isHovered) runRevealSequence();
    else resetAnimation();
    return clearTimers;
  }, [isHovered, trigger, runRevealSequence, resetAnimation, clearTimers]);

  useEffect(() => {
    if (trigger !== "loop") return;
    let cancelled = false;
    const loopCycle = () => {
      if (cancelled) return;
      const totalDuration = runRevealSequence();
      const waitTimer = setTimeout(() => {
        if (cancelled) return;
        resetAnimation();
        const restartTimer = setTimeout(() => {
          if (cancelled) return;
          setAnimationKey(k => k + 1);
          loopCycle();
        }, duration * 600 + 300);
        timerRefs.current.push(restartTimer);
      }, totalDuration + (loopPause * 1000));
      timerRefs.current.push(waitTimer);
    };
    loopCycle();
    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [trigger, loopPause, duration, runRevealSequence, resetAnimation, clearTimers, animationKey]);

  const justifyContent = textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center";

  return (
    <motion.div
      ref={containerRef}
      onMouseEnter={() => { if (trigger === "onHover") setIsHovered(true); }}
      onMouseLeave={() => { if (trigger === "onHover") setIsHovered(false); }}
      whileHover={hoverLift ? { y: -4 } : undefined}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        ...style,
        display: "flex",
        flexWrap: "wrap",
        justifyContent,
        alignItems: "center",
        width: "100%",
        cursor: trigger === "onHover" || hoverLift ? "pointer" : "default",
        isolation: "isolate",
        position: "relative",
        overflow: "visible"
      }}
    >
      {characters.map((char, i) => {
        const isSpace = char === " ";
        return (
          <IlluminateChar
            key={`${animationKey}-${i}`}
            char={char}
            revealed={revealedSet.has(i)}
            textColor={textColor}
            accentColor={accentColor}
            glowEnabled={glowEnabled}
            glowIntensity={glowIntensity}
            duration={duration}
            fontFamily={fontFamily}
            fontWeight={fontWeight}
            fontSize={fontSize}
            isSpace={isSpace}
          />
        );
      })}
    </motion.div>
  );
}
