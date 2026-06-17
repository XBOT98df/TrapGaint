import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, LogOut, Star, Trophy, Award } from "lucide-react";
import { launcher, type AuthAccount } from "@/lib/launcher";

interface ProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeAccount: AuthAccount | null;
  onAccountChange: (account: AuthAccount | null) => void;
  onLogout?: () => void;
}

export default function ProfilePanel({ isOpen, onClose, activeAccount, onAccountChange, onLogout }: ProfilePanelProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [skinKey, setSkinKey] = useState(0);
  const [localAccount, setLocalAccount] = useState<AuthAccount | null>(activeAccount);
  
  // Achievements data
  const achievements = [
    { id: 1, name: "First Launch", icon: "🚀", unlocked: true, date: "2024-01-15" },
    { id: 2, name: "Mod Master", icon: "🔧", unlocked: true, date: "2024-01-20" },
    { id: 3, name: "Version Explorer", icon: "🗺️", unlocked: true, date: "2024-02-01" },
    { id: 4, name: "Friend Collector", icon: "👥", unlocked: false },
    { id: 5, name: "Modpack Enthusiast", icon: "📦", unlocked: true, date: "2024-01-25" },
    { id: 6, name: "Dragon Rider", icon: "🐉", unlocked: false },
    { id: 7, name: "Forge Master", icon: "⚒️", unlocked: true, date: "2024-01-18" },
    { id: 8, name: "Fabric Weaver", icon: "🧵", unlocked: true, date: "2024-01-22" },
  ];

  const unlockedAchievements = achievements.filter(a => a.unlocked);
  const recentAchievements = unlockedAchievements.slice(0, 3);
  const achievementProgress = Math.round((unlockedAchievements.length / achievements.length) * 100);
  
  // Calculate skin URL from localAccount
  const getSkinUrl = () => {
    if (!localAccount) return "https://mc-heads.net/body/MHF_Steve/180";
    const skinName = localAccount.is_offline ? (localAccount.skin_username || localAccount.username) : localAccount.uuid;
    const url = `https://mc-heads.net/body/${skinName}/180`;
    console.log('[ProfilePanel] Getting skin URL:', url, 'for skinName:', skinName, 'skinKey:', skinKey);
    return url;
  };
  
  const [skinUrl, setSkinUrl] = useState<string>("https://mc-heads.net/body/MHF_Steve/180");

  // Update skin URL whenever localAccount or skinKey changes
  useEffect(() => {
    if (localAccount) {
      const newUrl = getSkinUrl();
      console.log('[ProfilePanel] Updating skin URL to:', newUrl);
      setSkinUrl(newUrl);
    }
  }, [localAccount, skinKey]);

  // Sync local account with prop
  useEffect(() => {
    setLocalAccount(activeAccount);
  }, [activeAccount]);

  // Listen for account updates (e.g., skin changes)
  useEffect(() => {
    const handleAccountUpdate = async () => {
      console.log('[ProfilePanel] Received accountUpdated event');
      try {
        // Prefer backend state because it's authoritative for skin selection.
        const backendAccount = await launcher.getActiveAccount();
        if (backendAccount) {
          console.log('[ProfilePanel] Loaded account from backend:', backendAccount);
          setLocalAccount(backendAccount);
          onAccountChange(backendAccount);
          setSkinKey(prev => prev + 1);
          return;
        }

        // Legacy fallback for older flows that only touch localStorage.
        const currentAccountStr = localStorage.getItem('dragon_current_account');
        if (currentAccountStr) {
          const account = JSON.parse(currentAccountStr);
          console.log('[ProfilePanel] Loaded account from localStorage:', account);
          setLocalAccount(account); // Update local state
          onAccountChange(account); // Update parent state
          setSkinKey(prev => {
            const newKey = prev + 1;
            console.log('[ProfilePanel] Updated skinKey:', newKey);
            return newKey;
          });
        }
      } catch (e) {
        console.error("[ProfilePanel] Failed to reload account:", e);
      }
    };
    
    window.addEventListener('accountUpdated', handleAccountUpdate);
    return () => window.removeEventListener('accountUpdated', handleAccountUpdate);
  }, [onAccountChange]);

  // When panel opens, just refresh the skin display
  useEffect(() => {
    if (isOpen) {
      console.log('[ProfilePanel] Panel opened, refreshing skin display only');
      // Force a new skinKey to trigger image reload
      setSkinKey(Date.now());
    }
  }, [isOpen]);

  const handleLogout = async () => {
    console.log('[Logout] Starting logout...');
    if (!localAccount) {
      console.log('[Logout] No active account');
      return;
    }
    setIsLoggingOut(true);
    try {
      console.log('[Logout] Removing account:', localAccount.uuid);
      
      // Clear session from storage first
      const { clearSession } = await import("@/lib/crackedAccountStorage");
      await clearSession();
      console.log('[Logout] Session cleared');
      
      // Clear auth manager session
      const { authManager } = await import("@/lib/auth");
      await authManager.logout();
      console.log('[Logout] Auth manager session cleared');
      
      // Remove account from launcher
      await launcher.removeAccount(localAccount.uuid);
      console.log('[Logout] Account removed');
      
      // Clear performance mode to trigger full onboarding
      localStorage.removeItem('lapetus_performance_mode');
      console.log('[Logout] LocalStorage cleared');
      
      // Clear the active account state
      onAccountChange(null);
      
      // Small delay to ensure backend state is saved, then reload
      await new Promise(resolve => setTimeout(resolve, 100));

      // Skip startup animation once and go straight to onboarding after logout
      localStorage.setItem('dragon_skip_startup_once', '1');
      
      // Call onLogout callback if provided
      if (onLogout) {
        onLogout();
      } else {
        // Reload the app to trigger onboarding check
        window.location.reload();
      }
    } catch (e) {
      console.error("[Logout] Failed:", e);
      setIsLoggingOut(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 400 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 400 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-zinc-950 z-50 overflow-hidden"
          >
            {/* Logout button - top right */}
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingOut ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </>
                )}
              </button>
            </div>

            {/* Content - centered */}
            <div className="h-full flex flex-col items-center justify-center p-8 overflow-y-auto">
              {localAccount && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center text-center w-full"
                >
                  {/* Skin */}
                  <img 
                    key={`skin-${skinKey}`}
                    src={skinUrl}
                    alt={localAccount.username}
                    className="h-48 mb-6"
                    onLoad={() => console.log('[ProfilePanel] Image loaded successfully from:', skinUrl)}
                    onError={(e) => {
                      console.log('[ProfilePanel] Image failed to load from:', skinUrl);
                      e.currentTarget.src = 'https://mc-heads.net/body/MHF_Steve/180';
                    }}
                  />
                  
                  {/* Username */}
                  <h3 className="text-2xl font-serif italic font-medium text-white mb-1">
                    {localAccount.username}
                  </h3>
                  <p className={`text-sm mb-6 ${localAccount.is_offline ? 'text-zinc-500' : 'text-[#3DF56B]'}`}>
                    {localAccount.is_offline ? "Offline Mode" : "Microsoft Account"}
                  </p>

                  {/* Achievements Section */}
                  <div className="w-full max-w-xs space-y-4">
                    {/* Achievement Progress */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-5 h-5 text-yellow-500" />
                          <span className="text-sm font-medium text-white">Achievements</span>
                        </div>
                        <span className="text-xs font-bold text-yellow-500">{achievementProgress}%</span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${achievementProgress}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-yellow-500 to-amber-500"
                        />
                      </div>
                      
                      <p className="text-xs text-zinc-400">
                        {unlockedAchievements.length} of {achievements.length} unlocked
                      </p>
                    </div>

                    {/* Recent Achievements */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Award className="w-4 h-4 text-zinc-400" />
                        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Recent</span>
                      </div>
                      
                      <div className="space-y-2">
                        {recentAchievements.map((achievement) => (
                          <motion.div
                            key={achievement.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            <div className="text-2xl">{achievement.icon}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{achievement.name}</p>
                              <p className="text-xs text-zinc-500">{achievement.date}</p>
                            </div>
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-white">{unlockedAchievements.length}</div>
                        <div className="text-xs text-zinc-400">Unlocked</div>
                      </div>
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-zinc-500">{achievements.length - unlockedAchievements.length}</div>
                        <div className="text-xs text-zinc-400">Locked</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
