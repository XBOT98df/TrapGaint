"use client"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface Card {
  id: number
  contentType: 1 | 2 | 3
}

interface CardDataType {
  title: string;
  description: string;
  image: string;
}

interface AnimatedCardStackProps {
  cardImages?: {
    1: string;
    2: string;
    3: string;
  };
}

const defaultCardData = {
  1: {
    title: "Minecraft 1.21.5 Available Now",
    description: "Minecraft 1.21.5 is already available! Download and play the latest version with new features and improvements.",
    image: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=800&q=80",
  },
  2: {
    title: "Resonance v2.0.46",
    description: "Performance improvements and bug fixes",
    image: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&q=80",
  },
  3: {
    title: "New Mod Spotlight",
    description: "Discover the best mods for your gameplay",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80",
  },
}

const initialCards: Card[] = [
  { id: 1, contentType: 1 },
  { id: 2, contentType: 2 },
  { id: 3, contentType: 3 },
]

const positionStyles = [
  { scale: 1, y: 12 },
  { scale: 0.95, y: -16 },
  { scale: 0.9, y: -44 },
]

const exitAnimation = {
  y: 340,
  scale: 1,
  zIndex: 10,
}

const enterAnimation = {
  y: -16,
  scale: 0.9,
}


function CardContent({ contentType, cardData }: { contentType: 1 | 2 | 3; cardData: typeof defaultCardData }) {
  const data = cardData[contentType]
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="-outline-offset-1 flex h-[200px] w-full items-center justify-center overflow-hidden rounded-xl outline outline-black/10 dark:outline-white/10">
        <img
          src={data.image || "/placeholder.svg"}
          alt={data.title}
          className="h-full w-full select-none object-cover"
        />
      </div>
      <div className="flex w-full items-center justify-between gap-2 px-3 pb-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-foreground">{data.title}</span>
          <span className="text-muted-foreground">{data.description}</span>
        </div>
      </div>
    </div>
  )
}

function AnimatedCard({
  card,
  index,
  isAnimating,
  cardData,
}: {
  card: Card
  index: number
  isAnimating: boolean
  cardData: typeof defaultCardData
}) {
  const { scale, y } = positionStyles[index] ?? positionStyles[2]
  const zIndex = index === 0 && isAnimating ? 10 : 3 - index
  const exitAnim = index === 0 ? exitAnimation : undefined
  const initialAnim = index === 2 ? enterAnimation : undefined

  return (
    <motion.div
      key={card.id}
      initial={initialAnim}
      animate={{ y, scale }}
      exit={exitAnim}
      transition={{
        type: "spring",
        duration: 1,
        bounce: 0,
      }}
      style={{
        zIndex,
        left: "50%",
        x: "-50%",
        bottom: 0,
      }}
      className="absolute flex h-[280px] w-[324px] items-center justify-center overflow-hidden rounded-t-xl border-x border-t border-border bg-card p-1 shadow-lg will-change-transform sm:w-[512px]"
    >
      <CardContent contentType={card.contentType} cardData={cardData} />
    </motion.div>
  )
}

export default function AnimatedCardStack({ cardImages }: AnimatedCardStackProps = {}) {
  const cardData = cardImages ? {
    1: { ...defaultCardData[1], image: cardImages[1] },
    2: { ...defaultCardData[2], image: cardImages[2] },
    3: { ...defaultCardData[3], image: cardImages[3] },
  } : defaultCardData;
  const [cards, setCards] = useState(initialCards)
  const [isAnimating, setIsAnimating] = useState(false)
  const [nextId, setNextId] = useState(4)

  const handleAnimate = () => {
    setIsAnimating(true)
    const nextContentType = ((cards[2].contentType % 3) + 1) as 1 | 2 | 3
    setCards([...cards.slice(1), { id: nextId, contentType: nextContentType }])
    setNextId((prev) => prev + 1)
    setIsAnimating(false)
  }

  return (
    <div className="flex w-full flex-col items-center justify-center pt-2">
      <div className="relative h-[380px] w-full overflow-hidden sm:w-[644px]">
        <AnimatePresence initial={false}>
          {cards.slice(0, 3).map((card, index) => (
            <AnimatedCard key={card.id} card={card} index={index} isAnimating={isAnimating} cardData={cardData} />
          ))}
        </AnimatePresence>
      </div>
      <div className="relative z-10 -mt-px flex w-full items-center justify-center border-t-2 border-border py-4 px-8">
        <button
          onClick={handleAnimate}
          className="flex h-9 cursor-pointer select-none items-center justify-center gap-1 overflow-hidden rounded-lg border border-border bg-background px-3 font-medium text-secondary-foreground transition-all hover:bg-secondary/80 active:scale-[0.98]"
        >
          Next
        </button>
      </div>
    </div>
  )
}
