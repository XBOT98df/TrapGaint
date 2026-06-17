import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogOut, FolderOpen } from "lucide-react";
import { launcher, type AuthAccount } from "@/lib/launcher";
import { formatPlaytimeTotal, getWeeklyPlaytimeStats } from "@/lib/playtimeTracker";
import dragonLogo from "@assets/CS_Star_8.svg";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AuthAccount | null;
}

export function AccountDialog({ open, onOpenChange, account }: AccountDialogProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [playtimeStats, setPlaytimeStats] = useState(() =>
    getWeeklyPlaytimeStats(account?.uuid ?? null)
  );

  useEffect(() => {
    const accountId = account?.uuid ?? null;
    const refresh = () => {
      setPlaytimeStats(getWeeklyPlaytimeStats(accountId));
    };

    refresh();

    if (!open || !accountId) {
      return;
    }

    const intervalId = window.setInterval(refresh, 1000);
    return () => window.clearInterval(intervalId);
  }, [open, account?.uuid]);

  const handleLogout = async () => {
    if (!account) return;
    
    setIsLoggingOut(true);
    try {
      // Clear session from storage first
      const { clearSession } = await import("@/lib/crackedAccountStorage");
      await clearSession();
      
      // Clear session from auth manager
      const { authManager } = await import("@/lib/auth");
      await authManager.logout();
      
      // Remove account from launcher
      await launcher.removeAccount(account.uuid);
      
      // Clear any stored preferences
      localStorage.removeItem('lapetus_preferences');
      localStorage.removeItem('lapetus_oder_id');
      localStorage.removeItem('lapetus_username');
      localStorage.removeItem('lapetus_performance_mode');
      
      // Close dialog
      onOpenChange(false);
      
      // Skip startup animation once and show onboarding immediately after logout
      localStorage.setItem('dragon_skip_startup_once', '1');

      // Reload the page to go back to onboarding
      window.location.reload();
    } catch (error) {
      console.error('Failed to logout:', error);
      setIsLoggingOut(false);
    }
  };

  const handleOpenGameLocation = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // First get the Minecraft directory
      const minecraftDir = await invoke<string>('get_minecraft_dir');
      // Then open it
      await invoke('open_folder', { path: minecraftDir });
    } catch (error) {
      console.error('Failed to open game location:', error);
    }
  };

  if (!account) return null;

  const maxDaySeconds = playtimeStats.days.reduce(
    (max, day) => Math.max(max, day.seconds),
    1
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Bento card wrapper for entire dialog */}
      <DialogContent className="sm:max-w-2xl p-0 border-0 bg-transparent overflow-visible [&>button]:hidden">
        <div className="relative rounded-[40px] bg-gradient-to-b from-zinc-800/50 to-zinc-800/60 p-3.5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)_inset]">
          {/* Inner highlight */}
          <div
            className="absolute inset-[1px] rounded-[39px] bg-gradient-to-b from-white/10 to-transparent pointer-events-none"
            style={{ height: "50%" }}
          />
          
          {/* Inner card - actual dialog content */}
          <div className="relative overflow-hidden rounded-[28px] bg-black/95 backdrop-blur-xl shadow-[0_2px_8px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.05)]">
            <DialogHeader className="border-b border-zinc-800/50 pb-3 px-6 pt-4">
              <DialogTitle className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}>
                ACCOUNT SETTINGS
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 px-6">
              {/* Account Info */}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  ACCOUNT
                </label>
                
                <div className="flex items-center gap-4 p-3 bg-black rounded-lg">
                  {account.is_offline ? (
                    <img 
                      src={dragonLogo} 
                      alt="Dragon Logo" 
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <img 
                      src={`https://mc-heads.net/avatar/${account.uuid}/48`}
                      alt={account.username}
                      className="w-12 h-12 rounded-lg"
                      onError={(e) => {
                        e.currentTarget.src = dragonLogo;
                      }}
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                      {account.username}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {account.is_offline ? "Offline Mode" : "Microsoft Account"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Playtime Stats */}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  PLAYTIME THIS WEEK
                </label>
                
                <div className="p-3 bg-black rounded-lg">
                  <div className="flex items-end justify-between h-20 gap-2">
                    {playtimeStats.days.map((day) => {
                      const fillPercent = day.seconds > 0
                        ? Math.max(6, Math.round((day.seconds / maxDaySeconds) * 100))
                        : 0;

                      return (
                        <div key={day.dateKey} className="flex-1 flex flex-col items-center gap-2">
                          <div className="w-full h-14 bg-zinc-900 rounded-t-lg relative overflow-hidden border border-zinc-800/80">
                            <div 
                              className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${
                                day.isToday
                                  ? 'bg-gradient-to-t from-emerald-500 to-emerald-400'
                                  : 'bg-gradient-to-t from-zinc-700 to-zinc-600'
                              }`}
                              style={{ height: `${fillPercent}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-medium ${day.isToday ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {day.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-2 border-t border-zinc-800">
                    <p className="text-xs text-zinc-400">
                      Total: <span className="text-white font-semibold">{formatPlaytimeTotal(playtimeStats.totalSeconds)}</span>
                      {playtimeStats.isLive ? (
                        <span className="ml-2 text-emerald-400">Live</span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  ACTIONS
                </label>
                
                <div className="space-y-2 p-2 bg-black rounded-lg">
                  <Button
                    onClick={handleOpenGameLocation}
                    variant="outline"
                    className="w-full h-9 bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50 hover:border-zinc-600 text-white justify-start text-sm"
                    style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 500 }}
                  >
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Open Game Location
                  </Button>

                  <Button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    variant="outline"
                    className="w-full h-9 bg-red-500/10 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 text-red-400 hover:text-red-300 justify-start text-sm"
                    style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 500 }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
