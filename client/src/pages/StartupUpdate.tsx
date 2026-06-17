import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import trapcodeLogo from "/trapcode.png";

interface StartupUpdateProps {
  onComplete: () => void;
}

type UpdateState = 'checking' | 'downloading' | 'installing' | 'no-update' | 'error';
type BootState = 'startup-animation' | 'update';

export default function StartupUpdate({ onComplete }: StartupUpdateProps) {
  const [bootState, setBootState] = useState<BootState>('startup-animation');
  const [state, setState] = useState<UpdateState>('checking');
  const [progress, setProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [statusText, setStatusText] = useState('Checking for updates...');
  const [startupReady, setStartupReady] = useState(false);
  const [minimumDisplayDone, setMinimumDisplayDone] = useState(false);
  const hasContinuedRef = useRef(false);
  
  // Loading states cycle
  const [loadingStateIndex, setLoadingStateIndex] = useState(0);
  const loadingStates = ['Fetching profile', 'Fetching data', 'Setting up', 'Almost done'];

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  };

  const restoreMainWindowSize = async () => {
    try {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      await appWindow.setDecorations(true);
      await appWindow.setResizable(true);
      await appWindow.setMinSize(new LogicalSize(1000, 600));
      await appWindow.setSize(new LogicalSize(1700, 800));
      await appWindow.center();
    } catch (error) {
      console.error('[StartupUpdate] Failed to restore main window size:', error);
    }
  };

  const finishStartupSplash = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('finish_startup_splash');
    } catch (error) {
      console.error('[StartupUpdate] Failed to finish startup splash:', error);
    }
  };

  // Cycle through loading states
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingStateIndex((prev) => (prev + 1) % 4);
    }, 1500);
    return () => clearInterval(interval);
  }, []);
  
  // Update status text based on loading state
  useEffect(() => {
    if (bootState === 'startup-animation') {
      setStatusText(loadingStates[loadingStateIndex]);
    }
  }, [loadingStateIndex, bootState, loadingStates]);

  // Keep the startup splash visible for a minimum time.
  useEffect(() => {
    // Always show for at least 2.5 seconds
    const timer = setTimeout(() => {
      setMinimumDisplayDone(true);
      setStartupReady(true); // Also set ready after minimum time
    }, 2500);
    
    checkAndUpdate();
    
    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Hard fallback to prevent indefinite startup hangs.
  useEffect(() => {
    const hardTimer = setTimeout(() => {
      console.warn('[StartupUpdate] Startup fallback triggered');
      setMinimumDisplayDone(true);
      setStartupReady(true);
    }, 20000);

    return () => {
      clearTimeout(hardTimer);
    };
  }, []);

  useEffect(() => {
    if (bootState !== 'startup-animation' || !startupReady || !minimumDisplayDone || hasContinuedRef.current) {
      return;
    }

    hasContinuedRef.current = true;
    handleContinue();
  }, [bootState, minimumDisplayDone, startupReady]);

  const handleContinue = async () => {
    // Check if user has a valid session
    try {
      const { authManager } = await import("@/lib/auth");
      const { launcher } = await import("@/lib/launcher");
      
      const session = authManager.getCurrentSession();
      
      if (!session) {
        await restoreMainWindowSize();
        await finishStartupSplash();
        onComplete();
        return;
      }
      
      // Has session, verify account still exists
      try {
        const accounts = await withTimeout(launcher.getAccounts(), 8000, 'getAccounts');
        const accountExists = accounts.some(acc =>
          session.isOffline
            ? acc.username === session.username && acc.is_offline
            : acc.uuid === session.minecraftUuid
        );

        if (!accountExists) {
          await authManager.logout();
        }
      } catch (accountCheckErr) {
        console.error('[StartupUpdate] Account existence check timed out, continuing:', accountCheckErr);
      }

      await restoreMainWindowSize();
      await finishStartupSplash();
      onComplete();
    } catch (error) {
      console.error('[StartupUpdate] Session check failed:', error);
      await restoreMainWindowSize();
      await finishStartupSplash();
      onComplete();
    }
  };

  const checkAndUpdate = async () => {
    try {
      // DEMO MODE: Simulate update check for testing
      const DEMO_MODE = false; // Set to true to test update flow
      
      if (DEMO_MODE) {
        console.log('[StartupUpdate] DEMO MODE: Simulating update check...');
        
        // Simulate checking for updates
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Simulate update available (change to false to test no-update flow)
        const updateAvailable = true;
        
        if (!updateAvailable) {
          console.log('[StartupUpdate] DEMO: No update available');
          setStartupReady(true);
          return; // Just continue with normal startup
        }
        
        // Show update screen
        setBootState('update');
        setNewVersion('1.2.0');
        setCurrentVersion('1.1.0');
        setState('downloading');
        setStatusText('Downloading update...');
        
        // Simulate download progress
        for (let i = 0; i <= 100; i += 5) {
          await new Promise(resolve => setTimeout(resolve, 100));
          setProgress(i);
          setStatusText(`Downloading... ${i}%`);
        }
        
        // Simulate installing
        setState('installing');
        setStatusText('Installing update...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Simulate app restart by reloading the page
        console.log('[StartupUpdate] DEMO: Simulating app restart...');
        window.location.reload();
        return;
      }
      
      // REAL MODE: Check if we're in Tauri
      let invoke: any;
      try {
        const core = await import('@tauri-apps/api/core');
        invoke = core.invoke;
      } catch (e) {
        console.log('[StartupUpdate] Not in Tauri, skipping update check');
        // Don't set ready here - let the minimum display timer control it
        return; // Just continue with normal startup
      }

      // Use Rust backend to check for updates (bypasses CORS)
      console.log('[StartupUpdate] Checking for updates via Rust backend...');

      const result = await withTimeout(
        invoke('check_app_update') as Promise<{
          available: boolean;
          current_version: string;
          latest_version: string | null;
          download_url: string | null;
        }>,
        12000,
        'check_app_update'
      );

      console.log('[StartupUpdate] Update check result:', result);
      setCurrentVersion(result.current_version);

      if (!result.available || !result.latest_version) {
        console.log('[StartupUpdate] No update available');

        // Don't set ready here - let the minimum display timer control it
        
        void (async () => {
          try {
            console.log('[StartupUpdate] Registering user in Supabase...');
            const { launcher } = await import("@/lib/launcher");
            const { registerUserInSupabase } = await import("@/lib/userRegistration");
            const activeAccount = await withTimeout(launcher.getActiveAccount(), 6000, 'getActiveAccount');

            if (activeAccount) {
              console.log('[StartupUpdate] Active account found, registering:', activeAccount.username);
              await withTimeout(registerUserInSupabase(activeAccount), 10000, 'registerUserInSupabase');
              console.log('[StartupUpdate] ✓ User registered');

              try {
                const friends = await withTimeout(launcher.getXboxFriends(), 8000, 'getXboxFriends');
                console.log('[StartupUpdate] Xbox friends preloaded:', friends.length);
                localStorage.setItem('preloaded_friends', JSON.stringify(friends));
                localStorage.setItem('preloaded_friends_timestamp', Date.now().toString());
              } catch (err) {
                console.log('[StartupUpdate] Failed to preload friends:', err);
              }
            }
          } catch (err) {
            console.error('[StartupUpdate] Registration/preload error:', err);
          }
        })();

        return; // Just continue with normal startup
      }

      // Update available - download and install silently in background
      console.log(`[StartupUpdate] Update available: ${result.current_version} -> ${result.latest_version}`);
      console.log('[StartupUpdate] Starting silent background update...');
      
      // Don't show update screen, keep showing startup animation
      // The update will happen in the background

      // Listen for progress events (for logging only)
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<{ status: string; progress: number }>('update-progress', (event) => {
        console.log('[StartupUpdate] Background update progress:', event.payload.progress + '%');
      });

      try {
        // Perform the update silently
        console.log('[StartupUpdate] Downloading and installing update...');
        await withTimeout(
          invoke('perform_app_update') as Promise<unknown>,
          25000,
          'perform_app_update'
        );
        console.log('[StartupUpdate] Update installed, app will restart automatically');
        // App will restart automatically, no need to show anything
      } catch (updateErr) {
        console.error('[StartupUpdate] Silent update failed:', updateErr);
        // Update failed - let the minimum display timer control ready state
        console.log('[StartupUpdate] Continuing with current version');
      } finally {
        unlisten();
      }

    } catch (e) {
      console.error('[StartupUpdate] Error:', e);
      // Any error - let the minimum display timer control ready state
    }
  };

  return (
    <AnimatePresence mode="wait">
      {/* App startup splash - Apple-like animation with trapcode logo on car2 background */}
      {bootState === 'startup-animation' && (
        <div className="fixed inset-0 flex h-screen w-screen items-center justify-center overflow-hidden">
          {/* Background image */}
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: 'url(/car2.jpg)' }}
          />
          
          {/* Dark overlay for better logo visibility */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Center logo with Apple-like pop-in animation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ 
              duration: 0.8, 
              ease: [0.34, 1.56, 0.64, 1], // Cubic bezier for bounce effect
              delay: 0.2
            }}
            className="relative z-10"
          >
            <motion.img
              src={trapcodeLogo}
              alt="TrapCode"
              className="w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] md:w-[360px] md:h-[360px] object-contain"
              animate={{ 
                filter: [
                  'drop-shadow(0 0 40px rgba(255,255,255,0.3))',
                  'drop-shadow(0 0 60px rgba(255,255,255,0.5))',
                  'drop-shadow(0 0 40px rgba(255,255,255,0.3))'
                ]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* Loading status at bottom */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-16 flex flex-col items-center gap-4 z-10"
          >
            {/* Simple spinner */}
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            
            <AnimatePresence mode="wait">
              <motion.p
                key={statusText}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.3 }}
                className="text-white text-base font-medium tracking-wider drop-shadow-lg"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {statusText}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* Update Screen - Only shown when update is being installed */}
      {bootState === 'update' && (
        <motion.div
          key="update"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="h-screen w-screen bg-black flex flex-col items-center justify-center overflow-hidden relative"
        >
          {/* Topography background */}
          <div 
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: 'url(/topography.svg)',
              backgroundRepeat: 'repeat',
              backgroundSize: '400px 400px',
            }}
          />
          
          {/* Grain overlay */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="relative z-10 flex flex-col items-center gap-8">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center"
            >
              <img 
                src={trapcodeLogo} 
                alt="TrapCode" 
                className="w-56 h-56 object-contain"
              />
            </motion.div>

            {/* Status */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-5 w-80"
            >
              {/* Status text */}
              <p className="text-white/50 text-sm font-light tracking-[0.15em] uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {statusText}
              </p>

              {/* Progress bar for downloading/installing */}
              {(state === 'downloading' || state === 'installing') && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full"
                >
                  <div className="relative h-0.5 rounded-sm overflow-hidden bg-white/[0.06]">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-sm bg-white/90"
                      style={{ width: `${progress}%` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    />
                  </div>
                  {newVersion && (
                    <p className="text-white/25 text-xs font-light tracking-wider mt-3 text-center">
                      {currentVersion} → {newVersion}
                    </p>
                  )}
                </motion.div>
              )}

              {/* Error */}
              {state === 'error' && (
                <div className="text-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 bg-[#5c0a0a]/20 border border-red-500/20"
                  >
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </motion.div>
                  <p className="text-white/30 text-xs mt-2">Continuing to app...</p>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
