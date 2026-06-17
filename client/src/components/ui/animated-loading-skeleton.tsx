import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Interface for grid configuration structure
interface GridConfig {
  numCards: number // Total number of cards to display
  cols: number // Number of columns in the grid
}

const AnimatedLoadingSkeleton = () => {
  const [windowWidth, setWindowWidth] = useState(0) // State to store window width for responsiveness

  // Dynamically calculates grid configuration based on window width
  const getGridConfig = (width: number): GridConfig => {
    const numCards = 12 // Increased number of cards for full screen
    const cols = width >= 1280 ? 4 : width >= 1024 ? 3 : 2 // Set columns based on screen width
    return {
      numCards,
      cols
    }
  }

  // Handles window resize events and updates the window width
  useEffect(() => {
    setWindowWidth(window.innerWidth)
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Variants for frame animations
  const frameVariants = {
    hidden: { opacity: 0, scale: 0.95 }, // Initial state (hidden)
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } } // Transition to visible state
  }

  // Variants for individual card animations
  const cardVariants = {
    hidden: { y: 20, opacity: 0 }, // Initial state (off-screen)
    visible: (i: number) => ({ // Animate based on card index
      y: 0,
      opacity: 1,
      transition: { delay: i * 0.1, duration: 0.4 } // Staggered animation
    })
  }

  const config = getGridConfig(windowWidth) // Get current grid configuration

  return (
    <motion.div
      className="w-full h-full"
      variants={frameVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="relative overflow-hidden rounded-lg bg-transparent h-full p-8">
        {/* Grid of animated cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(config.numCards)].map((_, i) => (
            <motion.div
              key={i}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              custom={i}
              whileHover={{ scale: 1.02 }}
              className="bg-zinc-800/40 rounded-lg shadow-sm p-4 border border-white/5"
            >
              {/* Card placeholders */}
              <motion.div
                className="h-32 bg-zinc-700/50 rounded-md mb-3"
                animate={{
                  background: [
                    "rgba(63, 63, 70, 0.5)",
                    "rgba(82, 82, 91, 0.5)",
                    "rgba(63, 63, 70, 0.5)"
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="h-3 w-3/4 bg-zinc-700/50 rounded mb-2"
                animate={{
                  background: [
                    "rgba(63, 63, 70, 0.5)",
                    "rgba(82, 82, 91, 0.5)",
                    "rgba(63, 63, 70, 0.5)"
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="h-3 w-1/2 bg-zinc-700/50 rounded"
                animate={{
                  background: [
                    "rgba(63, 63, 70, 0.5)",
                    "rgba(82, 82, 91, 0.5)",
                    "rgba(63, 63, 70, 0.5)"
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

export default AnimatedLoadingSkeleton
