import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Asterisk, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

export interface SpiralGalleryProps {
  images: string[];
}

const cardsContent = [
  {
    title: "Premium Partnership\nwith Pro+",
    description: "Unlock the full potential of your business. Personalize your experience with advanced features, dedicated support, and priority interactions.",
    image: "/pro.png"
  },
  {
    title: "Basic Partnership\nwith Go",
    description: "Start your journey seamlessly. Get essential tools and standard integrations to effectively represent your business and interact with customers.",
    image: "/go.png"
  },
  {
    title: "Premium Partnership\nwith Pro+",
    description: "Unlock the full potential of your business. Personalize your experience with advanced features, dedicated support, and priority interactions.",
    image: "/pro.png"
  },
  {
    title: "Basic Partnership\nwith Go",
    description: "Start your journey seamlessly. Get essential tools and standard integrations to effectively represent your business and interact with customers.",
    image: "/go.png"
  },
  {
    title: "Premium Partnership\nwith Pro+",
    description: "Unlock the full potential of your business. Personalize your experience with advanced features, dedicated support, and priority interactions.",
    image: "/pro.png"
  },
  {
    title: "Basic Partnership\nwith Go",
    description: "Start your journey seamlessly. Get essential tools and standard integrations to effectively represent your business and interact with customers.",
    image: "/go.png"
  },
  {
    title: "Premium Partnership\nwith Pro+",
    description: "Unlock the full potential of your business. Personalize your experience with advanced features, dedicated support, and priority interactions.",
    image: "/pro.png"
  },
  {
    title: "Edge Editz X\nTrapGaint",
    description: "A Professional After Effects Editor\n\nmake movies and series edits within my maximum potential and try to provide y'all my creativity and my skills through my edits.",
    images: ["/edz.png", "/new-dragon.png"],
    youtubeLink: "https://www.youtube.com/@edgeeditzae"
  }
];

export const SpiralGallery: React.FC<SpiralGalleryProps> = () => {
  // Start at a high multiple of total to allow infinite backward scrolling without negative indices
  const [activeIndex, setActiveIndex] = useState(10000);
  const total = cardsContent.length;

  const handleNext = () => {
    setActiveIndex((prev) => prev + 1);
  };

  const handlePrev = () => {
    setActiveIndex((prev) => prev - 1);
  };

  // Auto-rotate with dynamic duration based on partnership tier
  useEffect(() => {
    const contentIndex = ((activeIndex % total) + total) % total;
    const currentCard = cardsContent[contentIndex];
    
    // Edge Editz gets 4 seconds, Go gets 2 seconds
    const isPro = currentCard.title.includes("Edge");
    const delay = isPro ? 4000 : 2000;

    const timer = setTimeout(() => {
      handleNext();
    }, delay);
    
    return () => clearTimeout(timer);
  }, [activeIndex]); // Reset timer whenever the card changes

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end overflow-hidden z-10 bg-black pointer-events-none">
      {/* Background gradient */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none" 
        style={{
          backgroundImage: 'url(/blue-black-gradient.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }} 
      />


      {/* The Dome Cards Layout */}
      <div className="absolute bottom-[20%] w-full flex justify-center items-end z-10 pointer-events-none">
        <AnimatePresence>
            {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((offset) => {
              // The absolute index in our infinite timeline
              const absoluteIndex = activeIndex + offset;
              // The actual content index (safely wrapped to 0-4)
              const contentIndex = ((absoluteIndex % total) + total) % total;
              const content = cardsContent[contentIndex];
              
              // Helper to calculate exact geometric position for any offset on the dome
              const getTransform = (off: number) => {
                const angleStepDeg = 12; // 12 degrees per card
                const xStep = 240; // 240px horizontal spacing
                const angleStepRad = angleStepDeg * (Math.PI / 180);
                const k = angleStepRad / xStep;
                
                let angleDeg = off * angleStepDeg; 
                const angleRad = angleDeg * (Math.PI / 180);
                
                const xOff = off * xStep; 
                
                // The ultimate geometric truth: Integrating tan(angle) ensures the card's tilt
                // perfectly matches the tangent slope of the arch. This guarantees the bottom 
                // edges sit 100% flush against the curve without any jagged intersections.
                // Formula: y = -ln(cos(k * x)) / k
                let yOff = 0;
                if (Math.abs(angleRad) < Math.PI / 2) {
                  yOff = -Math.log(Math.cos(angleRad)) / k;
                }
                
                // Restore the subtle "book-end" flare to the outermost cards
                if (Math.abs(off) >= 3) {
                  angleDeg = angleDeg - (5 * Math.sign(off)); 
                }
                
                // Keep cards beyond offset 3 fully invisible
                const isHidden = Math.abs(off) > 3;

                return {
                  x: xOff,
                  y: yOff,
                  rotate: angleDeg,
                  scale: off === 0 ? 1.15 : 1, // Make center card prominently larger
                  opacity: isHidden ? 0 : 1
                };
              };

              const current = getTransform(offset);
              const outer = getTransform(offset > 0 ? offset + 1 : offset - 1);
              
              const zIndex = 20 - Math.abs(offset);

              return (
                <motion.div
                  key={absoluteIndex} // Unique key ensures Framer Motion treats each as a distinct card
                  className="absolute w-[340px] h-[480px] rounded-[32px] overflow-hidden flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                  style={{
                    left: '50%',
                    marginLeft: '-170px',
                    bottom: '15%',
                    transformOrigin: 'bottom center', // Bottom pivoting guarantees the bottom curve is 100% mathematically flawless
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.02) 100%)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    borderTop: '1px solid rgba(255,255,255,0.3)',
                    borderLeft: '1px solid rgba(255,255,255,0.2)',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                  initial={{ 
                    opacity: 0, 
                    x: outer.x,
                    y: outer.y,
                    rotate: outer.rotate,
                    scale: outer.scale,
                    zIndex: zIndex - 1 // Start underneath
                  }}
                  animate={{ 
                    opacity: current.opacity, 
                    x: current.x,
                    y: current.y,
                    rotate: current.rotate,
                    scale: current.scale,
                    zIndex: zIndex
                  }}
                  exit={{ 
                    opacity: 0, 
                    x: outer.x,
                    y: outer.y,
                    rotate: outer.rotate,
                    scale: outer.scale,
                    zIndex: zIndex - 1
                  }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 140, // Ultra-smooth majestic sweep, not bouncy
                    damping: 24, 
                    mass: 1,
                    // Delay z-index swap so cards cross over flawlessly mid-air instead of instantly popping on top
                    zIndex: { delay: 0.15 } 
                  }}
                >
              <div className="w-full h-full p-8 flex flex-col relative z-10">
                {(content as any).youtubeLink && (
                  <a 
                    href={(content as any).youtubeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-6 right-6 flex items-center justify-center gap-1.5 text-white/60 hover:text-white text-[9px] font-bold tracking-[0.2em] uppercase border border-white/10 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 transition-all w-max pointer-events-auto z-20 backdrop-blur-md"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.377.55 9.377.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <span>Subscribe</span>
                  </a>
                )}
                {/* Top Header - Title and Description */}
                <div className="text-left mt-6">
                  <h2 className="text-white text-[24px] font-medium leading-tight mb-4 whitespace-pre-line tracking-tight pr-24">
                    {content.title}
                  </h2>
                  <p className="text-white/60 text-[13px] leading-[1.6] tracking-wide pr-4">
                    {content.description}
                  </p>
                </div>

                {/* Main Content - Centered Icon */}
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="flex items-center justify-center gap-4">
                    {content.images ? (
                      content.images.map((img, idx) => (
                        <React.Fragment key={idx}>
                          <img 
                            src={img} 
                            alt={content.title} 
                            className={`w-[90px] drop-shadow-[0_20px_30px_rgba(0,0,0,0.4)] opacity-90 mix-blend-plus-lighter ${img.includes('edz.png') ? 'h-[90px] rounded-full object-cover' : 'h-auto object-contain'}`} 
                          />
                          {idx === 0 && <span className="text-white/40 text-2xl font-light">X</span>}
                        </React.Fragment>
                      ))
                    ) : (
                      <img 
                        src={content.image} 
                        alt={content.title} 
                        className="w-[180px] h-auto drop-shadow-[0_20px_30px_rgba(0,0,0,0.4)] opacity-90 object-contain mix-blend-plus-lighter" 
                      />
                    )}
                  </div>
                  {content.images && (
                    <img 
                      src="/pro.png" 
                      alt="Pro Plus" 
                      className="mt-6 w-[70px] h-auto drop-shadow-[0_15px_20px_rgba(0,0,0,0.5)] opacity-90 object-contain mix-blend-plus-lighter" 
                    />
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>
    </div>
  );
};
