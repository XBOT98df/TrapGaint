import { motion } from "framer-motion";

interface ModpackSkeletonProps {
  count?: number;
}

export function ModpackSkeleton({ count = 9 }: ModpackSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <motion.div
          key={`skeleton-${index}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
          className="relative h-48 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800"
        >
          {/* Animated shimmer overlay */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-800/30 to-transparent"
            animate={{
              x: ["-100%", "100%"],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "linear",
              delay: index * 0.1,
            }}
          />
          
          {/* Topography pattern background */}
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'url(/topography-white.svg)',
              backgroundRepeat: 'repeat',
              backgroundSize: '400px 400px'
            }}
          />
          
          {/* Content skeleton */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-6 text-center space-y-3">
            {/* Title skeleton */}
            <motion.div 
              className="h-8 w-3/4 bg-zinc-800 rounded"
              animate={{
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            
            {/* Description skeleton lines */}
            <motion.div 
              className="h-3 w-full bg-zinc-800 rounded"
              animate={{
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.1,
              }}
            />
            <motion.div 
              className="h-3 w-2/3 bg-zinc-800 rounded"
              animate={{
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.2,
              }}
            />
            
            {/* Meta info skeleton */}
            <div className="flex gap-2 mt-2">
              <motion.div 
                className="h-3 w-20 bg-zinc-800 rounded"
                animate={{
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.3,
                }}
              />
              <motion.div 
                className="h-3 w-16 bg-zinc-800 rounded"
                animate={{
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.4,
                }}
              />
            </div>
          </div>
        </motion.div>
      ))}
    </>
  );
}
