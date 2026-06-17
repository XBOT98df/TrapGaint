"use client";

import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DotLoader } from "@/components/ui/dot-loader";

export type DotFlowProps = {
  items: {
    title: string;
    frames: number[][];
    duration?: number;
    repeatCount?: number;
  }[];
};

export const DotFlow = ({ items }: DotFlowProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [textIndex, setTextIndex] = useState(0);

  const { contextSafe } = useGSAP();

  useEffect(() => {
    if (!containerRef.current || !textRef.current) return;

    const newWidth = textRef.current.offsetWidth + 1;
    gsap.to(containerRef.current, {
      width: newWidth,
      duration: 0.4,
      ease: "power3.out",
    });
  }, [textIndex]);

  // Add entrance animation on mount
  useEffect(() => {
    if (!wrapperRef.current) return;
    
    gsap.fromTo(
      wrapperRef.current,
      { 
        scale: 0.95, 
        opacity: 0
      },
      {
        scale: 1,
        opacity: 1,
        duration: 0.4,
        ease: "power2.out",
      }
    );
  }, []);

  const next = contextSafe(() => {
    const el = containerRef.current;
    if (!el) return;

    // Smooth slide and fade transition
    gsap.to(el, {
      x: -10,
      opacity: 0,
      duration: 0.25,
      ease: "power2.in",
      onComplete: () => {
        setTextIndex((prev) => (prev + 1) % items.length);
        gsap.fromTo(
          el,
          { 
            x: 10, 
            opacity: 0
          },
          {
            x: 0,
            opacity: 1,
            duration: 0.35,
            ease: "power2.out",
          }
        );
      },
    });

    setIndex((prev) => (prev + 1) % items.length);
  });

  return (
    <div 
      ref={wrapperRef}
      className="flex items-center gap-1.5 rounded bg-black px-2 py-1"
    >
      <DotLoader
        frames={items[index].frames}
        onComplete={next}
        className="gap-px"
        repeatCount={items[index].repeatCount ?? 1}
        duration={items[index].duration ?? 150}
        dotClassName="bg-zinc-800 [&.active]:bg-white size-0.5 transition-all duration-300 ease-in-out [&.active]:shadow-[0_0_4px_rgba(255,255,255,0.6)]"
      />
      <div ref={containerRef} className="relative overflow-hidden">
        <div
          ref={textRef}
          className="inline-block text-base font-bold whitespace-nowrap text-white tracking-wider uppercase"
          style={{ fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif", letterSpacing: '0.1em' }}
        >
          {items[textIndex].title}
        </div>
      </div>
    </div>
  );
};
