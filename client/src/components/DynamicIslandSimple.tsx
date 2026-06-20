import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Download, AlertCircle, Play, Cloud, CloudRain, CloudSnow, Sun } from 'lucide-react';

let currentSpeechAudio: HTMLAudioElement | null = null;

// Simple TTS function using Deepgram with optimized settings
export const speak = async (text: string): Promise<boolean> => {
  const DEEPGRAM_API_KEY = '34dac7d8b09241a1bc361f617f8804eab7b39d68';
  
  console.log('[TTS] Starting speech:', text);
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-iris-en&encoding=linear16&sample_rate=24000', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'text/plain',
      },
      body: text,
    });

    if (!response.ok) {
      console.error('[TTS] API failed:', response.statusText);
      return false;
    }

    const fetchTime = Date.now() - startTime;
    console.log('[TTS] Audio fetched in', fetchTime, 'ms');

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    if (currentSpeechAudio) {
      currentSpeechAudio.pause();
      currentSpeechAudio.currentTime = 0;
      currentSpeechAudio = null;
    }

    const audio = new Audio(audioUrl);
    currentSpeechAudio = audio;
    
    // Preload the audio
    audio.preload = 'auto';
    
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      const totalTime = Date.now() - startTime;
      console.log('[TTS] Completed in', totalTime, 'ms');
      if (currentSpeechAudio === audio) {
        currentSpeechAudio = null;
      }
    };
    
    audio.onerror = (e) => {
      console.error('[TTS] Playback error:', e);
      URL.revokeObjectURL(audioUrl);
      if (currentSpeechAudio === audio) {
        currentSpeechAudio = null;
      }
    };
    
    // Play immediately
    await audio.play();
    console.log('[TTS] Playing audio');
    return true;
  } catch (error) {
    console.error('[TTS] Error:', error);
    return false;
  }
};

export interface DynamicIslandState {
  id: string;
  type: 'download' | 'launch' | 'notification' | 'status' | 'achievement';
  title: string;
  subtitle?: string;
  progress?: number;
  icon?: React.ReactNode;
  color?: 'default' | 'success' | 'warning' | 'error';
  duration?: number;
  persistent?: boolean;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }>;
  achievementData?: {
    name: string;
    description: string;
    icon: string;
  };
}

interface DynamicIslandProps {
  states: DynamicIslandState[];
  onDismiss: (id: string) => void;
  lastLaunched?: {
    loader: 'vanilla' | 'forge' | 'fabric' | 'quilt' | 'dragon';
    logo: string;
  };
  username?: string;
}

// Build a real-time mc-heads.net head URL with a cache-busting
// revision so skin swaps always show the new head immediately.
function mcHeadUrl(name: string, revision: number, size = 64): string {
  const base = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size}`;
  return `${base}?v=${revision}`;
}

export default function DynamicIsland({ states, onDismiss, lastLaunched, username }: DynamicIslandProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const currentState = states[0];

  // Bump when the skin changes (via the accountUpdated event or storage
  // changes) so the <img> re-mounts and the mc-heads.net URL gets a
  // fresh cache-busting query — the head updates in real time.
  const [skinRevision, setSkinRevision] = useState(0);
  useEffect(() => {
    const bump = () => setSkinRevision((r) => r + 1);
    window.addEventListener("accountUpdated", bump);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "dragon_current_account") bump();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("accountUpdated", bump);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Weather and date state
  const [temperature, setTemperature] = useState<number | null>(null);
  const [weatherCondition, setWeatherCondition] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');

  // Fetch weather data
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const geoResponse = await fetch('https://ipapi.co/json/');
        const geoData = await geoResponse.json();

        const weatherResponse = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${geoData.latitude}&longitude=${geoData.longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
        );
        const weatherData = await weatherResponse.json();

        setTemperature(Math.round(weatherData.current.temperature_2m));

        const weatherCode = weatherData.current.weather_code;
        if (weatherCode === 0) setWeatherCondition('clear');
        else if (weatherCode <= 3) setWeatherCondition('cloudy');
        else if (weatherCode <= 67) setWeatherCondition('rainy');
        else if (weatherCode <= 77) setWeatherCondition('snowy');
        else setWeatherCondition('cloudy');
      } catch (error) {
        setTemperature(72);
        setWeatherCondition('clear');
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Update date and time
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
      const timeStr = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      setCurrentDate(dateStr);
      setCurrentTime(timeStr);
    };
    
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);
  
  const getWeatherIcon = () => {
    switch (weatherCondition) {
      case 'clear': return <Sun className="w-6 h-6" />;
      case 'cloudy': return <Cloud className="w-6 h-6" />;
      case 'rainy': return <CloudRain className="w-6 h-6" />;
      case 'snowy': return <CloudSnow className="w-6 h-6" />;
      default: return <Cloud className="w-6 h-6" />;
    }
  };

  useEffect(() => {
    if (currentState && !currentState.persistent && currentState.duration) {
      const timer = setTimeout(() => {
        onDismiss(currentState.id);
      }, currentState.duration);
      return () => clearTimeout(timer);
    }
  }, [currentState, onDismiss]);

  const getDefaultIcon = (type: string) => {
    switch (type) {
      case 'download':
        return <Download className="w-4 h-4" />;
      case 'launch':
        return <Play className="w-4 h-4" />;
      case 'notification':
        return <AlertCircle className="w-4 h-4" />;
      case 'achievement':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  // Special handling for achievement notifications - show as minimal first, then expand on hover
  const isAchievement = currentState?.type === 'achievement';
  const stage = isAchievement 
    ? (isHovered ? 'achievement-expanded' : 'achievement-minimal')
    : !currentState 
    ? (isClicked ? 'expanded-idle' : isHovered ? 'medium-idle' : 'compact')
    : (isClicked ? 'expanded' : isHovered ? 'medium' : 'minimal');

  return (
    <div className="relative z-[9999]">
      <motion.div
        className="relative overflow-hidden backdrop-blur-2xl bg-white border border-gray-200/50 shadow-2xl shadow-black/20 cursor-pointer"
        style={{
          background: '#ffffff',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        onClick={() => setIsClicked(!isClicked)}
        animate={{
          borderRadius: (stage === 'expanded' || stage === 'expanded-idle' || stage === 'achievement-expanded') ? '50px' : 
                       (stage === 'medium' || stage === 'medium-idle' || stage === 'achievement-minimal') ? '40px' : '100px',
          width: stage === 'compact' ? '120px' : 
                 stage === 'minimal' ? '240px' :
                 stage === 'medium' ? '280px' :
                 stage === 'medium-idle' ? '260px' :
                 stage === 'expanded-idle' ? '320px' : '360px',
          height: stage === 'compact' ? '44px' :
                  stage === 'minimal' ? '44px' :
                  stage === 'medium' ? '80px' :
                  stage === 'medium-idle' ? '80px' :
                  stage === 'achievement-minimal' ? '60px' :
                  stage === 'achievement-expanded' ? '120px' :
                  stage === 'expanded-idle' ? '140px' : '140px',
        }}
        whileHover={{ 
          scale: 1.005,
          boxShadow: "0 30px 60px -15px rgba(0, 0, 0, 0.35)"
        }}
        transition={{ 
          duration: 0.5,
          ease: [0.25, 0.1, 0.25, 1]
        }}
      >
        {/* STAGE 1: COMPACT - Idle state (small pill) */}
        {stage === 'compact' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-between px-3"
          >
            {/* Real-time Minecraft player head. Re-keyed on skinRevision
                so a skin swap re-mounts the image and the cache-busted
                URL fetches the new head instantly. */}
            {username ? (
              <motion.div
                className="flex-shrink-0 w-7 h-7"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <img
                  key={`${username}-${skinRevision}`}
                  src={mcHeadUrl(username, skinRevision, 64)}
                  alt={`${username}'s head`}
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            ) : (
              <motion.div
                className="flex-shrink-0 w-2 h-2 bg-black/20 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
              />
            )}

            <motion.div
              className="flex-shrink-0 w-3 h-3 rounded-full border-2 border-black"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
            />
          </motion.div>
        )}

        {/* STAGE 2: MINIMAL - Notification appears */}
        {stage === 'minimal' && currentState && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 flex items-center gap-3 px-4"
            transition={{ duration: 0.2 }}
          >
            <motion.div 
              className="flex-shrink-0 text-black/90 relative"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
            >
              <div className="absolute inset-0 bg-black/10 rounded-full blur-sm"></div>
              <div className="relative">
                {currentState.icon || getDefaultIcon(currentState.type)}
              </div>
            </motion.div>

            <motion.div 
              className="flex-1 min-w-0"
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              <div className="text-black text-sm font-semibold tracking-tight truncate">
                {currentState.title}
              </div>
            </motion.div>

            {currentState.progress !== undefined && (
              <motion.div 
                className="flex-shrink-0 w-5 h-5 relative"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <svg className="w-5 h-5 transform -rotate-90" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="rgba(0,0,0,0.2)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <motion.circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="rgba(0,0,0,0.8)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 8}`}
                    initial={{ strokeDashoffset: `${2 * Math.PI * 8}` }}
                    animate={{ 
                      strokeDashoffset: `${2 * Math.PI * 8 * (1 - currentState.progress / 100)}` 
                    }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </svg>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* STAGE 3: MEDIUM - Hover state */}
        {stage === 'medium' && currentState && (
          <div className="absolute inset-0 flex items-center gap-4 px-5">
            <div className="flex-shrink-0 w-8 h-8 text-black/90">
              {currentState.icon || getDefaultIcon(currentState.type)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-black text-base font-semibold tracking-tight truncate">
                {currentState.title}
              </div>
              {currentState.subtitle && (
                <div className="text-black/60 text-sm font-medium tracking-tight truncate">
                  {currentState.subtitle}
                </div>
              )}
            </div>

            {currentState.progress !== undefined && (
              <div className="flex-shrink-0 text-black/80 text-sm font-medium">
                {Math.round(currentState.progress)}%
              </div>
            )}
          </div>
        )}

        {/* STAGE 4: MEDIUM-IDLE - Hover over compact */}
        {stage === 'medium-idle' && lastLaunched && (
          <div className="absolute inset-0 flex items-center gap-4 px-5">
            <div className="flex-shrink-0 w-8 h-8">
              <img 
                src={lastLaunched.logo} 
                alt={lastLaunched.loader}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex-1">
              <div className="text-black text-base font-semibold tracking-tight capitalize">
                {lastLaunched.loader}
              </div>
              <div className="text-black/60 text-sm font-medium tracking-tight">
                Last Launched
              </div>
            </div>

            <div className="flex-shrink-0 w-4 h-4 rounded-full border-2 border-black" />
          </div>
        )}

        {/* STAGE 5: EXPANDED - Full details */}
        {stage === 'expanded' && currentState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col justify-center px-6"
          >
            <div className="flex items-start gap-3 mb-3">
              <motion.div 
                className="flex-shrink-0 text-black/90 relative"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="absolute inset-0 bg-black/10 rounded-full blur-md"></div>
                <div className="relative">
                  {currentState.icon || getDefaultIcon(currentState.type)}
                </div>
              </motion.div>

              <div className="flex-1 min-w-0">
                <motion.div 
                  className="text-black text-base font-bold tracking-tight"
                  initial={{ y: -5, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  {currentState.title}
                </motion.div>
                {currentState.subtitle && (
                  <motion.div 
                    className="text-black/60 text-sm font-medium tracking-tight mt-1"
                    initial={{ y: -5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    {currentState.subtitle}
                  </motion.div>
                )}
              </div>

              {!currentState.persistent && (
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(currentState.id);
                  }}
                  className="flex-shrink-0 p-1.5 text-black/50 hover:text-black/80 transition-colors rounded-full hover:bg-black/10"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}
            </div>

            {currentState.progress !== undefined && (
              <motion.div 
                className="space-y-2 mb-3"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex justify-between text-xs text-black/60">
                  <span>Progress</span>
                  <span className="font-medium">{Math.round(currentState.progress)}%</span>
                </div>
                <div className="w-full bg-black/20 rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="bg-gradient-to-r from-black to-black/80 rounded-full h-2"
                    initial={{ width: 0 }}
                    animate={{ width: `${currentState.progress}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            )}

            {currentState.actions && currentState.actions.length > 0 && (
              <motion.div 
                className="flex gap-2"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25 }}
              >
                {currentState.actions.map((action, index) => (
                  <motion.button
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick();
                    }}
                    className={`
                      flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                      ${action.variant === 'primary'
                        ? 'bg-black text-white hover:bg-black/80 shadow-lg'
                        : 'bg-black/10 text-black hover:bg-black/20'
                      }
                    `}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                  >
                    {action.label}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* STAGE 6: EXPANDED-IDLE - Click state showing weather and date */}
        {stage === 'expanded-idle' && lastLaunched && (
          <div className="absolute inset-0 flex items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <div className="text-black/80">
                {getWeatherIcon()}
              </div>
              <div>
                <div className="text-black text-3xl font-semibold">
                  {temperature !== null ? `${temperature}°` : '--°'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-black/60 text-xs font-medium">
                    {temperature !== null ? `${Math.round((temperature - 32) * 5/9)}°C` : '--°C'}
                  </span>
                  <span className="text-black/40 text-xs">•</span>
                  <span className="text-black/60 text-xs font-medium">
                    {temperature !== null ? `${temperature}°F` : '--°F'}
                  </span>
                  <span className="text-black/40 text-xs">•</span>
                  <span className="text-black/60 text-xs font-medium">
                    {temperature !== null ? `${Math.round((temperature - 32) * 5/9 + 273.15)}K` : '--K'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-black text-base font-semibold">
                {currentDate}
              </div>
              <div className="text-black/60 text-sm font-medium">
                {currentTime}
              </div>
            </div>
          </div>
        )}

        {/* STAGE 7: ACHIEVEMENT-MINIMAL - Small capsule showing "Achievement Unlocked!" */}
        {stage === 'achievement-minimal' && currentState?.achievementData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 flex items-center gap-3 px-4"
          >
            {/* Small Achievement Icon */}
            <motion.div
              className="flex-shrink-0 w-8 h-8 relative"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-lg blur-md"></div>
              <img 
                src={currentState.achievementData.icon} 
                alt="Achievement"
                className="relative w-full h-full object-contain"
              />
            </motion.div>

            {/* "Achievement Unlocked!" text */}
            <motion.div 
              className="flex-1 min-w-0"
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <div className="text-black text-sm font-bold tracking-tight">
                Achievement Unlocked!
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* STAGE 8: ACHIEVEMENT-EXPANDED - Large capsule with full achievement details on hover */}
        {stage === 'achievement-expanded' && currentState?.achievementData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 flex items-center gap-4 px-6"
          >
            {/* Large Achievement Icon */}
            <motion.div
              className="flex-shrink-0 w-16 h-16 relative"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-2xl blur-lg"></div>
              <img 
                src={currentState.achievementData.icon} 
                alt={currentState.achievementData.name}
                className="relative w-full h-full object-contain"
              />
            </motion.div>

            {/* Achievement Info */}
            <div className="flex-1 min-w-0">
              <motion.div 
                className="text-black text-base font-semibold tracking-tight"
                initial={{ y: -5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                {currentState.achievementData.name}
              </motion.div>
              <motion.div 
                className="text-black/60 text-sm font-medium tracking-tight mt-0.5"
                initial={{ y: -5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 }}
              >
                {currentState.achievementData.description}
              </motion.div>
            </div>
          </motion.div>
        )}

        {(stage === 'compact' || stage === 'minimal') && (
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-black/5 to-transparent pointer-events-none" />
        )}
      </motion.div>
    </div>
  );
}
