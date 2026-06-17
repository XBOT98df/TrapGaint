// Achievement tracking system
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: 'blue' | 'red' | 'purple' | 'black';
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  maxProgress?: number;
}

// Achievement definitions
export const ACHIEVEMENT_DEFINITIONS: Omit<Achievement, 'unlocked' | 'unlockedAt'>[] = [
  { id: 'first_launch', name: 'First Launch', description: 'Launch the game for the first time', icon: '/star2.svg', color: 'blue' },
  { id: 'mod_master', name: 'Mod Master', description: 'Install 10 mods', icon: '/cube.svg', color: 'red', progress: 0, maxProgress: 10 },
  { id: 'version_explorer', name: 'Version Explorer', description: 'Try 5 different Minecraft versions', icon: '/prism.svg', color: 'purple', progress: 0, maxProgress: 5 },
  { id: 'friend_collector', name: 'Friend Collector', description: 'Add 5 friends', icon: '/nametag.svg', color: 'black', progress: 0, maxProgress: 5 },
  { id: 'modpack_enthusiast', name: 'Modpack Enthusiast', description: 'Install a modpack', icon: '/roll.svg', color: 'blue' },
  { id: 'dragon_rider', name: 'Dragon Rider', description: 'Use Dragon launcher for 7 days', icon: '/dragoncoin.svg', color: 'red', progress: 0, maxProgress: 7 },
  { id: 'forge_master', name: 'Forge Master', description: 'Install Forge', icon: '/spring.svg', color: 'purple' },
  { id: 'fabric_weaver', name: 'Fabric Weaver', description: 'Install Fabric', icon: '/donut.svg', color: 'black' },
  { id: 'server_host', name: 'Server Host', description: 'Host your first server', icon: '/globe.svg', color: 'blue' },
  { id: 'night_owl', name: 'Night Owl', description: 'Play at 3 AM', icon: '/c1.svg', color: 'red' },
  { id: 'early_bird', name: 'Early Bird', description: 'Play at 6 AM', icon: '/c2.svg', color: 'purple' },
  { id: 'marathon_player', name: 'Marathon Player', description: 'Play for 5 hours straight', icon: '/c3.svg', color: 'black', progress: 0, maxProgress: 300 }, // 300 minutes
  { id: 'world_traveler', name: 'World Traveler', description: 'Join 10 different servers', icon: '/c4.svg', color: 'blue', progress: 0, maxProgress: 10 },
  { id: 'customization_king', name: 'Customization King', description: 'Install 3 resource packs', icon: '/c6.svg', color: 'red', progress: 0, maxProgress: 3 },
  { id: 'shader_master', name: 'Shader Master', description: 'Install shaders for the first time', icon: '/coursor.svg', color: 'purple' },
  { id: 'community_builder', name: 'Community Builder', description: 'Add 10 friends to your network', icon: '/cylinder.svg', color: 'black', progress: 0, maxProgress: 10 },
  { id: 'version_veteran', name: 'Version Veteran', description: 'Play on 10 different versions', icon: '/oval.svg', color: 'blue', progress: 0, maxProgress: 10 },
  { id: 'mod_collector', name: 'Mod Collector', description: 'Install 25 mods', icon: '/icons12.svg', color: 'red', progress: 0, maxProgress: 25 },
  { id: 'launcher_legend', name: 'Launcher Legend', description: 'Use the launcher for 30 days', icon: '/star2.svg', color: 'purple', progress: 0, maxProgress: 30 },
  { id: 'profile_pro', name: 'Profile Pro', description: 'Create 5 different profiles', icon: '/cube.svg', color: 'black', progress: 0, maxProgress: 5 },
  { id: 'snapshot_explorer', name: 'Snapshot Explorer', description: 'Try a snapshot version', icon: '/prism.svg', color: 'blue' },
  { id: 'beta_tester', name: 'Beta Tester', description: 'Play on a beta version', icon: '/roll.svg', color: 'red' },
  { id: 'speed_runner', name: 'Speed Runner', description: 'Launch a game in under 10 seconds', icon: '/c7.svg', color: 'purple' },
  { id: 'resource_hoarder', name: 'Resource Hoarder', description: 'Install 5 resource packs', icon: '/c8.svg', color: 'black', progress: 0, maxProgress: 5 },
  { id: 'multiplayer_master', name: 'Multiplayer Master', description: 'Join 25 different servers', icon: '/c9.svg', color: 'blue', progress: 0, maxProgress: 25 },
  { id: 'ultimate_collector', name: 'Ultimate Collector', description: 'Install 50 mods', icon: '/c10.svg', color: 'red', progress: 0, maxProgress: 50 },
];

const STORAGE_KEY = 'lapetus_achievements';
const ACHIEVEMENTS_VERSION = '2.4'; // Increment this when changing achievement definitions
const VERSION_KEY = 'lapetus_achievements_version';

// Load achievements from localStorage
export function loadAchievements(): Achievement[] {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    // Return default achievements if not in browser
    return ACHIEVEMENT_DEFINITIONS.map(def => ({
      ...def,
      unlocked: false,
      progress: def.progress,
    }));
  }
  
  try {
    // Check version - if mismatch, reset achievements to get new definitions
    const storedVersion = localStorage.getItem(VERSION_KEY);
    if (storedVersion !== ACHIEVEMENTS_VERSION) {
      console.log('Achievement definitions updated, resetting...');
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, ACHIEVEMENTS_VERSION);
    }
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const savedAchievements = JSON.parse(stored);
      // Merge with definitions to ensure new achievements are added
      return ACHIEVEMENT_DEFINITIONS.map(def => {
        const saved = savedAchievements.find((a: Achievement) => a.id === def.id);
        return {
          ...def,
          unlocked: saved?.unlocked || false,
          unlockedAt: saved?.unlockedAt,
          progress: saved?.progress ?? def.progress,
        };
      });
    }
  } catch (error) {
    console.error('Failed to load achievements:', error);
  }
  
  // Return default achievements
  return ACHIEVEMENT_DEFINITIONS.map(def => ({
    ...def,
    unlocked: false,
    progress: def.progress,
  }));
}

// Save achievements to localStorage
export function saveAchievements(achievements: Achievement[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(achievements));
  } catch (error) {
    console.error('Failed to save achievements:', error);
  }
}

// Achievement unlock callback
let achievementUnlockCallback: ((achievement: Achievement) => void) | null = null;

export function setAchievementUnlockCallback(callback: (achievement: Achievement) => void) {
  achievementUnlockCallback = callback;
}

// Unlock an achievement
export function unlockAchievement(achievementId: string): Achievement[] {
  const achievements = loadAchievements();
  const achievement = achievements.find(a => a.id === achievementId);
  
  if (achievement && !achievement.unlocked) {
    achievement.unlocked = true;
    achievement.unlockedAt = new Date().toISOString();
    saveAchievements(achievements);
    
    // Show notification (optional)
    console.log(`🏆 Achievement Unlocked: ${achievement.name}`);
    
    // Trigger callback for animation
    if (achievementUnlockCallback) {
      achievementUnlockCallback(achievement);
    }
  }
  
  return achievements;
}

// Update achievement progress
export function updateAchievementProgress(achievementId: string, progress: number): Achievement[] {
  const achievements = loadAchievements();
  const achievement = achievements.find(a => a.id === achievementId);
  
  if (achievement && achievement.maxProgress && !achievement.unlocked) {
    achievement.progress = Math.min(progress, achievement.maxProgress);
    
    // Auto-unlock if progress reaches max
    if (achievement.progress >= achievement.maxProgress) {
      achievement.unlocked = true;
      achievement.unlockedAt = new Date().toISOString();
      console.log(`🏆 Achievement Unlocked: ${achievement.name}`);
      
      // Trigger callback for animation
      if (achievementUnlockCallback) {
        achievementUnlockCallback(achievement);
      }
    }
    
    saveAchievements(achievements);
  }
  
  return achievements;
}

// Increment achievement progress
export function incrementAchievementProgress(achievementId: string, amount: number = 1): Achievement[] {
  const achievements = loadAchievements();
  const achievement = achievements.find(a => a.id === achievementId);
  
  if (achievement && achievement.maxProgress && !achievement.unlocked) {
    const newProgress = (achievement.progress || 0) + amount;
    return updateAchievementProgress(achievementId, newProgress);
  }
  
  return achievements;
}

// Track unique versions played
export function trackVersionPlayed(version: string): void {
  const key = 'lapetus_versions_played';
  try {
    const stored = localStorage.getItem(key);
    const versions = stored ? JSON.parse(stored) : [];
    
    if (!versions.includes(version)) {
      versions.push(version);
      localStorage.setItem(key, JSON.stringify(versions));
      updateAchievementProgress('version_explorer', versions.length);
    }
  } catch (error) {
    console.error('Failed to track version:', error);
  }
}

// Track daily usage
export function trackDailyUsage(): void {
  const key = 'lapetus_usage_days';
  try {
    const today = new Date().toDateString();
    const stored = localStorage.getItem(key);
    const days = stored ? JSON.parse(stored) : [];
    
    if (!days.includes(today)) {
      days.push(today);
      localStorage.setItem(key, JSON.stringify(days));
      updateAchievementProgress('dragon_rider', days.length);
    }
  } catch (error) {
    console.error('Failed to track daily usage:', error);
  }
}

// Check time-based achievements
export function checkTimeBasedAchievements(): void {
  const hour = new Date().getHours();
  
  // Night Owl (3 AM)
  if (hour === 3) {
    unlockAchievement('night_owl');
  }
  
  // Early Bird (6 AM)
  if (hour === 6) {
    unlockAchievement('early_bird');
  }
}

// Track game session time
let sessionStartTime: number | null = null;

export function startGameSession(): void {
  sessionStartTime = Date.now();
}

export function endGameSession(): void {
  if (sessionStartTime) {
    const duration = Math.floor((Date.now() - sessionStartTime) / 60000); // minutes
    const achievements = loadAchievements();
    const marathonAchievement = achievements.find(a => a.id === 'marathon_player');
    
    if (marathonAchievement && !marathonAchievement.unlocked && duration >= 300) {
      unlockAchievement('marathon_player');
    }
    
    sessionStartTime = null;
  }
}
