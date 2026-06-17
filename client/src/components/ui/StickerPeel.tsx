import { useRef, useEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import './StickerPeel.css';

interface StickerPeelProps {
  imageSrc: string;
  rotate?: number;
  peelBackHoverPct?: number;
  peelBackActivePct?: number;
  peelEasing?: string;
  peelHoverEasing?: string;
  width?: number;
  shadowIntensity?: number;
  lightingIntensity?: number;
  initialPosition?: 'center' | { x: number; y: number };
  peelDirection?: number;
  className?: string;
  isPeeling?: boolean;
}

const StickerPeel = ({
  imageSrc,
  rotate = 30,
  peelBackHoverPct = 0,
  peelBackActivePct = 100,
  peelEasing = 'cubic-bezier(0.4, 0, 0.2, 1)',
  peelHoverEasing = 'cubic-bezier(0.4, 0, 0.2, 1)',
  width = 200,
  shadowIntensity = 0.3,
  lightingIntensity = 0.05,
  initialPosition = 'center',
  peelDirection = 45,
  className = '',
  isPeeling = false
}: StickerPeelProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointLightRef = useRef<SVGFEPointLightElement>(null);
  const pointLightFlippedRef = useRef<SVGFEPointLightElement>(null);
  const defaultPadding = 10;

  // Simplified lighting for better performance
  useEffect(() => {
    const updateLight = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Use requestAnimationFrame for smoother updates
      requestAnimationFrame(() => {
        if (pointLightRef.current) {
          gsap.set(pointLightRef.current, { attr: { x, y } });
        }
        const normalizedAngle = Math.abs(peelDirection % 360);
        if (normalizedAngle !== 180 && pointLightFlippedRef.current) {
          gsap.set(pointLightFlippedRef.current, { attr: { x, y: rect.height - y } });
        } else if (pointLightFlippedRef.current) {
          gsap.set(pointLightFlippedRef.current, { attr: { x: -1000, y: -1000 } });
        }
      });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', updateLight);
      return () => container.removeEventListener('mousemove', updateLight);
    }
  }, [peelDirection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = () => {
      container.classList.add('touch-active');
    };
    const handleTouchEnd = () => {
      container.classList.remove('touch-active');
    };

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  const cssVars = useMemo(
    () => ({
      '--sticker-rotate': `${rotate}deg`,
      '--sticker-p': `${defaultPadding}px`,
      '--sticker-peelback-hover': `${peelBackHoverPct}%`,
      '--sticker-peelback-active': `${peelBackActivePct}%`,
      '--sticker-peel-easing': peelEasing,
      '--sticker-peel-hover-easing': peelHoverEasing,
      '--sticker-width': `${width}px`,
      '--sticker-shadow-opacity': shadowIntensity,
      '--sticker-lighting-constant': lightingIntensity,
      '--peel-direction': `${peelDirection}deg`
    } as React.CSSProperties),
    [rotate, peelBackHoverPct, peelBackActivePct, peelEasing, peelHoverEasing, width, shadowIntensity, lightingIntensity, peelDirection]
  );

  return (
    <div className={`sticker-overlay ${className}`} style={cssVars}>
      <svg width="0" height="0">
        <defs>
          <filter id="pointLight">
            <feGaussianBlur stdDeviation="0.5" result="blur" />
            <feSpecularLighting
              result="spec"
              in="blur"
              specularExponent="80"
              specularConstant={lightingIntensity}
              lightingColor="white"
            >
              <fePointLight ref={pointLightRef} x="100" y="100" z="200" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceGraphic" result="lit" />
            <feComposite in="lit" in2="SourceAlpha" operator="in" />
          </filter>
          <filter id="pointLightFlipped">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feSpecularLighting
              result="spec"
              in="blur"
              specularExponent="80"
              specularConstant={lightingIntensity * 5}
              lightingColor="white"
            >
              <fePointLight ref={pointLightFlippedRef} x="100" y="100" z="200" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceGraphic" result="lit" />
            <feComposite in="lit" in2="SourceAlpha" operator="in" />
          </filter>
          <filter id="dropShadow">
            <feDropShadow
              dx="1"
              dy="2"
              stdDeviation={2 * shadowIntensity}
              floodColor="black"
              floodOpacity={shadowIntensity}
            />
          </filter>
          <filter id="expandAndFill">
            <feOffset dx="0" dy="0" in="SourceAlpha" result="shape" />
            <feFlood floodColor="rgb(179,179,179)" result="flood" />
            <feComposite operator="in" in="flood" in2="shape" />
          </filter>
        </defs>
      </svg>
      <div className={`sticker-container ${isPeeling ? 'peeling' : ''}`} ref={containerRef}>
        <div className="sticker-main">
          <div className="sticker-lighting">
            <img
              src={imageSrc}
              alt=""
              className="sticker-image"
              draggable="false"
              onContextMenu={e => e.preventDefault()}
            />
          </div>
        </div>
        <div className="flap">
          <div className="flap-lighting">
            <img
              src={imageSrc}
              alt=""
              className="flap-image"
              draggable="false"
              onContextMenu={e => e.preventDefault()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default StickerPeel;
