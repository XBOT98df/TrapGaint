import { Play, Plus, Clock, MoreHorizontal, Download } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LauncherLayout } from "@/components/layout/LauncherLayout";

// Import generated assets - using existing images
import heroImage from "@assets/generated_images/home.png";
import dungeonsImage from "@assets/generated_images/1.21.png";
import legendsImage from "@assets/generated_images/1.20.png";
import moddedImage from "@assets/generated_images/1.19.png";
import caveImage from "@assets/generated_images/1.18.jpg";

const GameCard = ({ 
  image, 
  title, 
  status, 
  update, 
  index 
}: { 
  image: string; 
  title: string; 
  status?: string; 
  update?: boolean; 
  index: number; 
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
      className="group relative aspect-[4/5] rounded-2xl overflow-hidden bg-card border border-white/5 cursor-pointer hover:ring-2 hover:ring-primary transition-all duration-300"
    >
      <img 
        src={image} 
        alt={title} 
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
      
      {update && (
        <div className="absolute top-4 right-4 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse">
            UPDATE
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <h3 className="text-lg font-bold text-white mb-1 group-hover:text-primary transition-colors">{title}</h3>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {status === "Playing" ? (
             <span className="flex items-center gap-1.5 text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Playing Now
             </span>
          ) : (
            <span className="flex items-center gap-1">
                {status === "Update" ? <Download size={12} /> : <Play size={12} />}
                {status || "Play"}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default function Home() {
  return (
    <LauncherLayout activeTab="home" onTabChange={() => {}}>
      {/* Hero texture overlay for entire page */}
      <div
        className="fixed inset-0 opacity-5 z-50 pointer-events-none"
        style={{
          backgroundImage: 'url("/hero-texture.png")',
          backgroundSize: "cover",
        }}
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative w-full aspect-[21/9] rounded-3xl overflow-hidden mb-10 group shadow-2xl shadow-black/50"
      >
        {/* Background - with pink hue */}
        <div className="absolute inset-0 w-full h-full z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-black via-black/0 to-black/0 z-10" />
          <img
            src="/hero-gradient.png"
            alt=""
            className="w-full h-full object-cover mix-blend-hard-light opacity-100 z-0"
          />
          {/* Strong pink overlay */}
          <div className="absolute inset-0 z-15" style={{ backgroundColor: 'rgba(255, 20, 147, 0.35)', mixBlendMode: 'color' }} />
          <div
            className="absolute inset-0 opacity-5 z-20"
            style={{
              backgroundImage: 'url("/hero-texture.png")',
              backgroundSize: "cover",
            }}
          />
        </div>
        
        {/* Content */}
        <div className="relative z-30 h-full flex flex-col">
          <div className="absolute inset-0 p-12 flex flex-col justify-end items-start max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Badge variant="secondary" className="mb-4 bg-primary/20 text-primary hover:bg-primary/30 border-primary/20 backdrop-blur-md">
                  AVAILABLE NOW
              </Badge>
              <h1 className="text-5xl font-extrabold text-white mb-4 leading-tight tracking-tight text-shadow">
                  Minecraft: Java & Bedrock Edition
              </h1>
              <p className="text-lg text-gray-300 mb-8 line-clamp-2 max-w-lg leading-relaxed">
                  Experience the world of endless possibilities. Build, explore, and survive in the original open-world sandbox game that started it all.
              </p>
              
              <div className="flex gap-4">
                  <Button size="lg" className="h-12 px-8 rounded-full text-base font-semibold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                      Play Now
                  </Button>
                  <Button size="lg" variant="secondary" className="h-12 px-8 rounded-full text-base bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-white hover:scale-105 transition-transform">
                      <Plus className="mr-2 h-4 w-4" />
                      Add to Favorites
                  </Button>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Progress dots */}
        <div className="absolute bottom-8 right-8 flex gap-2 z-40">
            <div className="w-8 h-1 bg-primary rounded-full" />
            <div className="w-2 h-1 bg-white/30 rounded-full" />
            <div className="w-2 h-1 bg-white/30 rounded-full" />
        </div>
      </motion.div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Continue Playing</h2>
            <button className="text-sm text-muted-foreground hover:text-white transition-colors flex items-center gap-1">
                View All <MoreHorizontal size={14} />
            </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <GameCard 
                image={dungeonsImage}
                title="Minecraft Dungeons"
                status="Play"
                index={0}
            />
            <GameCard 
                image={legendsImage}
                title="Minecraft Legends"
                status="Update"
                update={true}
                index={1}
            />
            <GameCard 
                image={moddedImage}
                title="Industrial Revolution Modpack"
                status="Play"
                index={2}
            />
             <GameCard 
                image={caveImage}
                title="Vanilla 1.21 Snapshot"
                status="Play"
                index={3}
            />
        </div>
      </div>
    </LauncherLayout>
  );
}
