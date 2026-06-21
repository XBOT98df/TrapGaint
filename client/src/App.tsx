import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Launcher from "@/pages/Launcher";
import Onboarding from "@/pages/Onboarding";
import CrashViewer from "@/pages/CrashViewer";
import GameConsole from "@/pages/GameConsole";
import StartupUpdate from "@/pages/StartupUpdate";
import ContactDemo from "@/pages/ContactDemo";
import { Spinner } from "@/components/ui/ios-spinner";
import { getTierFromStorage, getTierByName, applyTierTheme } from "@/lib/membership";

const MAIN_WINDOW_SIZE = { width: 1700, height: 800 };
const MAIN_WINDOW_MIN_SIZE = { width: 1000, height: 600 };

function Router() {
  return (
    <Switch>
      <Route path="/" component={Launcher} />
      <Route path="/showcase" component={Home} />
      <Route path="/crash-viewer" component={CrashViewer} />
      <Route path="/game-console" component={GameConsole} />
      <Route path="/contact-demo" component={ContactDemo} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Simple splash screen for returning users
function SplashScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3000); // 3 seconds splash
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

function App() {
  const shouldSkipStartup = typeof window !== 'undefined' && localStorage.getItem('dragon_skip_startup_once') === '1';
  
  // Force initial state on mount
  const getInitialState = (): 'update-check' | 'splash' | 'auth' | 'main' => {
    if (shouldSkipStartup) {
      console.log('[App] Skipping startup, going to auth');
      return 'auth';
    }
    console.log('[App] Starting with update-check');
    return 'update-check';
  };
  
  const [appState, setAppState] = useState<'update-check' | 'splash' | 'auth' | 'main'>(getInitialState);
  const [hasCompletedSetup, setHasCompletedSetup] = useState<boolean | null>(null);
  const [updateCheckDone, setUpdateCheckDone] = useState(false); // Always start false
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isCrashViewer = pathname === '/crash-viewer' || pathname.startsWith('/crash-viewer');
  const isGameConsole = pathname === '/game-console' || pathname.startsWith('/game-console');

  useEffect(() => {
    if (shouldSkipStartup) {
      localStorage.removeItem('dragon_skip_startup_once');
    }
  }, [shouldSkipStartup]);

  useEffect(() => {
    if (isCrashViewer || isGameConsole) {
      return;
    }

    let cancelled = false;

    const syncWindowSize = async () => {
      try {
        const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
        if (cancelled) return;

        const appWindow = getCurrentWindow();

        await appWindow.setDecorations(true);
        await appWindow.setResizable(true);
        await appWindow.setMinSize(new LogicalSize(MAIN_WINDOW_MIN_SIZE.width, MAIN_WINDOW_MIN_SIZE.height));
        await appWindow.setSize(new LogicalSize(MAIN_WINDOW_SIZE.width, MAIN_WINDOW_SIZE.height));
        await appWindow.center();
      } catch (error) {
        console.error('[App] Failed to sync window size:', error);
      }
    };

    syncWindowSize();

    return () => {
      cancelled = true;
    };
  }, [appState, isCrashViewer, isGameConsole]);

  // Apply tier theme on app startup - check for current user's tier
  useEffect(() => {
    const restoreTier = () => {
      const oderId = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
      console.log('[App] Restoring tier for oderId:', oderId);
      const tierName = getTierFromStorage(oderId || undefined);
      const tier = getTierByName(tierName);
      console.log('[App] Applying tier:', tierName, tier);
      applyTierTheme(tier);
    };
    
    // Apply immediately
    restoreTier();
    
    // Also listen for storage changes (in case oderId is set later)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'lapetus_oder_id' || e.key === 'dragon_oder_id' || e.key === 'dragon_tier' || e.key === 'dragon_user_tiers') {
        console.log('[App] Storage changed, restoring tier');
        restoreTier();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically for the first few seconds (in case storage event doesn't fire)
    const checkInterval = setInterval(restoreTier, 500);
    setTimeout(() => clearInterval(checkInterval), 3000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(checkInterval);
    };
  }, []);

  // Cleanup heartbeat interval on unmount (removed - now handled in setup effect)

  // Check if user has completed onboarding setup (has performance mode set AND has accounts)
  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    
    const checkSetup = async () => {
      try {
        let performanceMode = localStorage.getItem('lapetus_performance_mode');
        const { invoke } = await import("@tauri-apps/api/core");
        
        // Check if we have accounts in Tauri (this includes both Xbox and offline accounts)
        const accounts = await invoke<any[]>("get_accounts");
        const hasAccounts = accounts && accounts.length > 0;
        
        // If we have accounts but no performance mode set, set it to high by default
        if (hasAccounts && !performanceMode) {
          console.log('[App] Accounts found but no performance mode set, defaulting to high');
          localStorage.setItem('lapetus_performance_mode', 'high');
          performanceMode = 'high';
        }
        
        if (hasAccounts) {
          console.log('[App] Found accounts in Tauri:', accounts.map((a: any) => a.username));
          
          // Get the active account
          const activeAccount = await invoke<any>("get_active_account");
          if (activeAccount) {
            console.log('[App] Active account found:', activeAccount.username);
            
            // Preload Xbox friends immediately in background
            try {
              console.log('[App] Preloading Xbox friends...');
              const { launcher } = await import("@/lib/launcher");
              launcher.getXboxFriends().then(friends => {
                console.log('[App] Xbox friends preloaded:', friends.length);
              }).catch(err => {
                console.log('[App] Failed to preload friends:', err);
              });
            } catch (err) {
              console.log('[App] Friend preload error:', err);
            }
            
            // Initialize user status in Supabase
            const oderId = localStorage.getItem('lapetus_oder_id');
            if (oderId && activeAccount.username) {
              try {
                const { updateUserStatus } = await import("@/lib/friendsService");
                console.log('[App] Initializing user status:', { oderId, username: activeAccount.username });
                await updateUserStatus(oderId, activeAccount.username, true, null, null, null, null, null, null);
                console.log('[App] User status initialized:', activeAccount.username);
              } catch (e) {
                console.error('[App] Failed to initialize user status:', e);
              }
            }
          }
        } else {
          console.log('[App] No accounts found in Tauri');
        }
        
        // User has completed setup if they have performance mode AND accounts
        const setupComplete = !!performanceMode && hasAccounts;
        console.log('[App] Setup check:', { performanceMode: !!performanceMode, hasAccounts, setupComplete });
        console.log('[App] Setting hasCompletedSetup to:', setupComplete);
        setHasCompletedSetup(setupComplete);
      } catch (e) {
        console.error("[App] Failed to check setup:", e);
        setHasCompletedSetup(false);
      }
    };
    
    checkSetup();
    
    // Cleanup heartbeat on unmount
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        console.log('[App] Cleaned up heartbeat interval');
      }
    };
  }, []);

  // When both update check is done AND setup check is done, determine next state
  useEffect(() => {
    console.log('[App] State transition check:', { appState, updateCheckDone, hasCompletedSetup });

    // Only transition if we're in update-check state and both checks are done
    if (appState === 'update-check' && updateCheckDone && hasCompletedSetup !== null) {
      if (hasCompletedSetup) {
        console.log('[App] Setup complete, going to main app');
        setAppState('main');
      } else {
        console.log('[App] Setup incomplete, showing onboarding');
        setAppState('auth');
      }
    } else if (appState === 'auth' && hasCompletedSetup === true) {
      // If we're in auth but setup is complete (shouldn't happen), go to main
      console.log('[App] In auth but setup complete, going to main');
      setAppState('main');
    }
  }, [updateCheckDone, hasCompletedSetup, appState]);

  const handleUpdateComplete = () => {
    console.log('[App] handleUpdateComplete called');
    setUpdateCheckDone(true);
  };

  const handleSplashComplete = () => {
    setAppState('main');
  };

  const handleAuthComplete = () => {
    setAppState('main');
  };

  // Skip update check and auth for crash viewer window
  if (isCrashViewer) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CrashViewer />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Skip update check and auth for game console window
  if (isGameConsole) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <GameConsole />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // First: Check for updates on startup
  if (appState === 'update-check') {
    console.log('[App] Rendering StartupUpdate component');
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StartupUpdate onComplete={handleUpdateComplete} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Second: Show splash screen for returning users
  if (appState === 'splash') {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SplashScreen onComplete={handleSplashComplete} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Third: Show auth/onboarding screen for new users
  if (appState === 'auth') {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Onboarding onComplete={handleAuthComplete} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Fourth: Main app
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
