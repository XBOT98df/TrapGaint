import { useState } from "react";
import { X, ExternalLink, CheckCircle2 } from "lucide-react";

interface EulaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  serverName: string;
}

export function EulaDialog({ 
  isOpen, 
  onClose, 
  onAccept,
  serverName
}: EulaDialogProps) {
  const [hasRead, setHasRead] = useState(false);

  if (!isOpen) return null;

  const handleAccept = () => {
    onAccept();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Dialog Wrapper with floating logo */}
      <div className="relative pt-[60px]">
        {/* Floating Logo - positioned above dialog */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10">
          <img 
            src="/NewIcons.svg" 
            alt="Resonance" 
            className="w-[120px] h-[120px] object-contain rounded-2xl drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
          />
        </div>
        
        {/* Dialog */}
        <div className="w-[600px] bg-[#0a0a0a] rounded-lg overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] pt-[70px]">
          {/* Header */}
          <div className="px-6 pb-4 flex items-center justify-between">
            <h2 className="text-white text-lg font-medium" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}>
              MINECRAFT END USER LICENSE AGREEMENT
            </h2>
            <button 
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Server Name */}
          <div className="px-6 pb-4">
            <p className="text-white/60 text-sm" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Server: <span className="text-white font-medium">{serverName}</span>
            </p>
          </div>

          {/* EULA Content */}
          <div className="px-6 pb-6">
            <div 
              className="bg-[#1a1a1a] rounded-lg p-4 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
              onScroll={(e) => {
                const element = e.currentTarget;
                const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
                if (isAtBottom && !hasRead) {
                  setHasRead(true);
                }
              }}
            >
              <div className="space-y-4 text-sm text-white/80" style={{ fontFamily: "'Outfit', sans-serif" }}>
                <p className="font-semibold text-white">
                  By running this Minecraft server, you agree to the Minecraft End User License Agreement (EULA).
                </p>
                
                <div className="space-y-2">
                  <p className="font-medium text-white/90">Key Points:</p>
                  <ul className="list-disc list-inside space-y-1 text-white/70">
                    <li>You must own a legitimate copy of Minecraft</li>
                    <li>You may not distribute or sell Minecraft server software</li>
                    <li>You may not make commercial use of anything we've made without our permission</li>
                    <li>You may not use our brand or assets in a way that suggests official endorsement</li>
                    <li>Server owners are responsible for their server's content and users</li>
                  </ul>
                </div>

                <div className="pt-2 border-t border-white/10">
                  <p className="text-white/60 text-xs">
                    The full EULA can be found at:
                  </p>
                  <a 
                    href="https://www.minecraft.net/en-us/eula" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-pink-400 hover:text-pink-300 text-xs flex items-center gap-1 mt-1 transition-colors"
                  >
                    https://www.minecraft.net/en-us/eula
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="pt-4 space-y-2">
                  <p className="text-white/90 font-medium">What this means for your server:</p>
                  <ul className="list-disc list-inside space-y-1 text-white/70">
                    <li>You can run a server for you and your friends</li>
                    <li>You can accept donations (but not sell gameplay advantages)</li>
                    <li>You must moderate your server and follow the EULA</li>
                    <li>You cannot charge for access to vanilla gameplay features</li>
                  </ul>
                </div>

                <div className="pt-4 bg-pink-500/10 border border-pink-500/20 rounded p-3">
                  <p className="text-pink-400 text-xs font-medium">
                    📜 Scroll to the bottom to enable the "I Agree" button
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Agreement Checkbox */}
          <div className="px-6 pb-6">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                hasRead 
                  ? "border-pink-500 bg-pink-500/20 group-hover:bg-pink-500/30" 
                  : "border-white/20 bg-white/5 cursor-not-allowed"
              }`}>
                {hasRead && <CheckCircle2 className="w-4 h-4 text-pink-400" />}
              </div>
              <div className="flex-1">
                <p className={`text-sm transition-colors ${
                  hasRead ? "text-white" : "text-white/40"
                }`} style={{ fontFamily: "'Outfit', sans-serif" }}>
                  I have read and agree to the Minecraft EULA
                </p>
                <p className="text-xs text-white/40 mt-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  This will create an eula.txt file with eula=true in your server directory
                </p>
              </div>
            </label>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex justify-center gap-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-sm text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAccept}
              disabled={!hasRead}
              className={`px-8 py-2.5 text-sm font-medium text-white rounded transition-all ${
                hasRead
                  ? "bg-pink-600 hover:bg-pink-500 cursor-pointer"
                  : "bg-white/10 cursor-not-allowed opacity-50"
              }`}
            >
              I Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
