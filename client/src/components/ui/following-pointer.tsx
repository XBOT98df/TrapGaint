import React, { useEffect, useState } from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

export const FollowerPointerCard = ({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string | React.ReactNode;
}) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const ref = React.useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isInside, setIsInside] = useState<boolean>(false);

  useEffect(() => {
    if (ref.current) {
      setRect(ref.current.getBoundingClientRect());
    }
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (rect) {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      x.set(e.clientX - rect.left + scrollX);
      y.set(e.clientY - rect.top + scrollY);
    }
  };

  const handleMouseLeave = () => {
    setIsInside(false);
  };

  const handleMouseEnter = () => {
    setIsInside(true);
  };

  return (
    <div
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      style={{
        cursor: "none",
      }}
      ref={ref}
      className={cn("relative", className)}
    >
      <AnimatePresence>
        {isInside && <FollowPointer x={x} y={y} title={title} />}
      </AnimatePresence>
      {children}
    </div>
  );
};

export const FollowPointer = ({
  x,
  y,
  title,
}: {
  x: any;
  y: any;
  title?: string | React.ReactNode;
}) => {
  const colors = [
    // Reds & Pinks
    "rgb(239 68 68)", "rgb(220 38 38)", "rgb(185 28 28)", "rgb(153 27 27)",
    "rgb(244 63 94)", "rgb(225 29 72)", "rgb(190 18 60)", "rgb(159 18 57)",
    "rgb(236 72 153)", "rgb(219 39 119)", "rgb(190 24 93)", "rgb(157 23 77)",
    "rgb(251 113 133)", "rgb(252 165 165)", "rgb(254 205 211)", "rgb(255 228 230)",
    
    // Oranges
    "rgb(249 115 22)", "rgb(234 88 12)", "rgb(194 65 12)", "rgb(154 52 18)",
    "rgb(251 146 60)", "rgb(253 186 116)", "rgb(254 215 170)", "rgb(255 237 213)",
    "rgb(255 127 80)", "rgb(255 99 71)", "rgb(255 140 0)", "rgb(255 165 0)",
    
    // Yellows & Golds
    "rgb(234 179 8)", "rgb(202 138 4)", "rgb(161 98 7)", "rgb(133 77 14)",
    "rgb(250 204 21)", "rgb(253 224 71)", "rgb(254 240 138)", "rgb(254 249 195)",
    "rgb(255 215 0)", "rgb(255 223 0)", "rgb(255 255 0)", "rgb(240 230 140)",
    
    // Greens
    "rgb(34 197 94)", "rgb(22 163 74)", "rgb(21 128 61)", "rgb(20 83 45)",
    "rgb(74 222 128)", "rgb(134 239 172)", "rgb(187 247 208)", "rgb(220 252 231)",
    "rgb(16 185 129)", "rgb(5 150 105)", "rgb(4 120 87)", "rgb(6 95 70)",
    "rgb(52 211 153)", "rgb(110 231 183)", "rgb(167 243 208)", "rgb(204 251 241)",
    "rgb(0 255 127)", "rgb(0 250 154)", "rgb(144 238 144)", "rgb(152 251 152)",
    
    // Cyans & Teals
    "rgb(20 184 166)", "rgb(17 94 89)", "rgb(19 78 74)", "rgb(17 94 89)",
    "rgb(45 212 191)", "rgb(94 234 212)", "rgb(153 246 228)", "rgb(204 251 241)",
    "rgb(6 182 212)", "rgb(8 145 178)", "rgb(14 116 144)", "rgb(21 94 117)",
    "rgb(34 211 238)", "rgb(103 232 249)", "rgb(165 243 252)", "rgb(207 250 254)",
    
    // Blues
    "rgb(59 130 246)", "rgb(37 99 235)", "rgb(29 78 216)", "rgb(30 64 175)",
    "rgb(96 165 250)", "rgb(147 197 253)", "rgb(191 219 254)", "rgb(219 234 254)",
    "rgb(14 165 233)", "rgb(2 132 199)", "rgb(3 105 161)", "rgb(7 89 133)",
    "rgb(56 189 248)", "rgb(125 211 252)", "rgb(186 230 253)", "rgb(224 242 254)",
    "rgb(0 191 255)", "rgb(30 144 255)", "rgb(65 105 225)", "rgb(100 149 237)",
    
    // Purples & Violets
    "rgb(168 85 247)", "rgb(147 51 234)", "rgb(126 34 206)", "rgb(107 33 168)",
    "rgb(192 132 252)", "rgb(216 180 254)", "rgb(233 213 255)", "rgb(243 232 255)",
    "rgb(139 92 246)", "rgb(124 58 237)", "rgb(109 40 217)", "rgb(91 33 182)",
    "rgb(167 139 250)", "rgb(196 181 253)", "rgb(221 214 254)", "rgb(237 233 254)",
    "rgb(138 43 226)", "rgb(148 0 211)", "rgb(153 50 204)", "rgb(186 85 211)",
    
    // Magentas
    "rgb(217 70 239)", "rgb(192 38 211)", "rgb(162 28 175)", "rgb(134 25 143)",
    "rgb(232 121 249)", "rgb(240 171 252)", "rgb(245 208 254)", "rgb(250 232 255)",
    "rgb(255 0 255)", "rgb(218 112 214)", "rgb(221 160 221)", "rgb(238 130 238)",
    
    // Special & Neon Colors
    "rgb(255 20 147)", "rgb(255 105 180)", "rgb(255 182 193)", "rgb(255 192 203)",
    "rgb(0 255 255)", "rgb(127 255 212)", "rgb(64 224 208)", "rgb(72 209 204)",
    "rgb(173 216 230)", "rgb(135 206 250)", "rgb(176 224 230)", "rgb(175 238 238)",
    "rgb(255 250 205)", "rgb(255 239 213)", "rgb(255 228 181)", "rgb(255 218 185)",
    
    // Vibrant Mixed
    "rgb(255 69 0)", "rgb(255 99 71)", "rgb(255 127 80)", "rgb(255 160 122)",
    "rgb(50 205 50)", "rgb(124 252 0)", "rgb(127 255 0)", "rgb(173 255 47)",
    "rgb(0 206 209)", "rgb(64 224 208)", "rgb(72 209 204)", "rgb(175 238 238)",
    "rgb(123 104 238)", "rgb(106 90 205)", "rgb(72 61 139)", "rgb(147 112 219)"
  ];

  return (
    <motion.div
      className="h-4 w-4 rounded-full absolute z-50"
      style={{
        top: y,
        left: x,
        pointerEvents: "none",
      }}
      initial={{
        scale: 1,
        opacity: 1,
      }}
      animate={{
        scale: 1,
        opacity: 1,
      }}
      exit={{
        scale: 0,
        opacity: 0,
      }}
    >
      <svg
        stroke="currentColor"
        fill="currentColor"
        strokeWidth="1"
        viewBox="0 0 16 16"
        className="h-6 w-6 text-pink-500 transform -rotate-[70deg] -translate-x-[12px] -translate-y-[10px] stroke-pink-600"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z"></path>
      </svg>
      <motion.div
        style={{
          backgroundColor: colors[Math.floor(Math.random() * colors.length)],
        }}
        initial={{
          scale: 0.5,
          opacity: 0,
        }}
        animate={{
          scale: 1,
          opacity: 1,
        }}
        exit={{
          scale: 0.5,
          opacity: 0,
        }}
        className="px-2 py-2 text-white whitespace-nowrap min-w-max text-xs rounded-full"
      >
        {title || `Mod`}
      </motion.div>
    </motion.div>
  );
};
