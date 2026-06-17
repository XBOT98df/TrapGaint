import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronRight, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedInput } from "@/components/ui/animated-input";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/ios-spinner";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { launcher, type AuthAccount } from "@/lib/launcher";
import { 
  createCrackedAccount, 
  checkUsernameExists, 
  registerCrackedAccountInSupabase 
} from "@/lib/crackedAccounts";
import { authManager } from "@/lib/auth";
import { 
  addCrackedAccount, 
  crackedAccountExists, 
  saveSession, 
  readSession,
  getAccountByUsername 
} from "@/lib/crackedAccountStorage";

// Supabase configuration for user registration
const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";

// Register user in Supabase for friends system
async function registerUserInSupabase(account: AuthAccount) {
  try {
    console.log('[Onboarding Registration] Starting registration for:', account.username);
    
    // Read oder_id from localStorage (should already be set by handleOnlineLogin)
    let xuid = localStorage.getItem('lapetus_oder_id');
    
    if (!xuid) {
      // Fallback: generate lap_ format for offline accounts
      xuid = `lap_${account.uuid.replace(/-/g, '').substring(0, 16)}`;
      console.log('[Onboarding Registration] No XUID in localStorage, using lap_ format:', xuid);
      localStorage.setItem('lapetus_oder_id', xuid);
      localStorage.setItem('lapetus_username', account.username);
    } else {
      console.log('[Onboarding Registration] Using XUID from localStorage:', xuid);
    }
    
    // Get Xbox profile for avatar and additional info
    let avatarUrl = null;
    let realName = null;
    let gamerscore = null;
    
    if (account.refresh_token && !xuid.startsWith('lap_')) {
      try {
        const xboxProfile = await launcher.getCurrentXboxProfile();
        if (xboxProfile) {
          // Search for avatar using Xbox API
          const searchResults = await launcher.searchXboxUsers(account.username);
          if (searchResults.length > 0 && searchResults[0].display_pic_raw) {
            avatarUrl = searchResults[0].display_pic_raw;
            realName = searchResults[0].real_name;
            gamerscore = searchResults[0].gamerscore;
          }
        }
      } catch (error) {
        console.warn('[Onboarding Registration] Could not fetch Xbox profile details:', error);
      }
    }
    
    // Insert into dragon_users table
    const response = await fetch(`${SUPABASE_URL}/rest/v1/dragon_users`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        xuid: xuid,
        gamertag: account.username,
        minecraft_uuid: account.uuid,
        avatar_url: avatarUrl,
        real_name: realName,
        gamerscore: gamerscore,
        is_online: true,
        last_seen: new Date().toISOString()
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('[Onboarding Registration] ✓ User registered in dragon_users:', data);
    } else {
      const errorText = await response.text();
      console.warn('[Onboarding Registration] Failed to register user:', errorText);
    }
  } catch (error) {
    console.error('[Onboarding Registration] Error registering user:', error);
  }
}

import wallNether from "@assets/generated_images/wallpaper_minecraft_nether_update_2560x1440.png";
import wallAquatic from "@assets/generated_images/wallpaper_minecraft_update_aquatic_2560x1440.png";
import wallFall from "@assets/generated_images/Minecraft_Fall_Drop_Campaign_Key_Art_DotNet_Downloadable_Wallpaper_2560x1440.png";
import wallSpring from "@assets/generated_images/MCV_SpringDrop_DotNet_Downloadable_Wallpaper_2560x1440.png";
import vanillaLogo from "@assets/generated_images/vanilla.png";
import microsoftLogo from "@assets/generated_images/microsoft.jpg";
import highEndImg from "@assets/CS_Star_8.svg";
import lowEndImg from "@assets/generated_images/22.png";
import starImg from "@assets/generated_images/star1\`1.png";

interface OnboardingProps {
  onComplete: () => void;
}

type OnboardingStep = "splash" | "auth" | "preferences" | "profile";


// Background wallpapers for slideshow
const BACKGROUND_WALLPAPERS = [wallNether, wallAquatic, wallFall, wallSpring];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("auth");
  const [authMode, setAuthMode] = useState<"select" | "online" | "offline" | "dragon">("select");
  const [showCreateOffline, setShowCreateOffline] = useState(false);
  const [offlineUsername, setOfflineUsername] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [existingAccounts, setExistingAccounts] = useState<AuthAccount[]>([]);
  const [loggedInAccount, setLoggedInAccount] = useState<AuthAccount | null>(null);
  const [bgIndex, setBgIndex] = useState(0);
  const [shakeError, setShakeError] = useState(false);
  const [showContent, setShowContent] = useState(false);
  
  // Preferences step state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [yearsPlaying, setYearsPlaying] = useState("");
  const [favoriteVersion, setFavoriteVersion] = useState("");
  const [playStyle, setPlayStyle] = useState("");
  const [favoriteMode, setFavoriteMode] = useState("");
  
  // Questions for preferences
  const questions = [
    {
      question: "How long have you been playing?",
      subtitle: "Help us understand your experience",
      options: ["Just started", "1-2 years", "3-5 years", "5+ years"],
      value: yearsPlaying,
      setValue: setYearsPlaying,
    },
    {
      question: "Favorite Minecraft version?",
      subtitle: "Which version do you enjoy most?",
      options: ["Latest", "1.16-1.19", "1.12", "1.8"],
      value: favoriteVersion,
      setValue: setFavoriteVersion,
    },
    {
      question: "How do you like to play?",
      subtitle: "What's your playstyle?",
      options: ["Solo", "With friends", "Large servers", "Mix of all"],
      value: playStyle,
      setValue: setPlayStyle,
    },
    {
      question: "Favorite game mode?",
      subtitle: "What do you play most?",
      options: ["Survival", "Creative", "PvP", "Modded"],
      value: favoriteMode,
      setValue: setFavoriteMode,
    },
  ];

  // Initial entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Splash screen timer - 7 seconds
  useEffect(() => {
    if (currentStep === "splash") {
      const timer = setTimeout(() => {
        // Set high-end mode by default and skip performance selection
        localStorage.setItem('lapetus_performance_mode', 'high');
        setCurrentStep("preferences");
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  // Background slideshow effect
  useEffect(() => {
    const interval = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % BACKGROUND_WALLPAPERS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { loadExistingAccounts(); }, []);

  const loadExistingAccounts = async () => {
    try {
      const accounts = await launcher.getAccounts();
      setExistingAccounts(accounts);
      const offlineAccount = accounts.find(a => a.is_offline);
      if (offlineAccount) setOfflineUsername(offlineAccount.username);
    } catch (e) { console.error("Failed to load accounts:", e); }
  };

  const handleOnlineLogin = async () => {
    setAuthError("");
    setIsAuthenticating(true);
    try {
      const account = await launcher.startMsLogin();
      
      // For Xbox accounts, ALWAYS fetch XUID first before anything else
      let oderId = `lap_${account.uuid.replace(/-/g, '').substring(0, 16)}`;
      
      if (account.refresh_token) {
        console.log('[Onboarding] Xbox account detected, fetching XUID before registration...');
        try {
          const xboxProfile = await launcher.getCurrentXboxProfile();
          console.log('[Onboarding] Xbox profile response:', xboxProfile);
          
          if (xboxProfile && xboxProfile.xuid) {
            oderId = xboxProfile.xuid;
            console.log('[Onboarding] ✓ Successfully fetched XUID:', oderId);
            
            // Store XUID immediately
            localStorage.setItem('lapetus_oder_id', oderId);
            localStorage.setItem('lapetus_username', account.username);
            console.log('[Onboarding] ✓ Stored XUID in localStorage');
          } else {
            console.error('[Onboarding] ✗ Xbox profile returned but no XUID found!');
            throw new Error('Failed to get Xbox XUID');
          }
        } catch (error) {
          console.error('[Onboarding] ✗ Failed to fetch XUID:', error);
          throw new Error('Failed to authenticate with Xbox Live. Please try again.');
        }
      }
      
      // Now register in Supabase with the XUID we just fetched
      await registerUserInSupabase(account);
      
      // Verify XUID is still in localStorage
      const storedOderId = localStorage.getItem('lapetus_oder_id');
      console.log('[Onboarding] Verification - stored oder_id:', storedOderId);
      
      if (!storedOderId || storedOderId.startsWith('lap_')) {
        console.error('[Onboarding] ✗ XUID not properly stored! Found:', storedOderId);
        throw new Error('Failed to store Xbox credentials. Please try again.');
      }
      
      // Create session with auth manager
      await authManager.loginOnline(account.username, account.uuid, storedOderId);
      
      // Automatically detect and store play mode based on Minecraft ownership
      // Backend sets is_offline=true if user doesn't own Minecraft
      const playMode = account.is_offline ? 'offline' : 'online';
      localStorage.setItem('lapetus_play_mode', playMode);
      
      console.log(`[Auth] Xbox login successful - Mode: ${playMode}, Username: ${account.username}`);
      if (account.is_offline) {
        console.log('[Auth] Playing in offline mode - Minecraft not detected on this Xbox account');
      } else {
        console.log('[Auth] Playing in online mode - Minecraft ownership verified');
      }
      
      setLoggedInAccount(account);
      onComplete();
    } catch (error) {
      setAuthError(String(error));
      setIsAuthenticating(false);
    }
  };

  const handleOfflineLogin = async () => {
    if (!offlineUsername.trim() || offlineUsername.length < 3) {
      setAuthError("Username must be 3-16 characters");
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      return;
    }
    
    setIsAuthenticating(true);
    setAuthError("");
    
    try {
      const trimmedUsername = offlineUsername.trim();
      console.log('[Onboarding] Attempting login with username:', trimmedUsername);
      
      // Debug: Check what's in localStorage
      const storedAccounts = localStorage.getItem('lapetus_cracked_accounts');
      console.log('[Onboarding] localStorage lapetus_cracked_accounts:', storedAccounts);
      
      // STEP 1: Check if this username was used before on THIS device (stored locally)
      const localAccount = await getAccountByUsername(trimmedUsername);
      console.log('[Onboarding] Local account check result:', localAccount ? 'FOUND' : 'NOT FOUND', localAccount);
      
      if (localAccount) {
        // User has used this username before on this device - auto-login
        console.log('[Onboarding] ✓ Found existing local account, auto-logging in:', trimmedUsername);
        
        // Find or restore the launcher account
        let account = existingAccounts.find(a => a.username === trimmedUsername && a.is_offline);
        
        if (!account) {
          // Account not in launcher, restore it
          console.log('[Onboarding] Restoring account to launcher');
          account = await launcher.createOfflineAccount(trimmedUsername);
        } else {
          await launcher.setActiveAccount(account.uuid);
        }
        
        // Create session
        const oderId = `lap_${account.uuid.replace(/-/g, '').substring(0, 16)}`;
        await saveSession({
          username: account.username,
          uuid: account.uuid,
          oderId: oderId,
          isOffline: true,
          createdAt: Date.now()
        });
        
        setLoggedInAccount(account);
        await registerUserInSupabase(account);
        console.log('[Onboarding] ✓ Auto-login successful');
        onComplete();
        return;
      }
      
      // STEP 2: New username on this device - check if it exists in Supabase (used by another user on another device)
      console.log('[Onboarding] New username on this device, checking Supabase availability:', trimmedUsername);
      const usernameCheck = await checkUsernameExists(trimmedUsername);
      
      if (usernameCheck.error) {
        console.error('[Onboarding] Error checking username:', usernameCheck.error);
        throw new Error(usernameCheck.error);
      }
      
      if (usernameCheck.exists) {
        console.log('[Onboarding] ✗ Username already taken by another user');
        setAuthError("Username already taken. Please choose another one.");
        setShakeError(true);
        setTimeout(() => setShakeError(false), 500);
        setIsAuthenticating(false);
        return;
      }
      
      // STEP 3: Create new account
      console.log('[Onboarding] ✓ Username available, creating new account:', trimmedUsername);
      let account = await launcher.createOfflineAccount(trimmedUsername);
      
      // Register in Supabase to reserve the username globally
      const registrationResult = await registerCrackedAccountInSupabase(
        trimmedUsername,
        account.uuid
      );
      
      if (!registrationResult.success) {
        console.error('[Onboarding] Failed to register in Supabase:', registrationResult.error);
        throw new Error(registrationResult.error || "Failed to register username");
      }
      
      // Store in local storage for future auto-login
      console.log('[Onboarding] Storing account locally for future auto-login');
      const storeResult = await addCrackedAccount(trimmedUsername, account.uuid);
      console.log('[Onboarding] Store result:', storeResult);
      
      // Verify it was stored
      const verifyStored = await getAccountByUsername(trimmedUsername);
      console.log('[Onboarding] Verification - account stored:', verifyStored);
      
      // Create session
      const oderId = registrationResult.oderId || `lap_${account.uuid.replace(/-/g, '').substring(0, 16)}`;
      await saveSession({
        username: account.username,
        uuid: account.uuid,
        oderId: oderId,
        isOffline: true,
        createdAt: Date.now()
      });
      
      setLoggedInAccount(account);
      await registerUserInSupabase(account);
      console.log('[Onboarding] ✓ New account created successfully');
      onComplete();
    } catch (error) {
      console.error('[Onboarding] Login error:', error);
      setAuthError(String(error));
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      setIsAuthenticating(false);
    }
  };

  const handleDragonLogin = async () => {
    if (!offlineUsername.trim() || offlineUsername.length < 3) {
      setAuthError("Username must be 3-16 characters");
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      return;
    }
    
    setIsAuthenticating(true);
    setAuthError("");
    
    try {
      const trimmedUsername = offlineUsername.trim();
      console.log('[Dragon Auth] Creating account for:', trimmedUsername);
      
      // Call Dragon Auth backend
      const result = await launcher.dragonLogin(trimmedUsername);
      console.log('[Dragon Auth] Login result:', result);
      
      // Create offline account in launcher for compatibility
      let account = await launcher.createOfflineAccount(trimmedUsername);
      
      // Store Dragon token info in localStorage
      localStorage.setItem('dragon_token', result.token);
      localStorage.setItem('dragon_uuid', result.uuid);
      localStorage.setItem('dragon_username', trimmedUsername);
      localStorage.setItem('lapetus_oder_id', result.uuid);
      localStorage.setItem('lapetus_username', trimmedUsername);
      
      // Create session
      await saveSession({
        username: trimmedUsername,
        uuid: result.uuid,
        oderId: result.uuid,
        isOffline: true,
        createdAt: Date.now()
      });
      
      setLoggedInAccount(account);
      await registerUserInSupabase(account);
      console.log('[Dragon Auth] ✓ Account created successfully');
      onComplete();
    } catch (error) {
      console.error('[Dragon Auth] Login error:', error);
      setAuthError(String(error));
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      setIsAuthenticating(false);
    }
  };

  // Auto-detection timer for TrapGaint - placed after handleDragonLogin is defined
  useEffect(() => {
    if (authMode === "dragon" && offlineUsername.trim().length >= 3 && !isAuthenticating) {
      const timer = setTimeout(() => {
        handleDragonLogin();
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [offlineUsername, authMode, isAuthenticating]);

  const handleQuickLogin = async (account: AuthAccount) => {
    setIsAuthenticating(true);
    setAuthError("");
    
    try {
      // Automatically detect and store play mode
      const playMode = account.is_offline ? 'offline' : 'online';
      localStorage.setItem('lapetus_play_mode', playMode);
      
      if (account.is_offline) {
        // For offline accounts (Xbox users without Minecraft), just set active and create session
        await launcher.setActiveAccount(account.uuid);
        
        // Create simple session in hidden file
        const oderId = `lap_${account.uuid.replace(/-/g, '').substring(0, 16)}`;
        await saveSession({
          username: account.username,
          uuid: account.uuid,
          oderId: oderId,
          isOffline: true,
          createdAt: Date.now()
        });
        console.log(`[Auth] Quick login (offline mode): ${account.username}`);
      } else {
        // Online accounts (Xbox users with Minecraft)
        const oderId = `lap_${account.uuid.replace(/-/g, '').substring(0, 16)}`;
        await authManager.loginOnline(account.username, account.uuid, oderId);
        await launcher.setActiveAccount(account.uuid);
        console.log(`[Auth] Quick login (online mode): ${account.username}`);
      }
      
      setLoggedInAccount(account);
      await registerUserInSupabase(account);
      onComplete();
    } catch (error) {
      setAuthError(String(error));
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      setIsAuthenticating(false);
    }
  };

  // Splash screen step
  const renderSplashStep = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center"
    >
      <Spinner size="lg" />
    </motion.div>
  );

  // Preferences step
  const renderPreferencesStep = () => {
    const currentQ = questions[currentQuestion];
    const isLastQuestion = currentQuestion === questions.length - 1;

    return (
      <motion.div
        key={currentQuestion}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        {/* Progress indicator */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 text-center">
          <p className="text-sm text-zinc-500 mb-2">
            Question {currentQuestion + 1} of {questions.length}
          </p>
          <div className="flex gap-2 justify-center">
            {questions.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 rounded-full transition-all duration-300 ${
                  idx === currentQuestion
                    ? "w-8 bg-[#3DF56B]"
                    : idx < currentQuestion
                    ? "w-1 bg-[#3DF56B]/50"
                    : "w-1 bg-zinc-800"
                }`}
              />
            ))}
          </div>
        </motion.div>

        {/* Question */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-12 text-center"
        >
          <h1 className="text-4xl md:text-5xl font-serif italic font-medium text-white mb-3">
            {currentQ.question}
          </h1>
          <p className="text-zinc-400 text-lg">{currentQ.subtitle}</p>
        </motion.div>

        {/* Options */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-4 mb-12"
        >
          {currentQ.options.map((option, idx) => (
            <motion.div
              key={option}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.1 }}
            >
              <button
                onClick={() => currentQ.setValue(option)}
                className={`relative w-full p-6 rounded-xl transition-all duration-300 text-lg font-semibold ${
                  currentQ.value === option
                    ? "bg-white text-black border border-white scale-[1.02]"
                    : "bg-black text-zinc-400 border border-zinc-800 hover:text-white hover:border-zinc-700"
                }`}
              >
                {option}
              </button>
            </motion.div>
          ))}
        </motion.div>

        {/* Navigation Buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex gap-3 items-center justify-center"
        >
          {currentQuestion > 0 && (
            <button
              onClick={() => setCurrentQuestion(currentQuestion - 1)}
              className="relative h-14 w-14 rounded-xl transition-all duration-300 overflow-hidden group hover:scale-110 active:scale-95 flex items-center justify-center"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              <ChevronRight className="w-6 h-6 text-white rotate-180" />
            </button>
          )}
          <button
            onClick={async () => {
              if (isLastQuestion) {
                // Store preferences in localStorage
                localStorage.setItem(
                  "lapetus_preferences",
                  JSON.stringify({
                    yearsPlaying,
                    favoriteVersion,
                    playStyle,
                    favoriteMode,
                  })
                );
                
                // Check if user has a valid session before proceeding
                const { authManager } = await import("@/lib/auth");
                const session = authManager.getCurrentSession();
                
                if (!session) {
                  // No session, go to auth
                  setCurrentStep("auth");
                } else {
                  // Has session, check if account still exists
                  const accounts = await launcher.getAccounts();
                  const accountExists = accounts.some(acc => 
                    session.isOffline 
                      ? acc.username === session.username && acc.is_offline
                      : acc.uuid === session.minecraftUuid
                  );
                  
                  if (accountExists) {
                    // Account exists, go to profile
                    const account = accounts.find(acc => 
                      session.isOffline 
                        ? acc.username === session.username && acc.is_offline
                        : acc.uuid === session.minecraftUuid
                    );
                    setLoggedInAccount(account || null);
                    setCurrentStep("profile");
                  } else {
                    // Account doesn't exist, logout and go to auth
                    await authManager.logout();
                    setCurrentStep("auth");
                  }
                }
              } else {
                setCurrentQuestion(currentQuestion + 1);
              }
            }}
            disabled={!currentQ.value}
            className="relative h-14 w-14 rounded-xl transition-all duration-300 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            style={{
              background: "white",
            }}
          >
            <ChevronRight className="w-6 h-6 text-black" />
          </button>
        </motion.div>
      </motion.div>
    );
  };

  // Profile customization step
  const renderProfileStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-lg text-center"
    >
      {/* Title */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
        <h1 className="text-5xl md:text-6xl font-serif italic font-medium leading-tight tracking-tight">
          <span className="text-white block">Welcome,</span>
          <span className="block pb-2 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
            {loggedInAccount?.username}
          </span>
        </h1>
      </motion.div>

      {/* Skin Preview */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col items-center mb-8"
      >
        {loggedInAccount && !loggedInAccount.is_offline ? (
          <img 
            src={`https://mc-heads.net/body/${loggedInAccount.uuid}/200`}
            alt={loggedInAccount.username}
            className="h-52"
          />
        ) : (
          <img 
            src="https://mc-heads.net/body/MHF_Steve/200"
            alt="Steve"
            className="h-52"
          />
        )}
      </motion.div>

      {/* Continue Button */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <button
          onClick={async () => {
            // Register user in Supabase for friends system
            if (loggedInAccount) {
              await registerUserInSupabase(loggedInAccount);
            }
            onComplete();
          }}
          className="w-full h-14 bg-white hover:bg-zinc-200 text-black font-bold text-lg rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5" />
          Start Playing
        </button>
        <button
          onClick={() => { setCurrentStep("auth"); setLoggedInAccount(null); setIsAuthenticating(false); }}
          className="relative w-full mt-3 h-12 rounded-2xl transition-all duration-300 overflow-hidden group hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <span className="relative z-10 text-white font-medium">Different account</span>
        </button>
      </motion.div>
    </motion.div>
  );

  // Auth step
  const renderAuthStep = () => (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-md text-center">
      {/* Title */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-12">
        <h1 className="text-5xl md:text-6xl font-serif italic font-medium text-white leading-tight tracking-tight">
          <span className="block">Start Your</span>
          <span className="block pb-2 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
            Adventure
          </span>
        </h1>
      </motion.div>

      {/* Single Microsoft Login - No mode selection */}
      {authMode === "select" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="space-y-4">
          {/* TrapGaint Card - Token-based cracked accounts */}
          <div className="relative rounded-3xl border border-zinc-800 p-2">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={2}
            />
            <button 
              onClick={() => setAuthMode("dragon")} 
              className="relative w-full p-6 rounded-2xl transition-all duration-300 group text-left overflow-hidden hover:scale-[1.01] active:scale-[0.99] bg-black border border-zinc-800"
            >
              <div className="relative flex items-center gap-4 z-10">
                <img src={starImg} alt="TrapGaint" className="w-12 h-12 object-contain" />
                <div className="flex-1">
                  <h3 className="font-bold text-white text-xl mb-0.5">TrapGaint</h3>
                  <p className="text-sm text-zinc-400">Play offline without Microsoft account</p>
                </div>
                <ChevronRight className="w-6 h-6 text-zinc-500 group-hover:translate-x-1 group-hover:text-white transition-all" />
              </div>
            </button>
          </div>

          {/* Microsoft/Xbox Login Card */}
          <div className="relative rounded-3xl border border-zinc-800 p-2">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={2}
            />
            <button 
              onClick={() => setAuthMode("online")} 
              className="relative w-full p-6 rounded-2xl transition-all duration-300 group text-left overflow-hidden hover:scale-[1.01] active:scale-[0.99] bg-black border border-zinc-800"
            >
              <div className="relative flex items-center gap-4 z-10">
                <img src={vanillaLogo} alt="Minecraft" className="w-12 h-12 object-contain" />
                <div className="flex-1">
                  <h3 className="font-bold text-white text-xl mb-0.5">Sign in with Xbox</h3>
                  <p className="text-sm text-zinc-400">We'll automatically detect your Minecraft</p>
                </div>
                <ChevronRight className="w-6 h-6 text-zinc-500 group-hover:translate-x-1 group-hover:text-white transition-all" />
              </div>
            </button>
          </div>
        </motion.div>
      )}

      {/* Online Login */}
      {authMode === "online" && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          {/* Show saved online accounts - deduplicated by username */}
          {(() => {
            const onlineAccounts = existingAccounts.filter(a => !a.is_offline);
            // Deduplicate by username (keep first occurrence)
            const uniqueOnlineAccounts = onlineAccounts.filter((account, index, self) => 
              index === self.findIndex(a => a.username === account.username)
            );
            if (uniqueOnlineAccounts.length > 0) {
              return (
                <div className="space-y-3 mb-6">
                  <p className="text-zinc-400 text-sm">Saved accounts</p>
                  {uniqueOnlineAccounts.map((account) => (
                    <div key={account.uuid} className="relative rounded-2xl border border-zinc-800 p-2">
                      <GlowingEffect
                        spread={40}
                        glow={true}
                        disabled={false}
                        proximity={64}
                        inactiveZone={0.01}
                        borderWidth={2}
                      />
                      <button
                        onClick={() => handleQuickLogin(account)}
                        disabled={isAuthenticating}
                        className="relative w-full p-4 rounded-xl transition-all duration-300 group text-left flex items-center gap-4 hover:scale-[1.01] active:scale-[0.99] bg-black border border-zinc-800"
                      >
                        <img src={`https://mc-heads.net/avatar/${account.uuid}/44`} alt={account.username} className="w-11 h-11 rounded-xl" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-lg">{account.username}</p>
                          <p className="text-sm text-zinc-400">Microsoft Account</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:translate-x-1 group-hover:text-white transition-all" />
                      </button>
                    </div>
                  ))}
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center"><div className="w-full" /></div>
                    <div className="relative flex justify-center"><span className="px-4 text-sm text-zinc-500 bg-black">or add new account</span></div>
                  </div>
                </div>
              );
            }
            return null;
          })()}
          
          <img src={microsoftLogo} alt="Microsoft" className="w-20 h-20 mx-auto rounded-2xl object-cover" />
          <div className="text-center">
            <h3 className="text-2xl font-serif italic font-medium text-white mb-2">Microsoft Login</h3>
            <p className="text-zinc-400">A secure window will open for sign-in</p>
          </div>
          {!isAuthenticating ? (
            <Button onClick={handleOnlineLogin} className="w-full h-14 bg-white hover:bg-zinc-200 text-black font-bold text-lg rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]">
              Continue with Microsoft
            </Button>
          ) : (
            <div className="py-8">
              <div className="relative w-14 h-14 mx-auto mb-4">
                <div className="absolute inset-0 bg-[#3DF56B]/20 rounded-full animate-ping" />
                <div className="relative w-full h-full bg-[#3DF56B]/10 rounded-full flex items-center justify-center border border-[#3DF56B]/30">
                  <Loader2 className="w-7 h-7 animate-spin text-[#3DF56B]" />
                </div>
              </div>
              <p className="text-white font-medium">Waiting for login...</p>
            </div>
          )}
          {authError && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl"><p className="text-sm text-red-400">{authError}</p></div>}
          <button onClick={() => { setAuthMode("select"); setAuthError(""); setIsAuthenticating(false); }} 
            className="relative w-full h-12 rounded-2xl transition-all duration-300 overflow-hidden group hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <span className="relative z-10 text-white font-medium">Back to categories</span>
          </button>
        </motion.div>
      )}

      {/* Offline Login */}
      {authMode === "offline" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full flex items-center justify-center" style={{ pointerEvents: 'auto' }}>
          {(() => {
            const offlineAccounts = existingAccounts.filter(a => a.is_offline);
            const uniqueOfflineAccounts = offlineAccounts.filter((account, index, self) => 
              index === self.findIndex(a => a.username === account.username)
            );
            const hasAccounts = uniqueOfflineAccounts.length > 0;
            
            // If no accounts and not showing create form, show create form automatically
            if (!hasAccounts && !showCreateOffline) {
              // Auto-show create form when no accounts exist
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    x: shakeError ? [0, -10, 10, -10, 10, 0] : 0
                  }} 
                  transition={{ 
                    opacity: { delay: 0.1 },
                    y: { delay: 0.1 },
                    x: { duration: 0.5 }
                  }} 
                  className="w-96 mx-auto"
                >
                  <div className="mb-8 text-center">
                    <h3 className="text-4xl font-serif italic font-medium text-white mb-2">Login or Sign Up</h3>
                    <p className="text-zinc-400 text-sm">Enter your username and password</p>
                  </div>

                  <div className="space-y-4 mb-8">
                    <AnimatedInput 
                      value={offlineUsername} 
                      onChange={(e) => setOfflineUsername(e.target.value)} 
                      placeholder="Username" 
                      maxLength={16}
                      className="h-14 text-base font-medium bg-black border-zinc-800"
                      autoFocus 
                    />
                  </div>

                  <Button 
                    onClick={handleOfflineLogin} 
                    disabled={isAuthenticating || !offlineUsername.trim() || offlineUsername.length < 3}
                    className="w-full h-14 bg-white hover:bg-zinc-200 text-black font-bold text-lg rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isAuthenticating ? <Loader2 className="w-6 h-6 animate-spin" /> : "Continue"}
                  </Button>
                  
                  {authError && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl"
                    >
                      <p className="text-sm text-red-400">{authError}</p>
                    </motion.div>
                  )}
                  
                  <p className="text-xs text-zinc-500 text-center mt-4">
                    New user? Account will be created automatically
                  </p>
                  
                  <button 
                    onClick={() => { 
                      setAuthMode("select"); 
                      setShowCreateOffline(false); 
                      setOfflineUsername(""); 
                      setAuthError(""); 
                    }} 
                    className="relative w-full mt-3 h-12 rounded-2xl transition-all duration-300 overflow-hidden group hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <span className="relative z-10 text-white font-medium">Back</span>
                  </button>
                </motion.div>
              );
            }
            
            // If showing create form
            if (showCreateOffline) {
              return (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="w-96 mx-auto">
                  <div className="mb-8 text-center">
                    <h3 className="text-4xl font-serif italic font-medium text-white mb-2">Create Account</h3>
                    <p className="text-zinc-400 text-sm">Enter your username</p>
                  </div>

                  <div className="space-y-4 mb-8">
                    <AnimatedInput 
                      value={offlineUsername} 
                      onChange={(e) => setOfflineUsername(e.target.value)} 
                      placeholder="Username" 
                      maxLength={16}
                      className="h-14 text-base font-medium bg-black border-zinc-800"
                      autoFocus 
                    />
                  </div>

                  <Button 
                    onClick={handleOfflineLogin} 
                    disabled={isAuthenticating || !offlineUsername.trim() || offlineUsername.length < 3}
                    className="w-full h-14 bg-white hover:bg-zinc-200 text-black font-bold text-lg rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isAuthenticating ? <Loader2 className="w-6 h-6 animate-spin" /> : "Continue"}
                  </Button>
                  
                  {authError && <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl"><p className="text-sm text-red-400">{authError}</p></div>}
                  
                  <p className="text-xs text-zinc-500 text-center mt-4">
                    New user? Account will be created automatically
                  </p>
                  
                  <button 
                    onClick={() => { 
                      setAuthMode("select");
                      setShowCreateOffline(false); 
                      setOfflineUsername(""); 
                      setAuthError(""); 
                    }} 
                    className="relative w-full mt-3 h-12 rounded-2xl transition-all duration-300 overflow-hidden group hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <span className="relative z-10 text-white font-medium">Back</span>
                  </button>
                </motion.div>
              );
            }
            
            // Show saved accounts list (accounts exist, not showing create form)
            return (
              <div className="w-full max-w-md text-center">
                {/* Create Account button - on top */}
                <button 
                  onClick={() => setShowCreateOffline(true)} 
                  className="relative w-full p-4 rounded-2xl transition-all duration-300 group text-left flex items-center gap-4 hover:scale-[1.01] active:scale-[0.99] bg-black border border-zinc-800 mb-4 cursor-pointer"
                  style={{ pointerEvents: 'auto', zIndex: 9999 }}
                >
                  <Plus className="w-11 h-11 text-zinc-400 group-hover:text-white transition-colors" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-lg">Create Account</p>
                    <p className="text-sm text-zinc-400">Enter your username</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:translate-x-1 group-hover:text-white transition-all" />
                </button>
                
                {/* Accounts container - max 2 visible, no scroll */}
                <div className="space-y-3 mb-4">
                  {uniqueOfflineAccounts.slice(0, 2).map((account) => (
                    <button
                      key={account.uuid}
                      onClick={() => handleQuickLogin(account)}
                      disabled={isAuthenticating}
                      className="relative w-full p-4 rounded-2xl transition-all duration-300 group text-left flex items-center gap-4 hover:scale-[1.01] active:scale-[0.99] bg-black border border-zinc-800 cursor-pointer"
                      style={{ pointerEvents: 'auto', zIndex: 9999 }}
                    >
                      <img 
                        src={`https://mc-heads.net/avatar/${account.skin_username || account.username}/44`} 
                        alt={account.username} 
                        className="w-11 h-11 rounded-xl" 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-lg">{account.username}</p>
                        <p className="text-sm text-zinc-400">Offline Mode</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-500 group-hover:translate-x-1 group-hover:text-white transition-all" />
                    </button>
                  ))}
                  {uniqueOfflineAccounts.length > 2 && (
                    <p className="text-xs text-zinc-500 text-center">+{uniqueOfflineAccounts.length - 2} more accounts</p>
                  )}
                </div>
                
                <button onClick={() => { setAuthMode("select"); setShowCreateOffline(false); setOfflineUsername(""); setAuthError(""); }} 
                  className="relative w-full h-12 rounded-2xl transition-all duration-300 overflow-hidden group hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <span className="relative z-10 text-white font-medium">Back</span>
                </button>
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* Dragon Auth Login */}
      {authMode === "dragon" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="w-96 mx-auto">
          <div className="mb-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <img src={starImg} alt="TrapGaint" className="w-20 h-20 object-contain" />
            </div>
            <h3 className="text-4xl font-serif italic font-medium text-white mb-2">TrapGaint</h3>
            <p className="text-zinc-400 text-sm">Play Minecraft without a Microsoft account</p>
          </div>

          <div className="space-y-4 mb-8">
            <AnimatedInput 
              value={offlineUsername} 
              onChange={(e) => {
                setOfflineUsername(e.target.value);
                setAuthError("");
              }}
              placeholder="Username" 
              maxLength={16}
              className="h-14 text-base font-medium bg-black border-zinc-800"
              autoFocus 
            />
            {isAuthenticating && (
              <div className="flex items-center justify-center gap-2 text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Creating account...</span>
              </div>
            )}
          </div>
          
          {authError && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl"
            >
              <p className="text-sm text-red-400">{authError}</p>
            </motion.div>
          )}
          
          <button 
            onClick={() => { 
              setAuthMode("select");
              setOfflineUsername(""); 
              setAuthError(""); 
            }} 
            className="relative w-full h-12 rounded-2xl transition-all duration-300 overflow-hidden group hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <span className="relative z-10 text-white font-medium">Back</span>
          </button>
        </motion.div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen relative flex flex-col overflow-hidden bg-black">
      {/* Gradient background image with smooth transition and conditional greyscale filter */}
      <motion.div 
        className={`absolute inset-0 bg-cover bg-center pointer-events-none ${authMode === "dragon" ? "grayscale" : ""}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: showContent ? 1 : 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          backgroundImage: 'url(/image1.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      {/* Color overlay transition */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'linear-gradient(135deg, rgba(20, 30, 48, 0.95) 0%, rgba(36, 59, 85, 0.9) 50%, rgba(20, 30, 48, 0.95) 100%)'
        }}
      />

      {/* Decorative shape - Left side (c1.svg mirrored) */}
      <motion.div
        className="absolute left-0 top-0 w-[500px] h-[600px] opacity-40 pointer-events-none z-10"
        initial={{ opacity: 0, x: -100 }}
        animate={{ opacity: 0.4, x: 0 }}
        transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
      >
        <img src="/c1.svg" alt="" className="w-full h-full" style={{ transform: 'scaleX(-1)' }} />
      </motion.div>

      {/* Decorative shape - Right side (c2.svg) */}
      <motion.div
        className="absolute right-0 top-1/3 w-[500px] h-[500px] opacity-40 pointer-events-none z-10"
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 0.4, x: 0 }}
        transition={{ duration: 2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <img src="/c2.svg" alt="" className="w-full h-full" />
      </motion.div>
      
      {/* Subtle animated particles/stars effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-0.5 h-0.5 bg-white/20 rounded-full"
            initial={{ 
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000), 
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
              opacity: 0 
            }}
            animate={{ 
              y: [null, -100],
              opacity: [0, 0.4, 0]
            }}
            transition={{
              duration: 5 + Math.random() * 5,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "linear"
            }}
          />
        ))}
      </div>
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-8" style={{ pointerEvents: 'auto' }}>
        <AnimatePresence mode="wait">
          {currentStep === "splash" && renderSplashStep()}
          {currentStep === "auth" && renderAuthStep()}
          {currentStep === "preferences" && renderPreferencesStep()}
          {currentStep === "profile" && renderProfileStep()}
        </AnimatePresence>
      </div>
      
    </div>
  );
}
