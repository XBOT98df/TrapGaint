import { useState, useEffect, useRef, useMemo, useCallback, type WheelEvent as ReactWheelEvent } from "react";
import ReactMarkdown from 'react-markdown';
import { ShiningText } from "@/components/ui/shining-text";
import { initializeCredits, getCredits, hasEnoughCreditsForTokens, fetchCreditsFromSupabase, deductCreditsFromTokens, calculateCreditsFromTokens } from "@/lib/chatCredits";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Play, Download, Settings, Globe, Users, Newspaper, ShoppingBag, Gamepad2, Crown, Star, ArrowLeft, ArrowRight, ChevronDown, Loader2, Terminal, Home, Layers, Server, UserCircle2, Rss, Store, Cog, FolderOpen, Trash2, Plus, X, Package, Map as MapIcon, Earth, Search, ExternalLink, Flame, TrendingUp, Sparkles, Command, Zap, Compass, Cpu, Wand2, LogOut, Wifi, WifiOff, Shield, Palette, UserPlus, Check, XCircle, Edit2, Clock, Phone, PhoneOff, PhoneCall, Mic, MicOff, Calendar, Mouse, RefreshCw, Upload, Cat } from "lucide-react";
import { PiHouseFill, PiGameControllerFill, PiGlobeFill, PiUsersFill, PiNewspaperFill, PiStorefrontFill, PiGearFill, PiPlayFill, PiSwordFill, PiShieldFill, PiCubeFill, PiHeartFill, PiLightningFill, PiRocketLaunchFill, PiCompassFill, PiCpuFill, PiMagicWandFill, PiFlaskFill, PiDownloadSimpleBold } from "react-icons/pi";
import { GiWoodAxe, GiBroadsword, GiChestArmor, GiCrossedSwords, GiDynamite, GiMagicSwirl, GiCog, GiCompass, GiRocket } from "react-icons/gi";
import { motion, AnimatePresence } from "framer-motion";
import { SkinViewer } from "@/components/SkinViewer";
import { SkinGallery } from "@/components/SkinGallery";
import { CapeViewer } from "@/components/CapeViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import DynamicIsland, { speak } from "@/components/DynamicIslandSimple";
import { useDynamicIsland } from "@/hooks/useDynamicIsland";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { launcher, type AuthAccount } from "@/lib/launcher";
import { sessionTracker } from "@/lib/sessionTracker";
import type { VoiceCall, CallState } from "@/lib/voiceChat";
import type { Achievement } from "@/lib/achievements";
import { 
  loadAchievements as loadAchievementsFromStorage,
  trackDailyUsage,
  checkTimeBasedAchievements,
  unlockAchievement,
  trackVersionPlayed,
  startGameSession,
  endGameSession,
  setAchievementUnlockCallback
} from "@/lib/achievements";
import HoverAnimationButton from "@/components/ui/hover-animation-button";
import { ModSpotlight, type ModResult } from "@/components/ui/mod-spotlight";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/ios-spinner";
import ProfilePanel from "@/components/ProfilePanel";
// Xbox Live friends system - Supabase only for user status tracking and pending requests
import { updateUserStatus, sendFriendRequest, getPendingRequests, acceptFriendRequest, getUserProfile, updateUserProfile } from "@/lib/friendsService";
import { supabase } from "@/lib/supabase";
import { StoryViewer, type Story } from "@/components/ui/story-viewer";
import { FriendsSidebar } from "@/components/FriendsSidebar";
import ServerHosting from "./ServerHosting";
import { Oneko } from "@/components/ui/oneko";
import { RedeemCodeDialog } from "@/components/RedeemCodeDialog";
import { useMembership } from "@/hooks/useMembership";
import { AccountDialog } from "@/components/AccountDialog";
import { Button3D } from "@/components/ui/button-3d";
import { ShinyButton } from "@/components/ui/shiny-button";
import { UpdateDialog, CheckForUpdatesButton } from "@/components/UpdateDialog";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { CrashReportDialog } from "@/components/CrashReportDialog";
import { RepairDialog } from "@/components/RepairDialog";
import { FriendSearchSpotlight } from "@/components/ui/friend-search-spotlight";
import { BorderTrail } from "@/components/ui/border-trail";
import { cursorsBase64 } from "@/lib/cursorsBase64";
import AnimatedCardStack from "@/components/ui/animate-card-animation";
import { VersionCard } from "@/components/ui/version-card";
import { NoModsFound } from "@/components/ui/retro-tv-error";
import { FollowerPointerCard } from "@/components/ui/following-pointer";
import AnimatedSwitch from "@/components/ui/animated-switch";
import { FigmaSwitch } from "@/components/ui/figma-switch";
import { LaunchLines } from "@/components/ui/launch-lines";
import { AppleSpotlight } from "@/components/ui/apple-spotlight";
import type { VoiceCommand } from "@/hooks/useVoiceAssistant";
import AnimatedLoadingSkeleton from "@/components/ui/animated-loading-skeleton";
import { SocialAvatar } from "@/components/ui/social-avatar";

import { useOnlineCount, useHeartbeat } from "@/hooks/useOnlineCount";
import { usePerformanceMode } from "@/hooks/usePerformanceMode";

// Supabase configuration for friend notifications
const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";

// Register user in Supabase for friends system
// Import artwork
import heroImage from "@assets/generated_images/image.png";
import purpleImage from "@assets/generated_images/purple.png";
import redImage from "@assets/generated_images/red.png";
import vanillaLogo from "@assets/generated_images/vanilla.png";
import forgeLogo from "@assets/generated_images/forge.png";
import fabricLogo from "@assets/generated_images/fabric.png";
import quiltLogo from "@assets/generated_images/quilt.png";
import dragonLogo from "@assets/NewIcons.svg";
import dragonTitle from "@assets/NewIcons.svg";
import clientsideImg from "@assets/generated_images/clientside.jpg";
import img121 from "@assets/generated_images/1.21.png";
import img261Snapshot from "@assets/generated_images/26.1.jpg";
import img120 from "@assets/generated_images/1.20.png";
import img119 from "@assets/generated_images/1.19.png";
import img118 from "@assets/generated_images/1.18.jpg";
import img117 from "@assets/generated_images/1.17.jpg";

// Import SVG icons
import playNewIcon from "@assets/NewIcons.svg";
import playIcon from "@assets/play.svg";
import nametagIcon from "@assets/icons/icons12.svg";
import versionIcon from "@assets/globe.svg";
import serverHostingIcon from "@assets/prism.svg";
import newsIcon from "@assets/icons/cube.svg";
import friendsIcon from "@assets/icons/c7.svg";
import settingsIcon from "@assets/roll.svg";
import starIcon from "@assets/NewIcons.svg";
import img116 from "@assets/generated_images/1.16.jpg";
import img115 from "@assets/generated_images/1.15.jpeg";
import img114 from "@assets/generated_images/1.14.jpg";
import img113 from "@assets/generated_images/1.13.jpg";
import img112 from "@assets/generated_images/1.12.jpg";
import img111 from "@assets/generated_images/1.10.jpg";
import wallpaperCaves from "@assets/generated_images/wallpaper_minecraft_caves_cliffs_part2_2560x1440.png";
import wallpaperNether from "@assets/generated_images/wallpaper_minecraft_nether_update_2560x1440.png";
import wallpaperWild from "@assets/generated_images/wallpaper_minecraft_wild_update_2560x1440.png";
import img110 from "@assets/generated_images/1.10.jpg";
import img19 from "@assets/generated_images/1.9.jpg";
import img18 from "@assets/generated_images/1.8.png";

// Import wallpapers for random background
import wallFall from "@assets/generated_images/MCV_FallDrop_NetDownloadableWallpaper_2560x1440.png";
import wallHoliday from "@assets/generated_images/MCV_HOL25Drop_MoM_DotNet_Wallpaper_2560x1440.png";
import wallSpring from "@assets/generated_images/MCV_SpringDrop_DotNet_Downloadable_Wallpaper_2560x1440.png";
import wallFallCampaign from "@assets/generated_images/Minecraft_Fall_Drop_Campaign_Key_Art_DotNet_Downloadable_Wallpaper_2560x1440.png";
import wallGarden from "@assets/generated_images/Minecraft_TheGardenAwakens_DotNet_2560x1440.png";

// New loader-specific banners
import forgeBanner from "@assets/forge.jpg";
import quiltBanner from "@assets/Quilt.jpeg";
import wallAdventure from "@assets/generated_images/wallpaper_minecraft_adventure_Adventure_2058x1440.png";
import wallBees from "@assets/generated_images/Minecraft_Bee2_Wallpaper_2560x1440.png";
import wallCatsPandas from "@assets/generated_images/wallpaper_minecraft_cats_pandas_2560x1440.png";
import wallMangroves from "@assets/generated_images/wallpaper_minecraft_mangroves_2560x1440.png";
import wallNether from "@assets/generated_images/wallpaper_minecraft_nether_update_2560x1440.png";
import wallOcean from "@assets/generated_images/wallpaper_minecraft_ocean_monument_2560x1440.png";
import wallTrials from "@assets/generated_images/wallpaper_minecraft_trickytrials_2560x1440.png";
import vanilla121Badge from "@assets/121.png";
import wallAquatic from "@assets/generated_images/wallpaper_minecraft_update_aquatic_2560x1440.png";
import wallVillage from "@assets/generated_images/wallpaper_minecraft_village_pillage_2560x1440.png";
import wallWarden from "@assets/generated_images/wallpaper_minecraft_warden_2560x1440.png";
import wallWild from "@assets/generated_images/wallpaper_minecraft_wild_update_2560x1440.png";
import wallMoviePortal from "@assets/generated_images/mc_wallpaper_movie_portal_2560x1440.png";
import wallBee2 from "@assets/generated_images/Minecraft_Bee2_Wallpaper_2560x1440.png";
import wallCreeper from "@assets/generated_images/Minecraft_Creeper_Wallpaper_2560x1440.png";
import wallDefaultSkins from "@assets/generated_images/wallpaper_minecraft_default_skins_2560x1440.png";
import wallWinter from "@assets/generated_images/wallpaper_minecraft_winter_celebration_2560x1440.png";
import wallCavesCliffsPart1 from "@assets/generated_images/wallpaper_minecraft_caves_cliffs_part1_2560x1440.png";
import wallCavesCliffsPart2 from "@assets/generated_images/wallpaper_minecraft_caves_cliffs_part2_2560x1440.png";
import newbg from "@assets/generated_images/newbg.jpg";
import miscLogo from "@assets/misc.png";

// All wallpapers for random selection
const WALLPAPERS = [
  wallFall, wallHoliday, wallSpring, wallFallCampaign, wallGarden,
  wallAdventure, wallBees, wallCatsPandas, wallMangroves,
  wallNether, wallOcean, wallTrials, wallAquatic, wallVillage, wallWarden, wallWild,
  wallMoviePortal, wallBee2, wallCreeper, wallDefaultSkins, wallWinter
];

// Loader-specific wallpapers
const LOADER_WALLPAPERS: Record<string, string> = {
  vanilla: wallCavesCliffsPart2,
  forge: forgeBanner,
  fabric: wallTrials,
  quilt: quiltBanner,
  dragon: "/home-banner.jpg",
  misc: wallCatsPandas,
  bedrock: wallFallCampaign,
};

interface VersionCategory {
  id: string;
  name: string;
  image: string;
  versions: string[];
}

type MiscLibraryCategory = "modpacks" | "shaders" | "resourcepacks";

interface MiscLibraryItem {
  id: string;
  name: string;
  minecraftVersion: string;
  category: MiscLibraryCategory;
  description: string;
  image: string;
  sourceLabel: string;
  source?: "modrinth" | "curseforge";
  slug?: string;
  websiteUrl?: string;
  modrinthVersionId?: string;
  detectedLoader?: string | null;
  availableVersions?: Array<{
    minecraftVersion: string;
    modrinthVersionId?: string;
    detectedLoader?: string | null;
  }>;
}

interface CustomMiscSelection extends MiscLibraryItem {
  versionId: string;
  addedAt: string;
  installedVersionId?: string;
}

// Quick play - will show installed versions dynamically
const getVersionImage = (versionId: string) => {
  if (versionId.startsWith('26.1') || /^26w\d{2}[a-z]$/i.test(versionId)) return img261Snapshot;
  if (versionId.startsWith('1.21')) return img121;
  if (versionId.startsWith('1.20')) return img120;
  if (versionId.startsWith('1.19')) return img119;
  if (versionId.startsWith('1.18')) return img118;
  if (versionId.startsWith('1.17')) return img117;
  if (versionId.startsWith('1.16')) return img116;
  if (versionId.startsWith('1.15')) return img115;
  if (versionId.startsWith('1.14')) return img114;
  if (versionId.startsWith('1.13')) return img113;
  if (versionId.startsWith('1.12')) return img112;
  if (versionId.startsWith('1.11')) return img111;
  if (versionId.startsWith('1.10')) return img110;
  if (versionId.startsWith('1.9')) return img19;
  if (versionId.startsWith('1.8')) return img18;
  return img121; // default
};

// Get random wallpaper
const getRandomWallpaper = (): string => {
  return WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)];
};

// Format version name for display (shorten Forge/Fabric/Quilt/Dragon/Modpack versions)
const formatVersionDisplay = (version: string): string => {
  // Handle Bedrock versions like "bedrock-1.21.13201" -> "Bedrock 1.21.13201"
  if (version.startsWith('bedrock-')) {
    const bedrockVersion = version.replace('bedrock-', '');
    return `Bedrock ${bedrockVersion}`;
  }
  // Handle Dragon versions like "lapetus-2.0.0-1.20.1" -> "Dragon 1.20.1"
  if (version.startsWith('lapetus-')) {
    const mcVersion = version.split('-').pop() || version;
    return `TrapGaint ${mcVersion}`;
  }
  // Handle modpack versions like "fabulously-optimized-1.21.11" -> "Fabulously Optimized 1.21.11"
  // Modpacks have format: modpack-name-mc-version
  if (version.includes('-') && !version.includes('forge') && !version.includes('fabric-loader') && !version.includes('quilt-loader')) {
    // Extract MC version (last part after last dash)
    const parts = version.split('-');
    const mcVersion = parts[parts.length - 1];
    // Check if last part looks like a MC version (e.g., 1.21.11)
    if (/^\d+\.\d+/.test(mcVersion)) {
      // Convert modpack name to title case
      const modpackName = parts.slice(0, -1).join('-')
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return `${modpackName} ${mcVersion}`;
    }
  }
  // Handle Forge versions like "1.8.9-forge1.8.9-11.15.1.2318-1.8.9" -> "1.8.9"
  // or "1.20.1-forge-47.2.0" -> "1.20.1"
  if (version.includes('forge')) {
    // Extract just the MC version (first part before -forge)
    const mcVersion = version.split('-')[0];
    return mcVersion;
  }
  // Handle Fabric versions like "fabric-loader-0.18.4-1.21.11" -> "1.21.11"
  // MC version is at the END for Fabric
  if (version.includes('fabric-loader')) {
    const mcVersion = version.split('-').pop() || version;
    return mcVersion;
  }
  // Handle Quilt versions like "quilt-loader-0.30.0-beta.0-1.21.11" -> "1.21.11"
  // MC version is at the END for Quilt
  if (version.includes('quilt-loader')) {
    const mcVersion = version.split('-').pop() || version;
    return mcVersion;
  }
  return version;
};

const VERSION_CATEGORIES: VersionCategory[] = [
  { id: "26.1", name: "26.1", image: img261Snapshot, versions: [] },
  { id: "1.21", name: "1.21", image: img121, versions: [] },
  { id: "1.20", name: "1.20", image: img120, versions: [] },
  { id: "1.19", name: "1.19", image: img119, versions: [] },
  { id: "1.18", name: "1.18", image: img118, versions: [] },
  { id: "1.17", name: "1.17", image: img117, versions: [] },
  { id: "1.16", name: "1.16", image: img116, versions: [] },
  { id: "1.15", name: "1.15", image: img115, versions: [] },
  { id: "1.14", name: "1.14", image: img114, versions: [] },
  { id: "1.13", name: "1.13", image: img113, versions: [] },
  { id: "1.12", name: "1.12", image: img112, versions: [] },
  { id: "1.11", name: "1.11", image: img111, versions: [] },
  { id: "1.10", name: "1.10", image: img110, versions: [] },
  { id: "1.9", name: "1.9", image: img19, versions: [] },
  { id: "1.8", name: "1.8", image: img18, versions: [] },
];

type TabType = "home" | "versions" | "mods" | "servers" | "friends" | "news" | "store" | "hosting";
type LoaderType = "vanilla" | "forge" | "fabric" | "quilt" | "dragon" | "misc" | "modpacks" | "lapetus" | "bedrock";
type DragonModSource = "github" | "local";

const COUSTOM_CATEGORY_ID = "coustom";
const COUSTOM_STORAGE_KEY = "trapgaint-coustom-library-v1";

const createCoustomVersionId = (item: Pick<MiscLibraryItem, "category" | "id" | "minecraftVersion">) =>
  `coustom-${item.category}-${item.id}-${item.minecraftVersion.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;

const createMiscRuntimeVersionId = (item: Pick<MiscLibraryItem, "name" | "minecraftVersion">) => {
  const cleanName = item.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/['"]/g, "")
    .split("")
    .filter((char) => /[a-z0-9-]/.test(char))
    .join("");

  return `${cleanName}-${item.minecraftVersion}`;
};

const getMiscSelectionVersionId = (
  item: Pick<CustomMiscSelection, "name" | "minecraftVersion"> & { installedVersionId?: string }
) => item.installedVersionId || createMiscRuntimeVersionId(item);

const groupMiscSelectionsByVersion = (items: CustomMiscSelection[]): VersionCategory[] => {
  if (items.length === 0) return [];

  const versionGroups = new Map<string, CustomMiscSelection[]>();

  items.forEach((item) => {
    const parts = item.minecraftVersion.split(".");
    const majorMinor = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : item.minecraftVersion;

    if (!versionGroups.has(majorMinor)) {
      versionGroups.set(majorMinor, []);
    }

    versionGroups.get(majorMinor)!.push(item);
  });

  return Array.from(versionGroups.entries())
    .map(([version, groupedItems]) => ({
      id: `misc-${version}`,
      name: version,
      image: getVersionImage(version),
      versions: groupedItems.map((item) => getMiscSelectionVersionId(item)),
    }))
    .sort((a, b) => {
      const aParts = a.name.split(".").map(Number);
      const bParts = b.name.split(".").map(Number);

      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aNum = aParts[i] || 0;
        const bNum = bParts[i] || 0;
        if (aNum !== bNum) return bNum - aNum;
      }

      return 0;
    });
};

const getVisiblePageIndices = (currentPage: number, totalPages: number, maxVisiblePages: number = 5) => {
  if (totalPages <= 0) return [];

  let startPage = Math.max(0, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1);

  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(0, endPage - maxVisiblePages + 1);
  }

  return Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
};

const MISC_MODPACK_SEARCH_CACHE_VERSION = "v4";
const MOD_BROWSER_SEARCH_CACHE_VERSION = "v3";
const PAGED_SCROLL_THRESHOLD = 56;
const PAGED_SCROLL_COOLDOWN_MS = 320;

const extractMarketplaceModpackSlugFromQuery = (query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return "";

  const prefixes = [
    "https://modrinth.com/modpack/",
    "http://modrinth.com/modpack/",
    "https://www.modrinth.com/modpack/",
    "http://www.modrinth.com/modpack/",
    "https://modrinth.com/mod/",
    "http://modrinth.com/mod/",
    "https://www.modrinth.com/mod/",
    "http://www.modrinth.com/mod/",
    "https://www.curseforge.com/minecraft/modpacks/",
    "http://www.curseforge.com/minecraft/modpacks/",
    "https://curseforge.com/minecraft/modpacks/",
    "http://curseforge.com/minecraft/modpacks/",
    "https://www.curseforge.com/minecraft/mc-mods/",
    "http://www.curseforge.com/minecraft/mc-mods/",
    "https://curseforge.com/minecraft/mc-mods/",
    "http://curseforge.com/minecraft/mc-mods/",
  ];

  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      const slug = trimmed.slice(prefix.length).split(/[/?#]/)[0]?.trim();
      if (slug) return slug;
    }
  }

  return "";
};

const normalizeMarketplaceModpackSearchQuery = (query: string) => {
  return extractMarketplaceModpackSlugFromQuery(query) || query.trim();
};

const normalizeMarketplaceMatchWords = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeMarketplaceMatchSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const scoreMarketplaceModpackResult = (
  query: string,
  candidate: { slug?: string | null; title?: string | null }
) => {
  const normalizedQuery = normalizeMarketplaceModpackSearchQuery(query);
  if (!normalizedQuery) return 0;

  const queryWords = normalizeMarketplaceMatchWords(normalizedQuery);
  const querySlug = normalizeMarketplaceMatchSlug(normalizedQuery);
  const candidateSlug = normalizeMarketplaceMatchSlug(candidate.slug || "");
  const candidateTitleWords = normalizeMarketplaceMatchWords(candidate.title || "");
  const candidateTitleSlug = normalizeMarketplaceMatchSlug(candidate.title || "");

  if (querySlug && candidateSlug === querySlug) return 600;
  if (queryWords && candidateTitleWords === queryWords) return 560;
  if (querySlug && candidateTitleSlug === querySlug) return 540;
  if (querySlug && (candidateSlug.startsWith(querySlug) || candidateTitleSlug.startsWith(querySlug))) return 420;
  if (queryWords && candidateTitleWords.includes(queryWords)) return 320;
  if (querySlug && (candidateSlug.includes(querySlug) || candidateTitleSlug.includes(querySlug))) return 260;
  return 0;
};

const createMiscModpackSearchCacheKey = (
  query: string,
  page: number,
  gameVersion?: string,
  loader?: string
) => {
  const normalizedQuery = query.trim().toLowerCase();
  return [
    "misc-modpacks",
    MISC_MODPACK_SEARCH_CACHE_VERSION,
    normalizedQuery || "all",
    page,
    gameVersion || "any-version",
    loader || "any-loader",
  ].join(":");
};

const MISC_MODPACK_CARD_THEMES = [
  {
    variant: "first" as const,
    primary: "rgba(173, 116, 255, 0.96)",
    secondary: "rgba(91, 33, 182, 0.72)",
    edge: "rgba(196, 181, 253, 0.16)",
    glow: "rgba(139, 92, 246, 0.44)",
  },
  {
    variant: "last" as const,
    primary: "rgba(88, 101, 242, 0.92)",
    secondary: "rgba(30, 41, 108, 0.88)",
    edge: "rgba(96, 165, 250, 0.16)",
    glow: "rgba(59, 130, 246, 0.3)",
  },
  {
    variant: "last" as const,
    primary: "rgba(168, 85, 247, 0.92)",
    secondary: "rgba(76, 29, 149, 0.82)",
    edge: "rgba(244, 114, 182, 0.14)",
    glow: "rgba(192, 132, 252, 0.28)",
  },
] as const;

const normalizeVersionId = (value: string): string => value.trim().toLowerCase();
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractMcVersion = (versionId: string): string => {
  const normalized = normalizeVersionId(versionId);
  const match = normalized.match(/\d+\.\d+(?:\.\d+)?/);
  return match ? match[0] : "";
};

const SNAPSHOT_26W_PATTERN = /^26w\d{2}[a-z]$/i;
const COMING_SOON_CATEGORY_ID = "26.1";
const COMING_SOON_LOADERS = new Set<LoaderType>(["forge", "fabric", "quilt", "dragon"]);

const getVanillaCategoryFromVersionId = (versionId: string): string => {
  const normalized = normalizeVersionId(versionId);

  const semverMatch = normalized.match(/^(\d+)\.(\d+)/);
  if (semverMatch) {
    return `${semverMatch[1]}.${semverMatch[2]}`;
  }

  const snapshotMatch = normalized.match(/^(\d{2})w\d{2}[a-z]$/i);
  if (snapshotMatch) {
    // Example: 26w14a -> category 26.1
    return `${snapshotMatch[1]}.1`;
  }

  return normalized;
};

const matchesVanillaVersionCategory = (
  version: { id: string; type?: string },
  categoryId: string
): boolean => {
  const id = String(version.id ?? "").trim();
  const type = String(version.type ?? "").toLowerCase();

  // Custom snapshot lane (26.1)
  if (categoryId === "26.1") {
    return (
      id.startsWith("26.1") ||
      id.startsWith("1.26") ||
      (type === "snapshot" && SNAPSHOT_26W_PATTERN.test(id))
    );
  }

  // Default lanes keep release-only behavior
  return type === "release" && id.startsWith(categoryId);
};

const isComingSoonCategoryForLoader = (
  loader: LoaderType,
  categoryId: string,
  versionsCount: number
): boolean => categoryId === COMING_SOON_CATEGORY_ID && COMING_SOON_LOADERS.has(loader) && versionsCount === 0;

const canonicalVersionForLoader = (loader: LoaderType, versionId: string): string => {
  const normalized = normalizeVersionId(versionId);
  if (!normalized) return "";

  if (loader === "fabric") {
    const match = normalized.match(/^fabric-loader-(.+)-(\d+\.\d+(?:\.\d+)*)$/);
    if (match) return `fabric|${match[2]}|${match[1]}`;
  }

  if (loader === "quilt") {
    const match = normalized.match(/^quilt-loader-(.+)-(\d+\.\d+(?:\.\d+)*)$/);
    if (match) return `quilt|${match[2]}|${match[1]}`;
  }

  if (loader === "dragon") {
    if (normalized.startsWith("dragon-client-")) {
      return `dragon|${extractMcVersion(normalized.slice("dragon-client-".length))}`;
    }
    if (normalized.startsWith("dragon-")) {
      return `dragon|${extractMcVersion(normalized.slice("dragon-".length))}`;
    }
  }

  if (loader === "forge") {
    let mcVersion = "";
    let forgePart = "";

    if (normalized.startsWith("forge-")) {
      const rest = normalized.slice("forge-".length);
      mcVersion = extractMcVersion(rest);
      forgePart = rest.slice(mcVersion.length);
    } else {
      mcVersion = extractMcVersion(normalized);
      const forgeIndex = normalized.indexOf("forge");
      if (forgeIndex !== -1) {
        forgePart = normalized.slice(forgeIndex + "forge".length);
      }
    }

    if (!mcVersion) return "";

    forgePart = forgePart.replace(new RegExp(`^${escapeRegex(mcVersion)}`), "");
    forgePart = forgePart.replace(/^[^0-9]+/, "");
    return `forge|${mcVersion}|${forgePart}`;
  }

  return normalized;
};

const isInstalledForLoader = (
  loader: LoaderType,
  selectedVersionId: string,
  installedVersionIds: string[]
): boolean => {
  const selected = normalizeVersionId(selectedVersionId);
  if (!selected) return false;

  const normalizedInstalled = installedVersionIds.map(normalizeVersionId);
  if (normalizedInstalled.includes(selected)) return true;

  const selectedCanonical = canonicalVersionForLoader(loader, selectedVersionId);
  if (selectedCanonical) {
    if (installedVersionIds.some((installed) => canonicalVersionForLoader(loader, installed) === selectedCanonical)) {
      return true;
    }
  }

  if (loader === "dragon") {
    const selectedMcVersion = extractMcVersion(selectedVersionId);
    if (!selectedMcVersion) return false;
    return installedVersionIds.some((installed) => {
      const normalizedInstalledVersion = normalizeVersionId(installed);
      if (!normalizedInstalledVersion.startsWith("dragon-") && !normalizedInstalledVersion.startsWith("dragon-client-")) {
        return false;
      }
      return extractMcVersion(installed) === selectedMcVersion;
    });
  }

  return false;
};

const LAST_SELECTED_VERSION_KEY_PREFIX = "dragon_last_selected_version_";
const LAST_PLAYED_VERSION_KEY_PREFIX = "dragon_last_played_version_";

const getLastSelectedVersionKey = (loader: LoaderType): string =>
  `${LAST_SELECTED_VERSION_KEY_PREFIX}${loader}`;

const getLastPlayedVersionKey = (loader: LoaderType): string =>
  `${LAST_PLAYED_VERSION_KEY_PREFIX}${loader}`;

const isVersionKnownForLoader = (
  loader: LoaderType,
  versionId: string,
  installedVersionIds: string[],
  categoriesForLoader: VersionCategory[]
): boolean => {
  const normalized = normalizeVersionId(versionId);
  if (!normalized) return false;

  if (isInstalledForLoader(loader, versionId, installedVersionIds)) {
    return true;
  }

  const categoryVersions = categoriesForLoader.flatMap((category) => category.versions || []);
  if (categoryVersions.some((version) => normalizeVersionId(version) === normalized)) {
    return true;
  }

  const targetCanonical = canonicalVersionForLoader(loader, versionId);
  if (targetCanonical) {
    if (
      categoryVersions.some(
        (version) => canonicalVersionForLoader(loader, version) === targetCanonical
      )
    ) {
      return true;
    }
  }

  return false;
};

const resolveDragonVersionId = (
  versionId: string,
  installedDragonVersionIds: string[],
  availableDragonVersions: Array<{ id: string; mc_version?: string }>
): string => {
  const normalized = normalizeVersionId(versionId);
  if (!normalized) return versionId;

  const mcVersion = extractMcVersion(versionId);
  if (!mcVersion) return versionId;

  const installedMatch = installedDragonVersionIds.find(
    (installed) => extractMcVersion(installed) === mcVersion
  );
  if (installedMatch) return installedMatch;

  const availableMatch = availableDragonVersions.find(
    (dragonVersion) => extractMcVersion(dragonVersion.id || dragonVersion.mc_version || "") === mcVersion
  );
  if (availableMatch?.id) return availableMatch.id;

  if (normalized.startsWith("dragon-")) return versionId;

  return `dragon-${mcVersion}`;
};

// Greetings based on time of day
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  if (hour < 21) return "Good Evening";
  return "Good Night";
};

// Format install status to be short and clean
const formatInstallStatus = (status: string): string => {
  // Remove GitHub mentions and technical details
  let clean = status
    .replace(/from GitHub.*/i, '')
    .replace(/from server.*/i, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Shorten common messages
  if (clean.toLowerCase().includes('downloading')) return 'Downloading...';
  if (clean.toLowerCase().includes('installing fabric')) return 'Setting up Fabric...';
  if (clean.toLowerCase().includes('installing minecraft')) return 'Installing Minecraft...';
  if (clean.toLowerCase().includes('installing lapetus')) return 'Installing TrapGaint...';
  if (clean.toLowerCase().includes('installing mods')) return 'Installing mods...';
  if (clean.toLowerCase().includes('verifying')) return 'Verifying files...';
  if (clean.toLowerCase().includes('extracting')) return 'Extracting...';
  if (clean.toLowerCase().includes('copying')) return 'Copying files...';
  if (clean.toLowerCase().includes('complete')) return 'Almost done...';

  // Truncate if still too long
  if (clean.length > 25) clean = clean.substring(0, 22) + '...';

  return clean || 'Preparing...';
};

// Minecraft facts and tips
const MINECRAFT_FACTS = [
  "Creepers were created by accident when Notch tried to make a pig!",
  "The Enderman language is just English played backwards and distorted.",
  "Minecraft has sold over 300 million copies worldwide.",
  "A day in Minecraft lasts exactly 20 minutes in real time.",
  "Ghasts sounds are made by a sleeping cat.",
  "The Ender Dragon is named Jean, according to Notch.",
  "Diamonds are most common at Y level -59 in modern versions.",
  "You can put a pumpkin on your head to avoid Enderman aggro.",
  "Cats scare away Creepers and Phantoms.",
  "The Wither is the only mob you have to build yourself.",
  "Bees die after stinging you, just like real bees.",
  "Parrots can imitate nearby hostile mobs.",
  "You can dye a wolf's collar any color you want.",
  "Foxes can pick up and carry items in their mouths.",
  "The Nether ceiling is at Y level 127.",
  "Piglins love gold and will attack you without it.",
  "Axolotls can play dead to regenerate health.",
  "The Deep Dark biome is the quietest place in Minecraft.",
  "Allays can duplicate themselves with amethyst shards.",
  "Frogs can eat small Slimes and Magma Cubes.",
];

// Loader configuration
const LOADERS = {
  vanilla: { name: "Vanilla", logo: vanillaLogo, color: "emerald" },
  forge: { name: "Forge", logo: forgeLogo, color: "orange" },
  fabric: { name: "Fabric", logo: fabricLogo, color: "amber" },
  quilt: { name: "Quilt", logo: quiltLogo, color: "purple" },
  dragon: { name: "TrapGaint", logo: starIcon, color: "pink", basedOn: "fabric" },
  misc: { name: "Misc", logo: miscLogo, color: "cyan" },
  modpacks: { name: "Modpacks", logo: vanillaLogo, color: "cyan" },
};

const getModManagerTheme = (loader?: string | null) => {
  const normalized = (loader || "vanilla").toLowerCase();

  switch (normalized) {
    case "forge":
      return {
        backgroundFilter: "hue-rotate(130deg) saturate(0.95)",
        accent: "#fb923c",
        accentHover: "#f97316",
        accentSoft: "rgba(251, 146, 60, 0.16)",
        accentBorder: "rgba(251, 146, 60, 0.34)",
        accentText: "#fed7aa",
        buttonText: "#180b02",
        surface: "rgba(38, 18, 6, 0.72)",
        surfaceHover: "rgba(54, 24, 8, 0.88)",
        input: "rgba(36, 18, 7, 0.56)",
        cardBorder: "rgba(251, 146, 60, 0.16)",
        cardShadow: "rgba(249, 115, 22, 0.14)",
      };
    case "fabric":
      return {
        backgroundFilter: "hue-rotate(145deg) saturate(1.0)",
        accent: "#fbbf24",
        accentHover: "#f59e0b",
        accentSoft: "rgba(251, 191, 36, 0.16)",
        accentBorder: "rgba(251, 191, 36, 0.34)",
        accentText: "#fde68a",
        buttonText: "#181102",
        surface: "rgba(40, 29, 6, 0.72)",
        surfaceHover: "rgba(56, 38, 8, 0.88)",
        input: "rgba(39, 28, 7, 0.56)",
        cardBorder: "rgba(251, 191, 36, 0.16)",
        cardShadow: "rgba(245, 158, 11, 0.14)",
      };
    case "quilt":
      return {
        backgroundFilter: "hue-rotate(30deg) saturate(0.96)",
        accent: "#c084fc",
        accentHover: "#a855f7",
        accentSoft: "rgba(192, 132, 252, 0.16)",
        accentBorder: "rgba(192, 132, 252, 0.34)",
        accentText: "#e9d5ff",
        buttonText: "#14051d",
        surface: "rgba(32, 10, 42, 0.72)",
        surfaceHover: "rgba(44, 12, 58, 0.88)",
        input: "rgba(28, 11, 40, 0.56)",
        cardBorder: "rgba(192, 132, 252, 0.16)",
        cardShadow: "rgba(168, 85, 247, 0.14)",
      };
    case "dragon":
      return {
        backgroundFilter: "hue-rotate(108deg) saturate(0.94)",
        accent: "#60a5fa",
        accentHover: "#3b82f6",
        accentSoft: "rgba(96, 165, 250, 0.16)",
        accentBorder: "rgba(96, 165, 250, 0.34)",
        accentText: "#bfdbfe",
        buttonText: "#04101f",
        surface: "rgba(8, 20, 40, 0.72)",
        surfaceHover: "rgba(10, 29, 58, 0.88)",
        input: "rgba(9, 20, 42, 0.56)",
        cardBorder: "rgba(96, 165, 250, 0.16)",
        cardShadow: "rgba(59, 130, 246, 0.14)",
      };
    case "misc":
      return {
        backgroundFilter: "hue-rotate(130deg) saturate(1.02)",
        accent: "#f472b6",
        accentHover: "#ec4899",
        accentSoft: "rgba(244, 114, 182, 0.16)",
        accentBorder: "rgba(244, 114, 182, 0.34)",
        accentText: "#fbcfe8",
        buttonText: "#1a0812",
        surface: "rgba(40, 10, 26, 0.72)",
        surfaceHover: "rgba(56, 12, 34, 0.88)",
        input: "rgba(42, 11, 28, 0.56)",
        cardBorder: "rgba(244, 114, 182, 0.16)",
        cardShadow: "rgba(236, 72, 153, 0.14)",
      };
    case "lapetus":
    case "modpacks":
      return {
        backgroundFilter: "hue-rotate(182deg) saturate(0.92)",
        accent: "#22d3ee",
        accentHover: "#06b6d4",
        accentSoft: "rgba(34, 211, 238, 0.16)",
        accentBorder: "rgba(34, 211, 238, 0.34)",
        accentText: "#a5f3fc",
        buttonText: "#041518",
        surface: "rgba(7, 31, 37, 0.72)",
        surfaceHover: "rgba(8, 44, 52, 0.88)",
        input: "rgba(7, 30, 36, 0.56)",
        cardBorder: "rgba(34, 211, 238, 0.16)",
        cardShadow: "rgba(6, 182, 212, 0.14)",
      };
    case "bedrock":
      return {
        backgroundFilter: "hue-rotate(112deg) saturate(0.88)",
        accent: "#4ade80",
        accentHover: "#22c55e",
        accentSoft: "rgba(74, 222, 128, 0.16)",
        accentBorder: "rgba(74, 222, 128, 0.34)",
        accentText: "#bbf7d0",
        buttonText: "#061608",
        surface: "rgba(10, 34, 16, 0.72)",
        surfaceHover: "rgba(12, 47, 20, 0.88)",
        input: "rgba(9, 32, 14, 0.56)",
        cardBorder: "rgba(74, 222, 128, 0.16)",
        cardShadow: "rgba(34, 197, 94, 0.14)",
      };
    case "vanilla":
    default:
      return {
        backgroundFilter: "hue-rotate(220deg) saturate(1.04)",
        accent: "#4ade80",
        accentHover: "#22c55e",
        accentSoft: "rgba(74, 222, 128, 0.16)",
        accentBorder: "rgba(74, 222, 128, 0.34)",
        accentText: "#bbf7d0",
        buttonText: "#061608",
        surface: "rgba(10, 34, 16, 0.72)",
        surfaceHover: "rgba(12, 47, 20, 0.88)",
        input: "rgba(9, 32, 14, 0.56)",
        cardBorder: "rgba(74, 222, 128, 0.16)",
        cardShadow: "rgba(34, 197, 94, 0.14)",
      };
  }
};

const getLoaderRibbonStyle = (loader?: string | null) => {
  const theme = getModManagerTheme(loader);

  return {
    background: `linear-gradient(180deg, ${theme.accentText} 0%, ${theme.accent} 38%, ${theme.accentHover} 72%, ${theme.surface} 100%)`,
    color: "#ffffff",
    boxShadow: `0 14px 24px -14px ${theme.accentHover}, inset 0 1px 0 rgba(255,255,255,0.28)`,
    borderLeft: `1px solid ${theme.accentBorder}`,
    borderRight: `1px solid ${theme.accentBorder}`,
  } as const;
};

const CAPE_OPTIONS = [
  { index: 0, name: "Migrator", image: "/capes/cape1.png" },
  { index: 1, name: "Pan", image: "/capes/cape2.png" },
  { index: 2, name: "15th Anniversary", image: "/capes/cape3.png" },
  { index: 3, name: "Common", image: "/capes/cape4.png" },
  { index: 4, name: "Animated Fire", image: "/capes/cape5.gif" },
  { index: 5, name: "Cape 10", image: "/capes/cape10.png" },
  { index: 6, name: "Cape 11", image: "/capes/cape11.png" },
  { index: 7, name: "Cape 12", image: "/capes/cape12.png" },
  { index: 8, name: "Cape 13", image: "/capes/cape13.png" },
  { index: 9, name: "Animated 2016", image: "/capes/cape14.gif" },
  { index: 10, name: "Enchanter", image: "/capes/cape15.gif" },
  { index: 11, name: "Shiny Pickaxe", image: "/capes/cape16.gif" },
  { index: 12, name: "Cape 17", image: "/capes/cape17.png" },
  { index: 13, name: "ThirtyVirus Code Red", image: "/capes/cape18.gif" },
  { index: 14, name: "Cape 6", image: "/capes/cape6.png" },
  { index: 15, name: "Cape 7", image: "/capes/cape7.png" },
  { index: 16, name: "Cape 8", image: "/capes/cape8.png" },
  { index: 17, name: "Cape 9", image: "/capes/cape9.png" },
  { index: 18, name: "DO Animated", image: "/capes/do.gif" },
] as const;

const CAPE_INDEX_ALIASES: Record<number, number> = {
  14: 1,
  15: 2,
  16: 3,
  17: 0,
};

const normalizeCapeIndex = (index: number | null | undefined): number | null => {
  if (typeof index !== "number" || Number.isNaN(index)) {
    return null;
  }

  return CAPE_INDEX_ALIASES[index] ?? index;
};

const DISPLAY_CAPE_OPTIONS = CAPE_OPTIONS.filter(
  (cape) => CAPE_INDEX_ALIASES[cape.index] === undefined
);
const CAPES_PER_PAGE = 4;
const CAPE_TOTAL_PAGES = Math.ceil(DISPLAY_CAPE_OPTIONS.length / CAPES_PER_PAGE);

export default function Launcher() {
  // Component mounted
  
  const { isLowEnd } = usePerformanceMode();
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [activeLoader, setActiveLoader] = useState<LoaderType>("vanilla");
  
  // Track last launched loader for Dynamic Island
  const [lastLaunchedLoader, setLastLaunchedLoader] = useState<LoaderType | null>(() => {
    return (localStorage.getItem('last_launched_loader') as LoaderType) || null;
  });
  
  // AI Chat state
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const [thinkingTextIndex, setThinkingTextIndex] = useState(0);
  const thinkingTexts = ['Germinating', 'Gathering', 'Thinking'];
  const [chatCredits, setChatCredits] = useState(0);

  // Skin Upload state (for Custom Skins tab)
  const [skinFile, setSkinFile] = useState<File | null>(null);
  const [skinPreview, setSkinPreview] = useState<string | null>(null);
  const [skinModel, setSkinModel] = useState<string>('default');
  const [selectedCapeIndex, setSelectedCapeIndex] = useState<number | null>(null);
  const normalizedSelectedCapeIndex = useMemo(
    () => normalizeCapeIndex(selectedCapeIndex),
    [selectedCapeIndex]
  );
  const [isUploading, setIsUploading] = useState(false);

  // Dynamic Island for achievements and skin apply only
  const dynamicIsland = useDynamicIsland();
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Skin Gallery state
  const [selectedGallerySkin, setSelectedGallerySkin] = useState<any>(null);
  const [skinsActiveTab, setSkinsActiveTab] = useState<'skins' | 'capes' | 'custom-skins'>('skins');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Preload all cape images for instant loading
  useEffect(() => {
    const preloadCapes = () => {
      DISPLAY_CAPE_OPTIONS.forEach(cape => {
        const img = new Image();
        img.src = cape.image;
      });
    };
    preloadCapes();
  }, []);

  // Keep Discord launcher presence in sync for production builds where startup IPC can race.
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let attempts = 0;
    const maxAttempts = 8;

    const syncLauncherPresence = async () => {
      if (cancelled) return;

      try {
        await invoke('update_discord_status', {
          status: 'launcher',
          version: null,
          server: null,
          loader: null
        });
        console.log('[Discord] Launcher RPC synced');
      } catch (error) {
        attempts += 1;
        console.warn(`[Discord] Launcher RPC sync failed (attempt ${attempts}/${maxAttempts})`, error);

        if (attempts < maxAttempts && !cancelled) {
          retryTimer = window.setTimeout(() => {
            void syncLauncherPresence();
          }, 2500);
        }
      }
    };

    retryTimer = window.setTimeout(() => {
      void syncLauncherPresence();
    }, 900);

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, []);

  // Load selected cape when switching to skins tab
  useEffect(() => {
    if (activeTab === 'news') {
      const loadSelectedCape = async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const selected = await invoke<number | null>('get_selected_cape');
          setSelectedCapeIndex(typeof selected === 'number' ? normalizeCapeIndex(selected) : null);
        } catch (error) {
          console.error('Failed to load selected cape:', error);
        }
      };
      loadSelectedCape();
    }
  }, [activeTab]);

  // Initialize credits on mount and fetch from Supabase
  useEffect(() => {
    const loadCredits = async () => {
      // Fetch from Supabase first (this will also update localStorage)
      const credits = await fetchCreditsFromSupabase();
      setChatCredits(credits);
    };
    loadCredits();
  }, []);

  // Cycle through thinking texts
  useEffect(() => {
    if (!isAiTyping) return;
    
    const interval = setInterval(() => {
      setThinkingTextIndex((prev) => (prev + 1) % thinkingTexts.length);
    }, 1500);
    
    return () => clearInterval(interval);
  }, [isAiTyping]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isAiTyping]);
  
  const [installedVersions, setInstalledVersions] = useState<string[]>([]);
  const [installedForgeVersions, setInstalledForgeVersions] = useState<string[]>([]);
  const [fabricVersions, setFabricVersions] = useState<string[]>([]);
  const [dragonVersions, setDragonVersions] = useState<string[]>([]);
  const [quiltVersions, setQuiltVersions] = useState<string[]>([]);
  const [lapetusVersions, setLapetusVersions] = useState<string[]>([]);
  const [bedrockVersions, setBedrockVersions] = useState<string[]>([]);
  const [installedGameVersions, setInstalledGameVersions] = useState<string[]>([]); // Modrinth-style: game versions only
  const [modpacks, setModpacks] = useState<any[]>([]);
  const [isLoadingModpacks, setIsLoadingModpacks] = useState<boolean>(false);
  const [modpacksPage, setModpacksPage] = useState<number>(0);
  const [modpacksTotal, setModpacksTotal] = useState<number>(0);
  
  const modpacksPerPage = 3;
  const modpacksPageCount = useMemo(
    () => Math.max(1, Math.ceil(modpacksTotal / modpacksPerPage)),
    [modpacksTotal]
  );

  const [modpackVersions, setModpackVersions] = useState<any[]>([]);
  const [selectedModpack, setSelectedModpack] = useState<any | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<VersionCategory | null>(null);
  const [activeAccount, setActiveAccount] = useState<AuthAccount | null>(null);
  const [miscStoreCategory, setMiscStoreCategory] = useState<'pets' | 'cursors'>('pets');
  const [equippedCursor, setEquippedCursor] = useState<number | null>(() => {
    const saved = localStorage.getItem('dragon_equipped_cursor');
    return saved ? parseInt(saved, 10) : null;
  });
  const [cursorPage, setCursorPage] = useState(0);

  // Apply equipped cursor globally
  useEffect(() => {
    const root = document.documentElement;
    const cursorImages = equippedCursor !== null ? cursorsBase64[equippedCursor] : undefined;

    if (cursorImages) {
      root.style.setProperty('--app-cursor-default', `url("${cursorImages.default}") 0 0`);
      root.style.setProperty('--app-cursor-pointer', `url("${cursorImages.pointer}") 0 0`);
    } else {
      root.style.removeProperty('--app-cursor-default');
      root.style.removeProperty('--app-cursor-pointer');
    }

    return () => {
      root.style.removeProperty('--app-cursor-default');
      root.style.removeProperty('--app-cursor-pointer');
    };
  }, [equippedCursor]);

  // Wrapper to handle account changes (NO registration here - done in startup/onboarding)
  const handleAccountChange = async (account: AuthAccount | null) => {
    if (account) {
      // Check if this is the same account that's already active (silent refresh)
      const isSameAccount = activeAccount?.uuid === account.uuid;
      
      if (isSameAccount) {
        console.log('[Account Change] Same account, silent refresh (no friends reload)');
        // Just update the account state without triggering effects
        setActiveAccount(account);
        return;
      }
      
      console.log('[Account Change] New account detected, full initialization');
      
      // NOTE: Registration is handled in StartupUpdate/Onboarding, not here
      // This prevents app refresh when fetching Xbox profile
      
      // Save session for persistent login
      const { saveSession } = await import("@/lib/crackedAccountStorage");
      const oderId = localStorage.getItem('lapetus_oder_id') || `lap_${account.uuid.replace(/-/g, '').substring(0, 16)}`;
      await saveSession({
        username: account.username,
        uuid: account.uuid,
        oderId: oderId,
        isOffline: account.is_offline || false,
        createdAt: Date.now()
      });
      console.log('[Account Change] Session saved for persistent login');
      
      setActiveAccount(account);

      // Load initial versions data
      await loadVanillaVersionsData();

      // Reapply tier theme for this account
      if (oderId) {
        const { getTierFromStorage, getTierByName, applyTierTheme } = await import('@/lib/membership');
        const tierName = getTierFromStorage(oderId);
        const tier = getTierByName(tierName);
        console.log('[Account Change] Applying tier:', tierName, 'for account:', account.username);
        applyTierTheme(tier);
      }
    } else {
      setActiveAccount(null);
      setIsLoading(false); // Stop loading if no account
    }
  };

  const username = activeAccount?.username || "Player";
  const welcomeSoundPlayedRef = useRef(false);
  const voiceLastPlayedRef = useRef<Record<'welcome' | 'apply' | 'achievement', number>>({
    welcome: 0,
    apply: 0,
    achievement: 0,
  });

  const speakEvent = useCallback(
    async (
      kind: 'welcome' | 'apply' | 'achievement',
      text: string,
      cooldownMs: number
    ): Promise<boolean> => {
      const now = Date.now();
      if (now - voiceLastPlayedRef.current[kind] < cooldownMs) {
        return false;
      }

      const played = await speak(text);
      if (played) {
        voiceLastPlayedRef.current[kind] = now;
      }
      return played;
    },
    []
  );

  useEffect(() => {
    if (!activeAccount?.username || welcomeSoundPlayedRef.current) {
      return;
    }

    welcomeSoundPlayedRef.current = true;
    let disposed = false;

    const tryPlayWelcome = async () => {
      if (disposed) {
        return;
      }

      const greeting = `Greetings! Welcome back, ${activeAccount.username}.`;
      const played = await speakEvent('welcome', greeting, 0);
      if (played) {
        cleanupListeners();
      }
    };

    const onFirstInteraction = () => {
      void tryPlayWelcome();
    };

    const cleanupListeners = () => {
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);
    };

    void tryPlayWelcome();
    window.addEventListener('pointerdown', onFirstInteraction, { once: true });
    window.addEventListener('keydown', onFirstInteraction, { once: true });

    return () => {
      disposed = true;
      cleanupListeners();
    };
  }, [activeAccount?.username, speakEvent]);

  const syncOfflineSkinSelection = useCallback(async (skinUsername: string | null) => {
    if (!activeAccount?.uuid) {
      return;
    }

    try {
      const updatedAccount = await launcher.updateAccountSkin(activeAccount.uuid, skinUsername);
      setActiveAccount((prev) => (prev && prev.uuid === updatedAccount.uuid ? updatedAccount : prev));
    } catch (error) {
      console.error('Failed to sync skin selection:', error);
    }
  }, [activeAccount?.uuid]);

  // Fetch credits when active account changes
  useEffect(() => {
    const loadCreditsForAccount = async () => {
      if (activeAccount) {
        console.log('[Credits] Active account changed, fetching credits for:', activeAccount.username);
        const credits = await fetchCreditsFromSupabase();
        setChatCredits(credits);
      }
    };
    loadCreditsForAccount();
  }, [activeAccount]);

  // Expose apply function globally for the skin gallery modal
  useEffect(() => {
    (window as any).handleApplySkin = async (skin: any) => {
      // Set skin data for application
      setSelectedGallerySkin(skin);
      setSkinModel(skin.model === 'alex' ? 'slim' : 'default');
      
      // Auto-apply the skin immediately
      const currentUsername = activeAccount?.username;
      if (!currentUsername) {
        return;
      }

      setIsUploading(true);

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        
        // Download skin from gallery
        const response = await fetch(skin.downloadUrl);
        const blob = await response.blob();
        
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result;
            if (typeof result !== 'string') {
              reject(new Error('Failed to read skin file'));
              return;
            }
            const payload = result.split(',')[1];
            if (!payload) {
              reject(new Error('Invalid skin data payload'));
              return;
            }
            resolve(payload);
          };
          reader.onerror = () => reject(reader.error || new Error('Failed to read skin file'));
          reader.readAsDataURL(blob);
        });

        await invoke('save_custom_skin', {
          playerName: currentUsername,
          skinData: base64Data,
          model: skin.model === 'alex' ? 'slim' : 'default'
        });
        const selectedSkinUsername = (() => {
          try {
            const raw = typeof skin.downloadUrl === 'string' ? skin.downloadUrl.split('/').pop() || '' : '';
            const cleaned = decodeURIComponent(raw).trim();
            return cleaned || currentUsername;
          } catch {
            return currentUsername;
          }
        })();
        await syncOfflineSkinSelection(selectedSkinUsername);

        await invoke('set_selected_cape', {
          capeIndex: normalizedSelectedCapeIndex
        });
        void speakEvent('apply', 'Skin applied successfully.', 800);
        
        setIsUploading(false);
        // Clear selection after successful application
        setSelectedGallerySkin(null);
      } catch (error) {
        console.error('Download error:', error);
        setIsUploading(false);
      }
    };

    return () => {
      delete (window as any).handleApplySkin;
    };
  }, [activeAccount, normalizedSelectedCapeIndex, syncOfflineSkinSelection]);

  // Membership tier system - reactive to account changes
  const [oderId, setOderId] = useState<string | null>(() =>
    localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id') || null
  );
  const { tier, updateTier } = useMembership(oderId);
  const [tierKey, setTierKey] = useState(0); // Force re-render on tier change

  // Update oderId when active account changes
  useEffect(() => {
    const newOderId = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id') || null;
    if (newOderId !== oderId) {
      console.log('[Tier] OderId changed from', oderId, 'to', newOderId);
      setOderId(newOderId);
    }
  }, [activeAccount, oderId]);

  // Listen for tier changes
  useEffect(() => {
    const handleTierChange = () => {
      setTierKey(prev => prev + 1);
      console.log('Tier changed, forcing re-render');
    };

    window.addEventListener('themeChanged', handleTierChange);
    return () => window.removeEventListener('themeChanged', handleTierChange);
  }, []);

  // Supabase heartbeat for online status (Railway API removed)
  // const { onlineCount } = useOnlineCount();

  // Cursors state
  const [activeCursor, setActiveCursor] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dragon_app_cursor') || 'default';
    }
    return 'default';
  });

  const handleCursorSelect = (cursorCss: string) => {
    setActiveCursor(cursorCss);
    localStorage.setItem('dragon_app_cursor', cursorCss);
  };

  const appCursors = [
    { id: 'default', name: 'Default', css: 'default', description: 'The standard system cursor.' },
    { id: 'crosshair', name: 'Crosshair', css: 'crosshair', description: 'A precise crosshair, great for gaming vibes.' },
    { id: 'pointer', name: 'Pointer', css: 'pointer', description: 'The classic hand pointer.' },
    { id: 'cell', name: 'Cell', css: 'cell', description: 'A precise plus sign cursor.' },
    { id: 'help', name: 'Help', css: 'help', description: 'Cursor with a question mark.' },
    { id: 'text', name: 'Text', css: 'text', description: 'The text selection I-beam.' }
  ];

  // Achievements data with color combinations (white + color)
  const [achievements, setAchievements] = useState<Achievement[]>(() => {
    // Initialize with default achievements immediately to prevent black screen
    return loadAchievementsFromStorage();
  });

  // Load achievements and track usage on mount
  useEffect(() => {
    // Set up achievement unlock callback - show in Dynamic Island
    setAchievementUnlockCallback((achievement: Achievement) => {
      // Show in Dynamic Island with achievement data
      dynamicIsland.addState({
        type: 'achievement',
        title: 'Achievement Unlocked!',
        subtitle: achievement.name,
        duration: 8000,
        achievementData: {
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
        },
      });
      
      // Speak achievement unlock using Deepgram voice.
      void speakEvent(
        'achievement',
        `Congratulations! You unlocked the achievement: ${achievement.name}`,
        1500
      );
    });

    try {
      // Load saved achievements
      const loaded = loadAchievementsFromStorage();
      setAchievements(loaded);
      
      // Track daily usage
      trackDailyUsage();
      
      // Check time-based achievements
      checkTimeBasedAchievements();
      
      // Unlock first launch achievement if not already unlocked
      const firstLaunch = loaded.find((a: Achievement) => a.id === 'first_launch');
      if (firstLaunch && !firstLaunch.unlocked) {
        const updated = unlockAchievement('first_launch');
        setAchievements(updated);
      }
    } catch (error) {
      console.error('Failed to initialize achievements:', error);
    }
  }, []);

  const unlockedAchievements = useMemo(() => achievements.filter(a => a.unlocked), [achievements]);
  const achievementProgress = useMemo(() => {
    if (achievements.length === 0) return 0;
    return Math.round((unlockedAchievements.length / achievements.length) * 100);
  }, [unlockedAchievements, achievements]);

  // Achievements pagination - memoized to prevent re-renders
  const [achievementPage, setAchievementPage] = useState(0);
  const achievementsPerPage = 6;
  const totalAchievementPages = useMemo(() => {
    if (achievements.length === 0) return 1;
    return Math.ceil(achievements.length / achievementsPerPage);
  }, [achievements]);
  const paginatedAchievements = useMemo(() => achievements.slice(
    achievementPage * achievementsPerPage,
    (achievementPage + 1) * achievementsPerPage
  ), [achievements, achievementPage, achievementsPerPage]);

  // Scroll handler for achievement pagination
  useEffect(() => {
    if (activeTab !== 'servers') return;

    let scrollTimeout: NodeJS.Timeout;
    const handleWheel = (e: WheelEvent) => {
      // Clear any existing timeout
      clearTimeout(scrollTimeout);
      
      // Set a timeout to debounce the scroll
      scrollTimeout = setTimeout(() => {
        const delta = e.deltaY;
        
        if (delta > 0 && achievementPage < totalAchievementPages - 1) {
          setAchievementPage(prev => Math.min(totalAchievementPages - 1, prev + 1));
        } else if (delta < 0 && achievementPage > 0) {
          setAchievementPage(prev => Math.max(0, prev - 1));
        }
      }, 100); // Debounce by 100ms
    };

    window.addEventListener('wheel', handleWheel);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      clearTimeout(scrollTimeout);
    };
  }, [activeTab, achievementPage, totalAchievementPages]);

  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installStatus, setInstallStatus] = useState("");
  const installInProgressRef = useRef(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isAutoLaunchingAfterInstall, setIsAutoLaunchingAfterInstall] = useState(false);
  const launchOverrideRef = useRef<{
    version: string;
    loader: LoaderType;
    skipInstallCheck: boolean;
    dragonModSource?: DragonModSource;
  } | null>(null);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [runningLoader, setRunningLoader] = useState<LoaderType | null>(null);
  const manualStopRef = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const justInstalledVersionRef = useRef<string | null>(null); // Track recently installed version
  const [searchQuery] = useState("");
  const [categories, setCategories] = useState<VersionCategory[]>(VERSION_CATEGORIES);
  const [forgeCategories, setForgeCategories] = useState<VersionCategory[]>([]);
  const [fabricCategories, setFabricCategories] = useState<VersionCategory[]>([]);
  const [dragonCategories, setDragonCategories] = useState<VersionCategory[]>([]);
  const [quiltCategories, setQuiltCategories] = useState<VersionCategory[]>([]);
  const [gameLogs, setGameLogs] = useState<string[]>([]);
  const [logUnlisten, setLogUnlisten] = useState<(() => void) | null>(null);

  // Random Minecraft fact - changes every 10 seconds
  const [randomFact, setRandomFact] = useState(() => MINECRAFT_FACTS[Math.floor(Math.random() * MINECRAFT_FACTS.length)]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRandomFact(MINECRAFT_FACTS[Math.floor(Math.random() * MINECRAFT_FACTS.length)]);
    }, 10000); // Change every 10 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    installInProgressRef.current = isInstalling;
  }, [isInstalling]);

  // Loader-specific wallpaper state
  const [currentWallpaper, setCurrentWallpaper] = useState(() => {
    // Get initial wallpaper based on tier
    if (tier.name === 'LEKIA') return purpleImage;
    if (tier.name === 'SIOET') return redImage;
    return LOADER_WALLPAPERS["lapetus"];
  });

  // Version details modal state
  const [versionDetails, setVersionDetails] = useState<{
    version_id: string;
    base_version: string;
    loader: string;
    is_modded: boolean;
    version_dir: string;
    mods_dir: string;
    saves_dir: string;
    game_dir: string;
    mods: Array<{ name: string; path: string; size: number; enabled?: boolean; icon_path?: string }>;
    worlds: Array<{ name: string; path: string }>;
  } | null>(null);
  const [selectedVersionForDetails, setSelectedVersionForDetails] = useState<string | null>(null);

  // All mods state (with icons)
  const [allMods, setAllMods] = useState<Array<{
    name: string;
    display_name: string;
    mod_id?: string;
    version?: string;
    author?: string;
    path: string;
    size: number;
    enabled: boolean;
    icon_path?: string;
    icon_url?: string; // Converted asset URL
  }>>([]);
  const [isLoadingMods, setIsLoadingMods] = useState(false);

  // Mod marketplace state
  const [modSearchQuery, setModSearchQuery] = useState("");
  const [modSearchResults, setModSearchResults] = useState<Array<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    categories: string[];
    downloads: number;
    icon_url: string;
    author: string;
    versions: string[];
    date_modified?: string;
    source?: 'modrinth' | 'curseforge';
  }>>([]);
  const [featuredMods, setFeaturedMods] = useState<Array<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    categories: string[];
    downloads: number;
    icon_url: string;
    author: string;
    versions: string[];
    date_modified?: string;
    source?: 'modrinth' | 'curseforge';
  }>>([]);
  const [isSearchingMods, setIsSearchingMods] = useState(false);
  const [isDownloadingMod, setIsDownloadingMod] = useState<string | null>(null);
  const [forceRender, setForceRender] = useState(0);
  const [modGameVersion, setModGameVersion] = useState("");
  const [selectedMod, setSelectedMod] = useState<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    categories: string[];
    downloads: number;
    icon_url: string;
    author: string;
    versions: string[];
    date_modified?: string;
    body?: string;
    gallery?: string[];
    license?: string;
    source_url?: string;
    wiki_url?: string;
    discord_url?: string;
    website_url?: string;
    source?: 'modrinth' | 'curseforge';
  } | null>(null);
  const [modVersions, setModVersions] = useState<Array<{
    id: string;
    name: string;
    version_number: string;
    game_versions: string[];
    loaders: string[];
    downloads: number;
    date_published: string;
    files: Array<{ url: string; filename: string; size: number }>;
  }>>([]);
  const [isLoadingModDetails, setIsLoadingModDetails] = useState(false);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  const [isModBrowserPageTransitioning, setIsModBrowserPageTransitioning] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [selectedModLoader, setSelectedModLoader] = useState<string | null>(null);
  const [selectedModGameVersion, setSelectedModGameVersion] = useState<string | null>(null);
  const [showModSpotlight, setShowModSpotlight] = useState(false);
  const [showInstallMods, setShowInstallMods] = useState(false);
  const [showMiscPanel, setShowMiscPanel] = useState(false);
  const [miscActiveTab, setMiscActiveTab] = useState<MiscLibraryCategory>('modpacks');
  const [miscModpackSearchQuery, setMiscModpackSearchQuery] = useState("");
  const [miscModpacks, setMiscModpacks] = useState<MiscLibraryItem[]>([]);
  const [isLoadingMiscModpacks, setIsLoadingMiscModpacks] = useState(false);
  const [isMiscModpackPageTransitioning, setIsMiscModpackPageTransitioning] = useState(false);
  const [miscModpackPage, setMiscModpackPage] = useState(1);
  const [miscModpackTotalHits, setMiscModpackTotalHits] = useState(0);
  const [openMiscVersionMenuKey, setOpenMiscVersionMenuKey] = useState<string | null>(null);
  const [pendingMiscInstallVersionId, setPendingMiscInstallVersionId] = useState<string | null>(null);
  const [customMiscSelections, setCustomMiscSelections] = useState<CustomMiscSelection[]>(() => {
    try {
      const stored = localStorage.getItem(COUSTOM_STORAGE_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter((item): item is CustomMiscSelection => (
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.minecraftVersion === "string" &&
        typeof item.category === "string" &&
        typeof item.versionId === "string"
      ));
    } catch (error) {
      console.warn("[COUSTOM] Failed to restore saved misc selections:", error);
      return [];
    }
  });
  const [selectedCoustomVersionId, setSelectedCoustomVersionId] = useState<string | null>(null);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [activeModFilter, setActiveModFilter] = useState<string | null>(null);
  const [installComplete, setInstallComplete] = useState<{ filename: string; path: string } | null>(null);
  const [showCrashReport, setShowCrashReport] = useState(false);
  const [showRepairDialog, setShowRepairDialog] = useState(false);
  const [repairIssueType, setRepairIssueType] = useState<"corrupted" | "missing_files" | "font_error" | "crash" | "unknown">("unknown");
  const [repairIssueDetails, setRepairIssueDetails] = useState<string | undefined>(undefined);
  const [triggerLaunchLines, setTriggerLaunchLines] = useState(false);
  const [starBrightness, setStarBrightness] = useState(1);
  const [launchButtonFills, setLaunchButtonFills] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);
  const miscModpackRequestIdRef = useRef(0);
  const miscModpackCacheRef = useRef<Record<string, { items: MiscLibraryItem[]; total: number }>>({});
  const miscModpackPrefetchingRef = useRef<Set<string>>(new Set());
  const miscModpackScrollDeltaRef = useRef(0);
  const miscModpackScrollLockRef = useRef(0);
  const cursorScrollDeltaRef = useRef(0);
  const cursorScrollLockRef = useRef(0);

  // Mod browser pagination state
  const [modBrowserPage, setModBrowserPage] = useState(1);
  const [modBrowserTotalHits, setModBrowserTotalHits] = useState(0);
  const [modBrowserSearchQuery, setModBrowserSearchQuery] = useState("");
  const [spotlightSearchDebounce, setSpotlightSearchDebounce] = useState<NodeJS.Timeout | null>(null);
  const modBrowserScrollDeltaRef = useRef(0);
  const modBrowserScrollLockRef = useRef(0);
  const modBrowserPrefetchingRef = useRef<Set<string>>(new Set());
  const MODS_PER_PAGE = 12;

  // Friends state - now using Xbox Live friends
  const [friends, setFriends] = useState<any[]>([]); // Xbox friends list
  const [pendingRequests, setPendingRequests] = useState<any[]>([]); // Not used with Xbox Live
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [showAddFriendDialog, setShowAddFriendDialog] = useState(false);
  const [xboxFriends, setXboxFriends] = useState<any[]>([]);
  const [isLoadingXboxFriends, setIsLoadingXboxFriends] = useState(false);
  const [isLoadingCurrentProfile, setIsLoadingCurrentProfile] = useState(true);
  const xboxFriendsLoadedRef = useRef(false);
  const [showFriendProfileDialog, setShowFriendProfileDialog] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isRemovingFriend, setIsRemovingFriend] = useState(false);
  const [isAcceptingRequest, setIsAcceptingRequest] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [versionPlayerCounts, setVersionPlayerCounts] = useState<Record<string, number>>({});
  const [showVersionPlayersDialog, setShowVersionPlayersDialog] = useState(false);
  const [selectedVersionPlayers, setSelectedVersionPlayers] = useState<{ version: string; players: any[] }>({ version: '', players: [] });
  
  // Voice chat state - only for incoming calls
  const [showIncomingCallDialog, setShowIncomingCallDialog] = useState(false);
  const [incomingCall, setIncomingCall] = useState<VoiceCall | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  
  const [newFriendOderId, setNewFriendOderId] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    sender_username: string;
    title: string;
    message: string;
    type: string;
    created_at: string;
  }>>([]);

  // Get current loader config - memoized
  const currentLoader = useMemo(() => LOADERS[activeLoader], [activeLoader]);
  const getMiscSelectionForVersionId = useCallback((versionId?: string | null) => {
    if (!versionId) return undefined;

    return customMiscSelections.find((item) => {
      const runtimeVersionId = getMiscSelectionVersionId(item);
      return (
        runtimeVersionId === versionId ||
        item.installedVersionId === versionId ||
        item.versionId === versionId
      );
    });
  }, [customMiscSelections]);

  const modManagerTheme = useMemo(() => {
    const versionLoader = activeLoader === "misc"
      ? "misc"
      : (versionDetails?.loader || activeLoader);
    return getModManagerTheme(versionLoader);
  }, [activeLoader, versionDetails]);

  const miscInstalledVersions = useMemo(() => {
    const installedModpackIds = new Set([...lapetusVersions, ...installedForgeVersions]);

    return customMiscSelections
      .map((item) => getMiscSelectionVersionId(item))
      .filter((versionId) => installedModpackIds.has(versionId));
  }, [customMiscSelections, lapetusVersions, installedForgeVersions]);

  // Get installed versions for current loader - memoized
  const currentInstalledVersions = useMemo(() => {
    let versions;
    switch (activeLoader) {
      case "vanilla": versions = installedVersions; break;
      case "forge": versions = installedForgeVersions; break;
      case "fabric": versions = fabricVersions; break;
      case "dragon": versions = dragonVersions; break;
      case "quilt": versions = quiltVersions; break;
      case "misc": versions = miscInstalledVersions; break;
      case "bedrock": versions = bedrockVersions; break;
      default: versions = installedVersions;
    }
    console.log('[CurrentInstalledVersions] activeLoader:', activeLoader, 'versions:', versions);
    return versions;
  }, [activeLoader, installedVersions, installedForgeVersions, fabricVersions, dragonVersions, quiltVersions, miscInstalledVersions, bedrockVersions]);

  // Get categories for current loader - memoized
  const currentCategories = useMemo(() => {
    let cats;
    switch (activeLoader) {
      case "vanilla": cats = categories; break;
      case "forge": cats = forgeCategories.length > 0 ? forgeCategories : categories; break;
      case "fabric": cats = fabricCategories.length > 0 ? fabricCategories : categories; break;
      case "dragon": cats = dragonCategories.length > 0 ? dragonCategories : categories; break;
      case "quilt": cats = quiltCategories.length > 0 ? quiltCategories : categories; break;
      case "misc": cats = groupMiscSelectionsByVersion(customMiscSelections); break;
      default: cats = categories;
    }
    console.log('[CurrentCategories] activeLoader:', activeLoader, 'categories:', cats.map(c => ({ id: c.id, versions: c.versions.length })));
    return cats;
  }, [activeLoader, categories, forgeCategories, fabricCategories, dragonCategories, quiltCategories, customMiscSelections]);

  useEffect(() => {
    try {
      localStorage.setItem(COUSTOM_STORAGE_KEY, JSON.stringify(customMiscSelections));
    } catch (error) {
      console.warn("[COUSTOM] Failed to persist misc selections:", error);
    }
  }, [customMiscSelections]);

  const getStoredVersionForLoader = (loader: LoaderType): string => {
    try {
      return (
        localStorage.getItem(getLastSelectedVersionKey(loader)) ||
        localStorage.getItem(getLastPlayedVersionKey(loader)) ||
        ""
      );
    } catch (error) {
      console.warn("[Version Persist] Failed to read stored version:", error);
      return "";
    }
  };

  const saveSelectedVersionForLoader = (loader: LoaderType, version: string) => {
    if (!version) return;
    try {
      localStorage.setItem(getLastSelectedVersionKey(loader), version);
    } catch (error) {
      console.warn("[Version Persist] Failed to save selected version:", error);
    }
  };

  const savePlayedVersionForLoader = (loader: LoaderType, version: string) => {
    if (!version) return;
    try {
      localStorage.setItem(getLastPlayedVersionKey(loader), version);
      localStorage.setItem(getLastSelectedVersionKey(loader), version);
    } catch (error) {
      console.warn("[Version Persist] Failed to save played version:", error);
    }
  };

  const installBannerPercent = useMemo(() => {
    return Math.round(Math.max(0, Math.min(100, installProgress)));
  }, [installProgress]);

  const isLoaderBusy = useMemo(
    () => (isInstalling || isLaunching) && (runningLoader === activeLoader || runningLoader === 'modpacks'),
    [isInstalling, isLaunching, runningLoader, activeLoader]
  );

  const bannerLineProgress = useMemo(() => {
    if (isInstalling) return installBannerPercent;
    if (isLaunching) return Math.round(Math.max(0, Math.min(100, launchProgress)));
    return 0;
  }, [isInstalling, isLaunching, installBannerPercent, launchProgress]);

  const handleLoaderSelect = useCallback((loader: LoaderType) => {
    setActiveLoader(loader);
    setSelectedCategory(null);

    let installedForLoader: string[] = [];
    let categoriesForLoader: VersionCategory[] = [];

    if (loader === "vanilla") {
      installedForLoader = installedVersions;
      categoriesForLoader = categories;
    } else if (loader === "forge") {
      installedForLoader = installedForgeVersions;
      categoriesForLoader = forgeCategories.length > 0 ? forgeCategories : categories;
    } else if (loader === "fabric") {
      installedForLoader = fabricVersions;
      categoriesForLoader = fabricCategories.length > 0 ? fabricCategories : categories;
    } else if (loader === "dragon") {
      installedForLoader = dragonVersions;
      categoriesForLoader = dragonCategories.length > 0 ? dragonCategories : categories;
    } else if (loader === "misc") {
      installedForLoader = miscInstalledVersions;
      categoriesForLoader = groupMiscSelectionsByVersion(customMiscSelections);
    } else if (loader === "quilt") {
      installedForLoader = quiltVersions;
      categoriesForLoader = quiltCategories.length > 0 ? quiltCategories : categories;
    } else if (loader === "lapetus") {
      installedForLoader = lapetusVersions;
      categoriesForLoader = categories;
    } else if (loader === "bedrock") {
      installedForLoader = bedrockVersions;
      categoriesForLoader = categories;
    }

    const storedVersion = getStoredVersionForLoader(loader);
    let newVersion = "";

    if (storedVersion && isVersionKnownForLoader(loader, storedVersion, installedForLoader, categoriesForLoader)) {
      newVersion = storedVersion;
    } else if (installedForLoader.length > 0) {
      newVersion = installedForLoader[0] || "";
    } else if (categoriesForLoader.length > 0 && categoriesForLoader[0].versions.length > 0) {
      newVersion = categoriesForLoader[0].versions[0];
    }

    if (loader === "dragon" && newVersion) {
      newVersion = resolveDragonVersionId(
        newVersion,
        dragonVersions,
        dragonCategories.flatMap((category) => category.versions.map((id) => ({ id })))
      );
    }

    if (newVersion) {
      setSelectedVersion(newVersion);
    }
    setActiveTab("home");
  }, [
    categories,
    forgeCategories,
    fabricCategories,
    dragonCategories,
    quiltCategories,
    installedVersions,
    installedForgeVersions,
    fabricVersions,
    dragonVersions,
    miscInstalledVersions,
    quiltVersions,
    lapetusVersions,
    bedrockVersions,
    customMiscSelections,
  ]);

  useEffect(() => {
    if (!selectedVersion) return;
    if (!isVersionKnownForLoader(activeLoader, selectedVersion, currentInstalledVersions, currentCategories)) {
      return;
    }
    saveSelectedVersionForLoader(activeLoader, selectedVersion);
  }, [activeLoader, selectedVersion, currentInstalledVersions, currentCategories]);

  // DEBUG: Log version and loader changes for mod installation debugging
  useEffect(() => {
    console.log(`[VERSION CHANGE] ========================================`);
    console.log(`[VERSION CHANGE] selectedVersion: "${selectedVersion}"`);
    console.log(`[VERSION CHANGE] activeLoader: "${activeLoader}"`);
    console.log(`[VERSION CHANGE] currentInstalledVersions:`, currentInstalledVersions.slice(0, 3));
    console.log(`[VERSION CHANGE] ========================================`);
  }, [selectedVersion, activeLoader, currentInstalledVersions]);

  // Load versions function - defined before useEffects that call it
  const loadVanillaVersionsData = async () => {
    try {
      console.log('[LoadVanilla] Starting to load vanilla versions...');
      
      const allVersions = await launcher.getVersions();
      
      console.log('[LoadVanilla] All versions loaded:', allVersions.length);
      console.log('[LoadVanilla] Sample versions:', allVersions.slice(0, 5).map((v: any) => v.id));
      
      const updatedCategories = VERSION_CATEGORIES.map(cat => {
        const matchingVersions = allVersions.filter((v: any) => matchesVanillaVersionCategory(v, cat.id));
        console.log(`[LoadVanilla] Category ${cat.id}: found ${matchingVersions.length} versions`);
        if (matchingVersions.length > 0) {
          console.log(`[LoadVanilla] Category ${cat.id} sample:`, matchingVersions.slice(0, 3).map((v: any) => v.id));
        }
        return {
          ...cat,
          versions: matchingVersions.map((v: any) => v.id)
        };
      });
      
      console.log('[LoadVanilla] Updated categories:', updatedCategories.map(c => ({ id: c.id, count: c.versions.length })));
      
      setCategories(updatedCategories);
      
      console.log('[LoadVanilla] Categories state updated successfully');
    } catch (error) {
      console.error("[LoadVanilla] Failed to load vanilla versions:", error);
      console.error("[LoadVanilla] Error details:", error instanceof Error ? error.message : String(error));
    }
  };

  const loadVersions = async () => {
    try {
      setIsLoading(true);
      console.log('[LoadVersions] Starting to load versions...');
      
      const [allVersions, installed, installedForge, installedFabric, installedQuilt, installedModpacks] = await Promise.all([
        launcher.getVersions(),
        launcher.getInstalledVersions(),
        launcher.getInstalledForgeVersions(),
        launcher.getInstalledFabricVersions(),
        launcher.getInstalledQuiltVersions(), // Load Quilt versions
        launcher.getInstalledModpackVersions(),
      ]);
      
      console.log('[LoadVersions] All versions loaded:', allVersions.length);
      console.log('[LoadVersions] Sample versions:', allVersions.slice(0, 5).map(v => v.id));
      
      setInstalledVersions(installed);
      setInstalledForgeVersions(installedForge);
      setFabricVersions(installedFabric);
      setLapetusVersions(installedModpacks);
      console.log('[Startup] Loaded installed modpack versions:', installedModpacks);
      
      // Set Quilt versions
      setQuiltVersions(installedQuilt);
      console.log('[Startup] Loaded installed Quilt versions:', installedQuilt);
      
      const storedVanillaVersion = getStoredVersionForLoader("vanilla");
      const hasStoredVanillaInstalled = storedVanillaVersion
        ? isInstalledForLoader("vanilla", storedVanillaVersion, installed)
        : false;
      const hasStoredVanillaAvailable = storedVanillaVersion
        ? allVersions.some((v) => normalizeVersionId(v.id) === normalizeVersionId(storedVanillaVersion))
        : false;

      if (storedVanillaVersion && (hasStoredVanillaInstalled || hasStoredVanillaAvailable)) {
        setSelectedVersion(storedVanillaVersion);
      } else if (installed.length > 0) {
        setSelectedVersion(installed[0]);
      } else {
        const latestRelease = allVersions.find(v => v.type === "release");
        if (latestRelease) setSelectedVersion(latestRelease.id);
      }
      
      // Also load vanilla categories on initial load
      const updatedCategories = VERSION_CATEGORIES.map(cat => {
        const matchingVersions = allVersions.filter(v => matchesVanillaVersionCategory(v, cat.id));
        return {
          ...cat,
          versions: matchingVersions.map(v => v.id)
        };
      });
      
      setCategories(updatedCategories);
      
      console.log('[LoadVersions] Initial load complete');
    } catch (error) {
      console.error("[LoadVersions] Failed to load versions:", error);
      console.error("[LoadVersions] Error details:", error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Update selectedCategory when categories change to ensure it has latest versions
  useEffect(() => {
    if (selectedCategory) {
      const updatedCategory = currentCategories.find(cat => cat.id === selectedCategory.id);
      if (updatedCategory) {
        console.log('[Category Sync] Updating selectedCategory:', updatedCategory.id, 'versions:', updatedCategory.versions.length);
        setSelectedCategory(updatedCategory);
      }
    }
  }, [currentCategories]);


  // Change wallpaper when loader or tier changes
  useEffect(() => {
    // For lapetus loader, use tier-based wallpaper
    if (activeLoader === 'lapetus') {
      if (tier.name === 'LEKIA') {
        setCurrentWallpaper(purpleImage);
      } else if (tier.name === 'SIOET') {
        setCurrentWallpaper(redImage);
      } else {
        setCurrentWallpaper(heroImage);
      }
    } else {
      // For other loaders, use their specific wallpapers
      setCurrentWallpaper(LOADER_WALLPAPERS[activeLoader]);
    }
  }, [activeLoader, tier.name]);

  // Reset category selection when loader changes
  useEffect(() => {
    setSelectedCategory(null);
    // Reset mod manager state
    setAllMods([]);
    setModSearchQuery("");
    setModSearchResults([]);
    setSelectedMod(null);
    setModVersions([]);
    setVersionDetails(null);
    setSelectedVersionForDetails(null);
    setActiveModFilter(null);
    // Reset mod browser state
    setModBrowserPage(1);
    setModBrowserTotalHits(0);
    setModBrowserSearchQuery("");
    setShowInstallMods(false);
    setShowMiscPanel(false);
    setMiscActiveTab("modpacks");
    setSelectedCoustomVersionId(null);
  }, [activeLoader]);

  useEffect(() => { 
    console.log('[INIT] Component mounted, calling loadVersions...');
    
    // Defer version loading slightly to allow UI to render first
    setTimeout(() => {
      loadVersions();
    }, 50);
  }, []);

  // Refresh installed versions when switching to versions tab
  useEffect(() => {
    if (activeTab === "versions") {
      console.log('[Tab Change] Switched to versions tab, refreshing installed versions...');
      const refreshInstalledVersions = async () => {
        try {
          const [installed, installedForge, installedFabric, installedDragon, installedQuilt, installedModpacks, gameVersions] = await Promise.all([
            launcher.getInstalledVersions(),
            launcher.getInstalledForgeVersions(),
            launcher.getInstalledFabricVersions(),
            launcher.getInstalledDragonVersions(),
            launcher.getInstalledQuiltVersions(),
            launcher.getInstalledModpackVersions(),
            launcher.getInstalledGameVersions(), // Modrinth-style
          ]);
          
          console.log('[Refresh] Raw installed versions:', {
            vanilla: installed,
            forge: installedForge,
            fabric: installedFabric,
            dragon: installedDragon,
            quilt: installedQuilt,
          });
          
          setInstalledVersions(installed);
          setInstalledForgeVersions(installedForge);
          setFabricVersions(installedFabric);
          setDragonVersions(installedDragon);
          setQuiltVersions(installedQuilt);
          setLapetusVersions(installedModpacks);
          setInstalledGameVersions(gameVersions); // Store game versions
          
          // Clear just installed ref if the version is no longer installed
          if (justInstalledVersionRef.current) {
            const allInstalled = [
              ...installed,
              ...installedForge,
              ...installedFabric,
              ...installedDragon,
              ...installedQuilt,
              ...installedModpacks,
            ];
            if (!allInstalled.includes(justInstalledVersionRef.current)) {
              console.log('[Refresh] Clearing justInstalledVersionRef - version was deleted');
              justInstalledVersionRef.current = null;
            }
          }
          
          console.log('[Tab Change] Refreshed installed versions:', {
            vanilla: installed.length,
            forge: installedForge.length,
            fabric: installedFabric.length,
            dragon: installedDragon.length,
            quilt: installedQuilt.length,
            modpacks: installedModpacks.length,
            gameVersions: gameVersions,
          });
        } catch (error) {
          console.error('[Tab Change] Failed to refresh installed versions:', error);
        }
      };
      refreshInstalledVersions();
      
      // Set up periodic refresh every 3 seconds while on versions tab
      const intervalId = setInterval(() => {
        console.log('[Auto Refresh] Checking for version changes...');
        refreshInstalledVersions();
      }, 3000);
      
      // Clean up interval when leaving versions tab
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [activeTab]);

  // Load active account on mount
  useEffect(() => {
    const loadAccount = async () => {
      try {
        const account = await launcher.getActiveAccount();
        await handleAccountChange(account);
      } catch (e) {
        console.error("Failed to load active account:", e);
      }
    };
    loadAccount();
  }, []);

  // Listen for account updates (e.g., skin changes)
  useEffect(() => {
    const handleAccountUpdate = async () => {
      try {
        console.log('[Launcher] Received accountUpdated event');
        // Prefer backend state because it's the source of truth for skin_username.
        const backendAccount = await launcher.getActiveAccount();
        if (backendAccount) {
          console.log('[Launcher] Loaded account from backend:', backendAccount);
          await handleAccountChange(backendAccount);
          return;
        }

        // Legacy fallback for older flows that only update localStorage.
        const currentAccountStr = localStorage.getItem('dragon_current_account');
        if (currentAccountStr) {
          const account = JSON.parse(currentAccountStr);
          console.log('[Launcher] Loaded account from localStorage:', account);
          await handleAccountChange(account);
        }
      } catch (e) {
        console.error("Failed to reload account:", e);
      }
    };

    window.addEventListener('accountUpdated', handleAccountUpdate);
    return () => window.removeEventListener('accountUpdated', handleAccountUpdate);
  }, []);

  // Keyboard shortcut for mod spotlight (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowModSpotlight(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load Forge/Fabric/Quilt/Lapetus/Modpacks versions when switching loaders
  useEffect(() => {
    // Reset modpacks page when switching loaders
    if (activeLoader === "modpacks" || activeLoader === "lapetus") {
      setModpacksPage(0);
    }
    
    if (activeLoader === "vanilla") {
      // Load vanilla versions
      console.log('[Loader Switch] Switched to Vanilla, loading versions...');
      loadVanillaVersionsData();
    } else if (activeLoader === "forge") {
      loadForgeVersionsData();
    } else if (activeLoader === "fabric") {
      loadFabricVersionsData();
    } else if (activeLoader === "dragon") {
      loadDragonVersionsData();
    } else if (activeLoader === "misc") {
      // Saved Misc entries are local state driven; no remote version lane to load here.
    } else if (activeLoader === "quilt") {
      loadQuiltVersionsData();
    } else if (activeLoader === "lapetus") {
      loadModpacksData(0); // Load modpacks instead of lapetus
    } else if (activeLoader === "modpacks") {
      loadModpacksData(0);
    } else if (activeLoader === "bedrock") {
      loadBedrockVersionsData();
    }
  }, [activeLoader]);

  // Load Xbox friends function
  const loadXboxFriends = async () => {
    // Prevent duplicate loads - check both ref and a session flag
    const sessionKey = `xbox_friends_loaded_${Date.now()}`;
    const lastLoadTime = sessionStorage.getItem('xbox_friends_last_load');
    const now = Date.now();
    
    // If loaded in the last 5 seconds, skip
    if (lastLoadTime && (now - parseInt(lastLoadTime)) < 5000) {
      console.log('[Xbox Friends] Recently loaded, skipping...');
      return;
    }
    
    if (isLoadingXboxFriends || xboxFriendsLoadedRef.current) {
      console.log('[Xbox Friends] Already loaded or loading, skipping...');
      return;
    }

    try {
      // Set Xbox friends loading state
      setIsLoadingXboxFriends(true);
      setIsLoadingCurrentProfile(true); // Always show skeleton while loading
      console.log('[Xbox Friends] Loading Xbox friends and current profile...');
      
      // Mark as loaded immediately to prevent race conditions
      xboxFriendsLoadedRef.current = true;
      sessionStorage.setItem('xbox_friends_last_load', now.toString());
      
      // Check if we have cached avatar
      const storageKey = `xbox_avatar_${activeAccount?.username}`;
      const cachedAvatar = localStorage.getItem(storageKey);
      
      // Get current user XUID for database lookup
      const currentXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
      
      // Load Xbox data and database profile in parallel
      const [xboxFriendsList, currentUserXboxProfile, dbProfile] = await Promise.all([
        launcher.getXboxFriends().catch(err => {
          console.error('[Xbox Friends] Error loading Xbox friends:', err);
          return [];
        }),
        activeAccount
          ? launcher.getCurrentXboxProfile().catch(err => {
              console.error('[Xbox Profile] Failed to get current user Xbox profile:', err);
              return null;
            })
          : Promise.resolve(null),
        // Silently fetch profile from dragon_users database
        currentXuid
          ? (async () => {
              try {
                console.log('[Profile Preload] Fetching profile for XUID:', currentXuid);
                console.log('[Profile Preload] Active account username:', activeAccount?.username);
                
                const { data, error } = await supabase
                  .from('dragon_users')
                  .select('avatar_url, gamertag, real_name, gamerscore, xuid')
                  .eq('xuid', currentXuid)
                  .single();
                
                if (error) {
                  console.error('[Profile Preload] Error fetching profile:', error);
                  return null;
                }
                
                if (data) {
                  console.log('[Profile Preload] Loaded profile from database:', {
                    gamertag: data.gamertag,
                    xuid: data.xuid,
                    avatar_url: data.avatar_url?.substring(0, 50) + '...'
                  });
                  
                  // CRITICAL CHECK: Verify the gamertag matches the active account
                  if (activeAccount?.username && data.gamertag !== activeAccount.username) {
                    console.error('[Profile Preload] MISMATCH! Database gamertag:', data.gamertag, 'Active account:', activeAccount.username);
                    console.error('[Profile Preload] XUID in localStorage is WRONG! It belongs to:', data.gamertag);
                    return null;
                  }
                }
                return data;
              } catch (err) {
                console.log('[Profile Preload] No database profile found (non-critical)');
                return null;
              }
            })()
          : Promise.resolve(null)
      ]);
      
      console.log('[Xbox Friends] Loaded:', xboxFriendsList);
      
      // Fetch online status from Supabase for all friends with smart detection
      if (xboxFriendsList.length > 0) {
        const friendXuids = xboxFriendsList.map(f => f.xuid);
        const { data: onlineStatuses } = await supabase
          .from('dragon_users')
          .select('xuid, is_online, last_seen, current_game, game_version, loader, server_ip, world_name')
          .in('xuid', friendXuids);
        
        // Smart online detection: Check if last_seen is within 30 seconds (2x heartbeat interval)
        const now = new Date().getTime();
        const ONLINE_THRESHOLD = 30000; // 30 seconds
        
        // Merge online status and activity with Xbox friends
        const friendsWithStatus = xboxFriendsList.map(friend => {
          const status = onlineStatuses?.find(s => s.xuid === friend.xuid);
          let isActuallyOnline = false;
          
          // Check ONLY last_seen timestamp, ignore is_online flag
          // This ensures accurate detection even if cleanup didn't run
          if (status && status.last_seen) {
            const lastSeenTime = new Date(status.last_seen).getTime();
            const timeSinceLastSeen = now - lastSeenTime;
            isActuallyOnline = timeSinceLastSeen < ONLINE_THRESHOLD;
            
            if (!isActuallyOnline && status.is_online) {
              console.log(`[Online Detection] ${friend.gamertag} marked offline (last seen ${Math.round(timeSinceLastSeen / 1000)}s ago, db says online)`);
            }
          }
          
          return {
            ...friend,
            is_online: isActuallyOnline,
            current_game: isActuallyOnline ? (status?.current_game || null) : null,
            game_version: isActuallyOnline ? (status?.game_version || null) : null,
            loader: isActuallyOnline ? (status?.loader || null) : null,
            server_ip: isActuallyOnline ? (status?.server_ip || null) : null,
            world_name: isActuallyOnline ? (status?.world_name || null) : null
          };
        });
        
        console.log('[Xbox Friends] Merged with smart online detection');
        setXboxFriends(friendsWithStatus);
      } else {
        setXboxFriends(xboxFriendsList);
      }
      
      // Set profile from cache immediately if available
      if (cachedAvatar && !currentUserProfile?.avatar_url) {
        console.log('[Xbox Profile] Using cached avatar:', cachedAvatar);
        setCurrentUserProfile(prev => ({
          ...prev,
          avatar_url: cachedAvatar
        }));
      }
      
      // Update with database profile if available (silent background load)
      if (dbProfile?.avatar_url && !currentUserXboxProfile?.display_pic_raw) {
        console.log('[Profile Preload] Using database avatar as fallback');
        setCurrentUserProfile(prev => ({
          ...prev,
          avatar_url: dbProfile.avatar_url
        }));
      }
      
      // Update with fresh profile from Xbox if available (highest priority)
      if (currentUserXboxProfile?.display_pic_raw) {
        console.log('[Xbox Profile] Setting Xbox avatar for current user:', currentUserXboxProfile.display_pic_raw);
        
        // Save to localStorage for persistence
        localStorage.setItem(storageKey, currentUserXboxProfile.display_pic_raw);
        
        setCurrentUserProfile(prev => ({
          ...prev,
          avatar_url: currentUserXboxProfile.display_pic_raw
        }));
      }

      // Mark as loaded
      xboxFriendsLoadedRef.current = true;
    } catch (error) {
      console.error('[Xbox] Error loading Xbox data:', error);
      setXboxFriends([]);
    } finally {
      // Clear both loading states
      setIsLoadingXboxFriends(false);
      setIsLoadingCurrentProfile(false);
    }
  };

  // Search Dragon Launcher users function
  const searchDragonUsers = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      console.log('[Dragon Search] Searching for:', query);
      
      // Get current user XUID to exclude from results
      const currentUserXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
      
      // Search Dragon Launcher users in Supabase
      const { searchDragonUsers } = await import("@/lib/friendsService");
      const results = await searchDragonUsers(query.trim(), currentUserXuid || undefined);
      console.log('[Dragon Search] Found Dragon users:', results);
      
      // Results already have avatar_url and profile info from dragon_users table
      setSearchResults(results);
    } catch (error) {
      console.error('[Dragon Search] Error searching Dragon users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (newFriendOderId && newFriendOderId.trim().length >= 2) {
        searchDragonUsers(newFriendOderId);
      } else {
        setSearchResults([]);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [newFriendOderId]);

  // Function to fetch and cache Xbox avatar for a user
  const fetchAndCacheXboxAvatar = async (username: string) => {
    try {
      const storageKey = `xbox_avatar_${username}`;
      const cached = localStorage.getItem(storageKey);
      
      // Return cached if available
      if (cached) {
        return cached;
      }
      
      // Search for the user on Xbox
      const results = await launcher.searchXboxUsers(username);
      if (results.length > 0 && results[0].display_pic_raw) {
        const avatarUrl = results[0].display_pic_raw;
        localStorage.setItem(storageKey, avatarUrl);
        return avatarUrl;
      }
      
      return null;
    } catch (error) {
      console.error('[Xbox Avatar] Failed to fetch avatar for', username, error);
      return null;
    }
  };

  // Load Xbox friends when Add Friend dialog opens (on-demand only)
  useEffect(() => {
    if (showAddFriendDialog && !xboxFriendsLoadedRef.current) {
      console.log('[Add Friend Dialog] Dialog opened, loading Xbox friends...');
      loadXboxFriends();
    }
  }, [showAddFriendDialog]);

  // Heartbeat to update online status in Supabase
  useEffect(() => {
    const currentXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
    if (!currentXuid) return;

    // Set user as online immediately with timestamp
    const setOnline = async () => {
      try {
        await supabase
          .from('dragon_users')
          .update({ 
            is_online: true,
            last_seen: new Date().toISOString()
          })
          .eq('xuid', currentXuid);
        console.log('[Heartbeat] Set user online with timestamp');
      } catch (err) {
        console.error('[Heartbeat] Failed to set online:', err);
      }
    };

    setOnline();

    // Update online status every 15 seconds (more frequent for better accuracy)
    const heartbeatInterval = setInterval(setOnline, 15000);

    // Set offline and clear activity when component unmounts or window closes
    const setOffline = async () => {
      try {
        await supabase
          .from('dragon_users')
          .update({ 
            is_online: false,
            current_game: null,
            game_version: null,
            loader: null,
            server_ip: null,
            world_name: null,
            last_seen: new Date().toISOString()
          })
          .eq('xuid', currentXuid);
        console.log('[Heartbeat] Set user offline and cleared activity');
      } catch (err) {
        console.error('[Heartbeat] Failed to set offline:', err);
      }
    };

    // Also set offline on visibility change (when app is hidden/minimized for too long)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched away from app - don't set offline immediately
        console.log('[Heartbeat] App hidden, heartbeat will continue');
      } else {
        // User came back - send heartbeat immediately
        console.log('[Heartbeat] App visible again, sending heartbeat');
        setOnline();
      }
    };

    window.addEventListener('beforeunload', setOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', setOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setOffline();
    };
  }, []);

  // Real-time friend activity updates using Supabase Realtime
  useEffect(() => {
    if (xboxFriends.length === 0) return;

    const friendXuids = xboxFriends.map(f => f.xuid);
    
    // Initial fetch
    const refreshFriendActivity = async () => {
      try {
        const { data: activityData } = await supabase
          .from('dragon_users')
          .select('xuid, is_online, last_seen, current_game, game_version, loader, server_ip, world_name')
          .in('xuid', friendXuids);
        
        if (activityData) {
          const now = new Date().getTime();
          const ONLINE_THRESHOLD = 30000; // 30 seconds
          
          setXboxFriends(prev => prev.map(friend => {
            const activity = activityData.find(a => a.xuid === friend.xuid);
            if (activity) {
              let isActuallyOnline = false;
              
              // Check ONLY last_seen timestamp, ignore is_online flag
              if (activity.last_seen) {
                const lastSeenTime = new Date(activity.last_seen).getTime();
                const timeSinceLastSeen = now - lastSeenTime;
                isActuallyOnline = timeSinceLastSeen < ONLINE_THRESHOLD;
              }
              
              return {
                ...friend,
                is_online: isActuallyOnline,
                current_game: isActuallyOnline ? activity.current_game : null,
                game_version: isActuallyOnline ? activity.game_version : null,
                loader: isActuallyOnline ? activity.loader : null,
                server_ip: isActuallyOnline ? activity.server_ip : null,
                world_name: isActuallyOnline ? activity.world_name : null
              };
            }
            return friend;
          }));
          console.log('[Friend Activity] Initial activity loaded');
        }
      } catch (err) {
        console.error('[Friend Activity] Failed to fetch:', err);
      }
    };

    refreshFriendActivity();

    // Subscribe to real-time changes for friend activity
    const channel = supabase
      .channel('friend-activity-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dragon_users',
          filter: `xuid=in.(${friendXuids.join(',')})`
        },
        (payload) => {
          console.log('[Friend Activity] Real-time update received:', payload.new);
          const updatedUser = payload.new as any;
          
          const now = new Date().getTime();
          const ONLINE_THRESHOLD = 30000; // 30 seconds
          
          setXboxFriends(prev => prev.map(friend => {
            if (friend.xuid === updatedUser.xuid) {
              let isActuallyOnline = false;
              
              // Check ONLY last_seen timestamp, ignore is_online flag
              if (updatedUser.last_seen) {
                const lastSeenTime = new Date(updatedUser.last_seen).getTime();
                const timeSinceLastSeen = now - lastSeenTime;
                isActuallyOnline = timeSinceLastSeen < ONLINE_THRESHOLD;
              }
              
              return {
                ...friend,
                is_online: isActuallyOnline,
                current_game: isActuallyOnline ? updatedUser.current_game : null,
                game_version: isActuallyOnline ? updatedUser.game_version : null,
                loader: isActuallyOnline ? updatedUser.loader : null,
                server_ip: isActuallyOnline ? updatedUser.server_ip : null,
                world_name: isActuallyOnline ? updatedUser.world_name : null
              };
            }
            return friend;
          }));
        }
      )
      .subscribe();

    console.log('[Friend Activity] Subscribed to real-time updates for', friendXuids.length, 'friends');

    return () => {
      supabase.removeChannel(channel);
      console.log('[Friend Activity] Unsubscribed from real-time updates');
    };
  }, [xboxFriends.length]); // Only re-run when friend count changes

  // Update selectedFriend when xboxFriends data changes (for real-time activity updates in profile)
  useEffect(() => {
    if (!selectedFriend || selectedFriend.id === 'current-user') return;
    
    const updatedFriend = xboxFriends.find(f => f.xuid === selectedFriend.id);
    if (!updatedFriend) return;
    
    // Only update if values actually changed to prevent infinite loops
    const hasChanges = 
      selectedFriend.is_online !== updatedFriend.is_online ||
      selectedFriend.current_game !== updatedFriend.current_game ||
      selectedFriend.game_version !== updatedFriend.game_version ||
      selectedFriend.loader !== updatedFriend.loader ||
      selectedFriend.server_ip !== updatedFriend.server_ip ||
      selectedFriend.world_name !== updatedFriend.world_name;
    
    if (hasChanges) {
      console.log('[Selected Friend] Real-time update detected:', {
        username: updatedFriend.gamertag,
        game_version: updatedFriend.game_version,
        loader: updatedFriend.loader,
        current_game: updatedFriend.current_game
      });
      setSelectedFriend(prev => ({
        ...prev,
        is_online: updatedFriend.is_online,
        current_game: updatedFriend.current_game,
        game_version: updatedFriend.game_version,
        loader: updatedFriend.loader,
        server_ip: updatedFriend.server_ip,
        world_name: updatedFriend.world_name
      }));
    }
  }, [xboxFriends, selectedFriend]);

  // Real-time updates for current user's profile when viewing own profile
  useEffect(() => {
    const currentXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
    if (!currentXuid) return;

    const channel = supabase
      .channel('current-user-profile-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dragon_users',
          filter: `xuid=eq.${currentXuid}`
        },
        (payload) => {
          console.log('[Current User] Real-time profile update:', payload.new);
          const updatedProfile = payload.new as any;
          
          // Update currentUserProfile state
          setCurrentUserProfile(updatedProfile);
          
          // If viewing own profile, update selectedFriend too
          if (selectedFriend && selectedFriend.id === 'current-user') {
            setSelectedFriend(prev => ({
              ...prev,
              current_game: updatedProfile.current_game,
              game_version: updatedProfile.game_version,
              loader: updatedProfile.loader,
              server_ip: updatedProfile.server_ip,
              world_name: updatedProfile.world_name,
              bio: updatedProfile.bio,
              avatar_url: updatedProfile.avatar_url,
              banner_url: updatedProfile.banner_url
            }));
            console.log('[Current User Profile] Updated in dialog:', {
              game_version: updatedProfile.game_version,
              loader: updatedProfile.loader
            });
          }
        }
      )
      .subscribe();

    console.log('[Current User] Subscribed to profile updates');

    return () => {
      supabase.removeChannel(channel);
      console.log('[Current User] Unsubscribed from profile updates');
    };
  }, [selectedFriend?.id]);

  // Debug: Log selectedFriend changes
  useEffect(() => {
    if (selectedFriend) {
      console.log('[Profile Dialog] selectedFriend updated:', {
        id: selectedFriend.id,
        username: selectedFriend.username,
        game_version: selectedFriend.game_version,
        loader: selectedFriend.loader,
        current_game: selectedFriend.current_game,
        is_online: selectedFriend.is_online
      });
      console.log('[Profile Dialog] Should show Playing section:', !!(selectedFriend.game_version && selectedFriend.loader));
    }
  }, [selectedFriend]);

  // Fetch version player counts from Supabase every 30 seconds
  useEffect(() => {
    const fetchVersionPlayerCounts = async () => {
      try {
        // Get all users currently playing (where game_version is not null AND actually online)
        const { data: playingUsers } = await supabase
          .from('dragon_users')
          .select('game_version, last_seen')
          .not('game_version', 'is', null)
          .not('game_version', 'eq', '');
        
        if (playingUsers) {
          // Filter to only include users who are actually online (last_seen within 30 seconds)
          const now = new Date().getTime();
          const ONLINE_THRESHOLD = 30000; // 30 seconds
          
          const onlineUsers = playingUsers.filter(user => {
            if (!user.last_seen) return false;
            const lastSeenTime = new Date(user.last_seen).getTime();
            const timeSinceLastSeen = now - lastSeenTime;
            return timeSinceLastSeen < ONLINE_THRESHOLD;
          });
          
          // Count players per version (group by major.minor, e.g., "1.21.1" -> "1.21")
          const counts: Record<string, number> = {};
          onlineUsers.forEach(user => {
            if (user.game_version) {
              // Extract major.minor version (e.g., "1.21.1" -> "1.21")
              const parts = user.game_version.split('.');
              if (parts.length >= 2) {
                const majorMinor = `${parts[0]}.${parts[1]}`;
                counts[majorMinor] = (counts[majorMinor] || 0) + 1;
              }
            }
          });
          
          setVersionPlayerCounts(counts);
          console.log('[Version Player Counts] Updated:', counts);
        }
      } catch (err) {
        console.error('[Version Player Counts] Failed to fetch:', err);
      }
    };

    // Fetch immediately on mount
    fetchVersionPlayerCounts();

    // Refresh every 30 seconds
    const countsInterval = setInterval(fetchVersionPlayerCounts, 30000);

    return () => {
      clearInterval(countsInterval);
    };
  }, []); // Run once on mount

  // Refresh version players dialog every 10 seconds while open
  useEffect(() => {
    if (!showVersionPlayersDialog || !selectedVersionPlayers.version) return;

    const refreshPlayers = async () => {
      const players = await fetchVersionPlayers(selectedVersionPlayers.version);
      setSelectedVersionPlayers(prev => ({ ...prev, players }));
      console.log('[Version Players Dialog] Refreshed player list');
    };

    // Refresh every 10 seconds while dialog is open
    const refreshInterval = setInterval(refreshPlayers, 10000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [showVersionPlayersDialog, selectedVersionPlayers.version]);

  // Initialize voice chat - listen for incoming calls via Supabase
  useEffect(() => {
    // Only initialize if we have an active account
    if (!activeAccount) return;
    
    const currentXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
    if (!currentXuid) return;

    console.log('[Voice Chat] Setting up incoming call listener for:', currentXuid);

    // Subscribe to incoming call signals
    const channel = supabase.channel(`voice_call_${currentXuid}`)
      .on('broadcast', { event: 'call_signal' }, async (payload: any) => {
        const signal = payload.payload;
        console.log('[Voice Chat] Received signal:', signal.type, 'from:', signal.callerId);
        
        // Only show incoming call dialog for call_offer AND only if we're not the caller
        if (signal.type === 'call_offer' && signal.callerId !== currentXuid) {
          console.log('[Voice Chat] Incoming call from:', signal.callerName);
          setIncomingCall({
            callId: signal.callId || `call_${Date.now()}`,
            callerId: signal.callerId,
            callerName: signal.callerName,
            receiverId: currentXuid,
            receiverName: activeAccount.username,
            state: 'ringing'
          });
          setShowIncomingCallDialog(true);
        }
      })
      .subscribe((status) => {
        console.log('[Voice Chat] Channel status:', status);
      });

    return () => {
      console.log('[Voice Chat] Cleaning up channel');
      channel.unsubscribe();
    };
  }, [activeAccount]);

  // Fetch friends from Supabase
  // Load friends and set up real-time subscriptions
  const previousOderIdRef = useRef<string | null>(null);
  // Helper function to get fresh oder_id from localStorage
  const getCurrentOderId = () => {
    const stored = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
    
    // If we have a lap_ format but active account is Xbox, something went wrong
    // Force re-fetch of XUID
    if (stored && stored.startsWith('lap_') && activeAccount?.refresh_token) {
      console.warn('[getCurrentOderId] Found lap_ format for Xbox account, this should not happen!');
      console.warn('[getCurrentOderId] Returning lap_ value but this needs investigation:', stored);
    }
    
    return stored;
  };
  
  useEffect(() => {
    const currentOderId = getCurrentOderId(); // Get fresh value inside useEffect
    const currentUsername = activeAccount?.username;
    
    console.log('[Friends] Effect triggered - Current user:', currentUsername, '(', currentOderId, ')');
    console.log('[Friends] Previous oder_id:', previousOderIdRef.current);
    console.log('[Friends] Active account:', activeAccount);
    
    // Don't run until activeAccount is loaded (prevents premature reset on initial load)
    if (!activeAccount) {
      console.log('[Friends] Waiting for activeAccount to be set...');
      return;
    }
    
    // Reset state immediately when account changes or is cleared
    if (!currentOderId) {
      console.warn('[Friends] No oder_id found, resetting friends state');
      setFriends([]);
      setPendingRequests([]);
      setCurrentUserProfile(null);
      setXboxFriends([]);
      xboxFriendsLoadedRef.current = false;
      previousOderIdRef.current = null;
      return;
    }

    // ALWAYS clear friends if switching to a different account (including first load)
    if (previousOderIdRef.current !== currentOderId) {
      console.log('[Friends] Account changed or first load');
      console.log('[Friends] Switching from', previousOderIdRef.current, 'to', currentOderId);
      
      // Check if friends are already loaded (from preload)
      const alreadyLoaded = xboxFriends.length > 0 || friends.length > 0;
      
      if (alreadyLoaded && previousOderIdRef.current === null) {
        console.log('[Friends] First load but friends already preloaded, keeping them');
        previousOderIdRef.current = currentOderId;
        return; // Don't reload, friends are already there from preload
      }
      
      console.log('[Friends] Clearing old friends data and reloading');
      setFriends([]);
      setPendingRequests([]);
      setXboxFriends([]);
      setCurrentUserProfile(null);
      xboxFriendsLoadedRef.current = false; // Reset Xbox friends loaded flag
      setIsLoadingFriends(true);
      
      // Update the ref to current oder_id
      previousOderIdRef.current = currentOderId;
    } else {
      console.log('[Friends] Same account, keeping existing friends');
      // Don't reload friends, just update the ref
      previousOderIdRef.current = currentOderId;
      return; // Exit early, don't reload friends
    }

    const loadFriendsData = async () => {
      try {
        setIsLoadingFriends(true);
        
        console.log('[Friends] Loading Xbox friends...');
        
        // Check if we have preloaded friends from startup
        const preloadedFriendsStr = localStorage.getItem('preloaded_friends');
        const preloadedTimestamp = localStorage.getItem('preloaded_friends_timestamp');
        const now = Date.now();
        
        let xboxFriendsList;
        
        // Use preloaded friends if they're fresh (less than 30 seconds old)
        if (preloadedFriendsStr && preloadedTimestamp) {
          const age = now - parseInt(preloadedTimestamp);
          if (age < 30000) { // 30 seconds
            console.log('[Friends] Using preloaded friends from startup (age:', Math.round(age / 1000), 'seconds)');
            xboxFriendsList = JSON.parse(preloadedFriendsStr);
            // Clear the preloaded data so it's not used again
            localStorage.removeItem('preloaded_friends');
            localStorage.removeItem('preloaded_friends_timestamp');
          } else {
            console.log('[Friends] Preloaded friends too old, fetching fresh');
            xboxFriendsList = await launcher.getXboxFriends();
          }
        } else {
          console.log('[Friends] No preloaded friends, fetching from Xbox');
          xboxFriendsList = await launcher.getXboxFriends();
        }
        
        console.log('[Friends] Loaded Xbox friends:', xboxFriendsList);
        setFriends(xboxFriendsList);
        
        // Sync Xbox Live friend requests to Supabase xuid_store
        // This automatically detects new friend requests from Xbox Live and stores them
        try {
          console.log('[Friends] Syncing Xbox Live friend requests to Supabase...');
          const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
          const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";
          
          const newlyStored = await launcher.syncXboxFriendRequestsToSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
          
          if (newlyStored.length > 0) {
            console.log('[Friends] ✓ Synced', newlyStored.length, 'new friend requests from Xbox Live');
          } else {
            console.log('[Friends] No new friend requests to sync');
          }
        } catch (syncError) {
          console.warn('[Friends] Failed to sync Xbox friend requests (non-critical):', syncError);
        }
        
        // Load pending friend requests from xuid_store
        try {
          console.log('[Friends] Fetching pending requests from dragon_users for XUID:', currentOderId);
          
          const { getPendingXboxRequests } = await import("@/lib/friendsService");
          const pendingRequestsList = await getPendingXboxRequests(currentOderId);
          
          console.log('[Friends] Loaded pending requests from dragon_users:', pendingRequestsList);
          
          if (!pendingRequestsList || pendingRequestsList.length === 0) {
            setPendingRequests([]);
            return;
          }
          
          // Get sender XUIDs from the requests
          const senderXuids = pendingRequestsList.map(req => req.sender_xuid);
          console.log('[Friends] Fetching profiles for sender XUIDs:', senderXuids);
          
          // Fetch profiles from dragon_users table (cached data)
          const { data: senderProfiles, error: profilesError } = await supabase
            .from('dragon_users')
            .select('xuid, gamertag, avatar_url, real_name, gamerscore')
            .in('xuid', senderXuids);
          
          if (profilesError) {
            console.error('[Friends] Error fetching sender profiles:', profilesError);
            setPendingRequests([]);
            return;
          }
          
          console.log('[Friends] Fetched sender profiles from dragon_users:', senderProfiles);
          
          // Map profiles to pending requests
          const pendingWithProfiles = pendingRequestsList.map(request => {
            const profile = senderProfiles?.find(p => p.xuid === request.sender_xuid);
            
            if (profile) {
              return {
                gamertag: profile.gamertag,
                xuid: profile.xuid,
                display_pic_raw: profile.avatar_url,
                real_name: profile.real_name,
                gamerscore: profile.gamerscore
              };
            }
            
            // Fallback: use stored gamertag or create basic profile
            return {
              gamertag: request.sender_gamertag || `User_${request.sender_xuid.substring(0, 8)}`,
              xuid: request.sender_xuid,
              display_pic_raw: null,
              real_name: null,
              gamerscore: null,
            };
          });
          
          console.log('[Friends] Pending requests with profiles:', pendingWithProfiles);
          setPendingRequests(pendingWithProfiles);
        } catch (error) {
          console.error('[Friends] Error loading pending requests:', error);
          setPendingRequests([]);
        }
        
        // Note: User status is now tracked in dragon_users table, updated during registration
        console.log('[Friends] Loaded friends and pending requests successfully');
      } catch (error) {
        console.error('[Friends] Error loading Xbox friends:', error);
        // Don't clear pending requests on error - they loaded successfully
        setFriends([]);
      } finally {
        setIsLoadingFriends(false);
      }
    };

    loadFriendsData();

    // Set up periodic sync for Xbox Live friend requests (every 30 seconds)
    const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";
    
    const syncInterval = setInterval(async () => {
      if (!currentOderId || !activeAccount?.refresh_token) {
        return;
      }
      
      try {
        console.log('[Friends] Periodic sync: Checking for new Xbox Live friend requests...');
        const newlyStored = await launcher.syncXboxFriendRequestsToSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        if (newlyStored.length > 0) {
          console.log('[Friends] ✓ Periodic sync: Found', newlyStored.length, 'new friend requests!');
          
          // Reload pending requests to show the new ones
          const { getPendingXboxRequests } = await import("@/lib/friendsService");
          const pendingRequestsList = await getPendingXboxRequests(currentOderId);
          
          // Clean up any requests with lap_ format XUIDs
          const validRequests = pendingRequestsList.filter(req => {
            if (req.sender_xuid.startsWith('lap_') || req.receiver_xuid.startsWith('lap_')) {
              console.warn('[Friends] Periodic sync: Found invalid request with lap_ XUID, skipping:', req);
              return false;
            }
            return true;
          });
          
          if (validRequests && validRequests.length > 0) {
            const senderXuids = validRequests.map(req => req.sender_xuid);
            const senderProfiles = await launcher.getXboxProfilesByXuids(senderXuids);
            
            const pendingWithProfiles = validRequests.map(request => {
              const profile = senderProfiles.find(p => p.xuid === request.sender_xuid);
              return profile || {
                gamertag: request.sender_gamertag || `User_${request.sender_xuid.substring(0, 8)}`,
                xuid: request.sender_xuid,
                display_pic_raw: null,
                real_name: null,
                gamerscore: null,
              };
            });
            
            setPendingRequests(pendingWithProfiles);
            console.log('[Friends] ✓ Updated pending requests UI');
          }
        }
      } catch (error) {
        console.warn('[Friends] Periodic sync failed (non-critical):', error);
      }
    }, 120000); // Sync every 2 minutes (reduced from 30 seconds to avoid rate limits)

    // Update user status to offline on unmount
    return () => {
      console.log('[Friends] Cleanup: checking if account actually changed');
      const newOderId = getCurrentOderId();
      
      // Only clear friends if the account actually changed (different oder_id)
      if (newOderId !== currentOderId) {
        console.log('[Friends] Account changed, clearing friends and going offline');
        clearInterval(syncInterval);
        updateUserStatus(currentOderId, currentUsername, false, null, null, null, null, null, null);
        setFriends([]);
        setPendingRequests([]);
      } else {
        console.log('[Friends] Same account, keeping friends (just clearing interval)');
        clearInterval(syncInterval);
      }
    };
  }, [activeAccount]); // Only trigger when activeAccount changes

  // Load current user profile
  useEffect(() => {
    const loadCurrentUserProfile = async () => {
      const currentOderId = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
      
      console.log('[Profile Load] Starting profile load for oder_id:', currentOderId, 'username:', activeAccount?.username);
      
      // Reset profile immediately if no account
      if (!currentOderId || !activeAccount) {
        console.log('[Profile] No account, resetting profile');
        setCurrentUserProfile(null);
        setEditBio('');
        setEditBannerUrl('');
        setEditAvatarUrl('');
        return;
      }
      
      // Reset edit states before loading new profile
      setEditBio('');
      setEditBannerUrl('');
      setEditAvatarUrl('');
      
      try {
        const profile = await getUserProfile(currentOderId);
        console.log('[Profile] Loaded profile for', currentOderId, ':', profile);
        console.log('[Profile] Avatar URL:', profile?.avatar_url);
        console.log('[Profile] Banner URL:', profile?.banner_url);
        setCurrentUserProfile(profile);
      } catch (error) {
        console.error('[Profile] Error loading current user profile:', error);
        setCurrentUserProfile(null);
      }
    };
    
    loadCurrentUserProfile();
  }, [activeAccount]);

  // Fetch notifications for current user
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const currentOderId = localStorage.getItem('lapetus_oder_id');
        if (!currentOderId) return;

        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/notifications?recipient_oder_id=eq.${currentOderId}&read=eq.false&order=created_at.desc`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) {
            // Check for new notifications we haven't shown yet
            const shownNotifIds = JSON.parse(localStorage.getItem('lapetus_shown_notifs') || '[]');

            for (const notif of data) {
              if (notif.type === 'game_invite' && !shownNotifIds.includes(notif.id)) {
                // Send native OS notification (macOS/Windows)
                try {
                  const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');

                  let permissionGranted = await isPermissionGranted();
                  if (!permissionGranted) {
                    const permission = await requestPermission();
                    permissionGranted = permission === 'granted';
                  }

                  if (permissionGranted) {
                    await sendNotification({
                      title: notif.title || "Hey what's up! 👋",
                      body: notif.message || `${notif.sender_username} is calling you to play in Resonance!`
                    });
                  }
                } catch (error) {
                  console.error('Tauri notification failed, trying browser:', error);
                  // Fallback to browser notification
                  if (Notification.permission === 'granted') {
                    new Notification(notif.title || "Hey what's up! 👋", {
                      body: notif.message || `${notif.sender_username} is calling you to play in Resonance!`,
                      icon: '/NewIcons.svg'
                    });
                  } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission();
                  }
                }

                // Mark as shown
                shownNotifIds.push(notif.id);
                localStorage.setItem('lapetus_shown_notifs', JSON.stringify(shownNotifIds));
              }
            }

            setNotifications(data);
          }
        }
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    fetchNotifications();

    // Check for notifications every 5 seconds
    const notifInterval = setInterval(fetchNotifications, 5000);

    return () => {
      clearInterval(notifInterval);
    };
  }, []);

  // Update selected version when loader changes
  useEffect(() => {
    console.log("[Loader Change] Active loader:", activeLoader);
    console.log("[Loader Change] Current installed versions:", currentInstalledVersions);
    console.log("[Loader Change] Current selectedVersion:", selectedVersion);
    console.log("[Loader Change] Just installed version:", justInstalledVersionRef.current);

    // If we just installed a version, don't auto-select - keep the installed version selected
    if (justInstalledVersionRef.current) {
      console.log("[Loader Change] Skipping auto-selection - keeping just installed version:", justInstalledVersionRef.current);
      return;
    }

    // Keep current selection if it is still valid for this loader
    if (
      selectedVersion &&
      isVersionKnownForLoader(activeLoader, selectedVersion, currentInstalledVersions, currentCategories)
    ) {
      console.log("[Loader Change] Current selection is valid, keeping it:", selectedVersion);
      return;
    }

    // Try persisted version (last selected/played) for this loader
    const storedVersion = getStoredVersionForLoader(activeLoader);
    if (
      storedVersion &&
      isVersionKnownForLoader(activeLoader, storedVersion, currentInstalledVersions, currentCategories)
    ) {
      if (selectedVersion !== storedVersion) {
        console.log("[Loader Change] Restoring stored version:", storedVersion);
        setSelectedVersion(storedVersion);
      }
      return;
    }

    if (currentInstalledVersions.length > 0) {
      // For modpacks (lapetus loader), select the LATEST version (highest MC version)
      // For other loaders, select the first version
      let versionToSelect = currentInstalledVersions[0];

      if (activeLoader === 'lapetus') {
        // Sort versions by Minecraft version to get the latest
        const sortedVersions = [...currentInstalledVersions].sort((a, b) => {
          // Extract MC version from version ID (e.g., "modpack-1.21.1" -> "1.21.1")
          const aVersion = a.split('-').pop() || '';
          const bVersion = b.split('-').pop() || '';

          const aParts = aVersion.split('.').map(Number);
          const bParts = bVersion.split('.').map(Number);

          for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aNum = aParts[i] || 0;
            const bNum = bParts[i] || 0;
            if (aNum !== bNum) return bNum - aNum; // Descending (latest first)
          }
          return 0;
        });

        versionToSelect = sortedVersions[0];
        console.log("[Loader Change] Sorted versions (latest first):", sortedVersions);
      }

      console.log("[Loader Change] Selecting version:", versionToSelect);
      if (selectedVersion !== versionToSelect) {
        setSelectedVersion(versionToSelect);
      }
    } else {
      // No installed versions, select first available from categories
      if (currentCategories.length > 0 && currentCategories[0].versions.length > 0) {
        console.log("[Loader Change] No installed versions, selecting from categories:", currentCategories[0].versions[0]);
        if (selectedVersion !== currentCategories[0].versions[0]) {
          setSelectedVersion(currentCategories[0].versions[0]);
        }
      } else {
        console.log("[Loader Change] No versions available at all");
      }
    }
  }, [activeLoader, selectedVersion, currentInstalledVersions, currentCategories]);

  // Load all mods with icons for a specific version
  const loadAllMods = async (versionId?: string) => {
    try {
      setIsLoadingMods(true);
      const mods = await launcher.getAllMods(versionId);

      console.log('[Mods] Loaded mods:', mods.map(m => ({ name: m.name, mod_id: m.mod_id, icon_path: m.icon_path })));
      console.log('[Mods] Showing all mods in manager:', mods.length);

      // Convert icon paths to asset URLs using Tauri's convertFileSrc
      const modsWithIcons = mods.map((mod) => {
        let icon_url: string | undefined;
        if (mod.icon_path) {
          try {
            // Use Tauri's convertFileSrc for local file access
            const normalizedPath = mod.icon_path.replace(/\\/g, '/');
            icon_url = convertFileSrc(normalizedPath);
          } catch (e) {
            console.warn('[Mods] Failed to convert icon path:', mod.icon_path, e);
            icon_url = mod.icon_path.replace(/\\/g, '/');
          }
        }
        return { ...mod, icon_url };
      });

      // Set mods immediately for fast display
      setAllMods(modsWithIcons);
      setIsLoadingMods(false);

      // Fetch icons from Modrinth in background (non-blocking)
      const modsWithModId = modsWithIcons.filter(mod => mod.mod_id);
      if (modsWithModId.length > 0) {
        setTimeout(async () => {
          const modIds = modsWithModId.map(mod => mod.mod_id!).filter(Boolean);
          console.log('[Mods] Fetching icons from Modrinth in background for:', modIds);
          try {
            const iconMap = await launcher.getModIconsBatch(modIds);
            console.log('[Mods] Got icons from Modrinth:', iconMap);

            // Update mods with fetched icons (Modrinth icons override local icons)
            if (Object.keys(iconMap).length > 0) {
              setAllMods(prevMods =>
                prevMods.map(mod => {
                  if (mod.mod_id && iconMap[mod.mod_id]) {
                    return { ...mod, icon_url: iconMap[mod.mod_id] };
                  }
                  return mod;
                })
              );
            }
          } catch (error) {
            console.warn('[Mods] Failed to fetch Modrinth icons:', error);
          }
        }, 100); // Small delay to not block UI
      }
    } catch (error) {
      console.error("Failed to load mods:", error);
      setIsLoadingMods(false);
    }
  };

  // Check if version is installed based on current loader's installed versions
  const isVersionInstalled = useMemo(() => {
    if (!selectedVersion) return false;

    const installed = isInstalledForLoader(activeLoader, selectedVersion, currentInstalledVersions);

    console.log('[Installation Check]', { selectedVersion, installed, currentInstalledVersions });
    return installed;
  }, [activeLoader, selectedVersion, currentInstalledVersions]);

  // Store forge version info for installation
  const [forgeVersionsData, setForgeVersionsData] = useState<any[]>([]);

  // Store fabric version info for installation
  const [fabricVersionsData, setFabricVersionsData] = useState<any[]>([]);
  
  // Store dragon version info for installation
  const [dragonVersionsData, setDragonVersionsData] = useState<any[]>([]);

  // Store quilt version info for installation
  const [quiltVersionsData, setQuiltVersionsData] = useState<any[]>([]);

  // Update loadForgeVersions to store the full data
  const loadForgeVersionsData = async () => {
    try {
      const forgeVersions = await launcher.getForgeVersions();
      setForgeVersionsData(forgeVersions);

      // Keep one stable Forge entry per MC version:
      // - prefer Forge "recommended" build when present
      // - otherwise use the latest build (API is sorted newest first)
      const stableForgeByMc = new Map<string, any>();
      forgeVersions.forEach((fv: any) => {
        const existing = stableForgeByMc.get(fv.mc_version);
        if (!existing) {
          stableForgeByMc.set(fv.mc_version, fv);
          return;
        }

        if (fv.is_recommended && !existing.is_recommended) {
          stableForgeByMc.set(fv.mc_version, fv);
        }
      });

      const stableForgeVersions = Array.from(stableForgeByMc.values());

      // Group stable Forge versions by MC version
      const forgeByMc: Record<string, string[]> = {};
      stableForgeVersions.forEach((fv: any) => {
        if (!forgeByMc[fv.mc_version]) {
          forgeByMc[fv.mc_version] = [];
        }
        forgeByMc[fv.mc_version].push(fv.id);
      });

      // Create categories for Forge
      const forgeCatIds = Object.keys(forgeByMc);
      const forgeCats = forgeCatIds.length === 0 ? [] : VERSION_CATEGORIES
        .filter(cat =>
          cat.id === COMING_SOON_CATEGORY_ID ||
          forgeByMc[cat.id] ||
          forgeCatIds.some(mc => mc.startsWith(cat.id))
        )
        .map(cat => {
          const versions = Object.entries(forgeByMc)
            .filter(([mc]) => mc.startsWith(cat.id))
            .flatMap(([, versions]) => versions);
          return {
            ...cat,
            versions,
          };
        })
        .filter(cat => cat.versions.length > 0 || cat.id === COMING_SOON_CATEGORY_ID);

      setForgeCategories(forgeCats);
    } catch (error) {
      console.error("Failed to load Forge versions:", error);
    }
  };

  // Load Fabric versions data
  const loadFabricVersionsData = async () => {
    try {
      const fabricVersions = await launcher.getFabricVersions();
      setFabricVersionsData(fabricVersions);

      // Group Fabric versions by MC version
      const fabricByMc: Record<string, string[]> = {};
      fabricVersions.forEach((fv: any) => {
        if (!fabricByMc[fv.mc_version]) {
          fabricByMc[fv.mc_version] = [];
        }
        fabricByMc[fv.mc_version].push(fv.id);
      });

      // Create categories for Fabric
      const fabricCatIds = Object.keys(fabricByMc);
      const fabricCats = fabricCatIds.length === 0 ? [] : VERSION_CATEGORIES
        .filter(cat =>
          cat.id === COMING_SOON_CATEGORY_ID ||
          fabricByMc[cat.id] ||
          fabricCatIds.some(mc => mc.startsWith(cat.id))
        )
        .map(cat => {
          const versions = Object.entries(fabricByMc)
            .filter(([mc]) => mc.startsWith(cat.id))
            .flatMap(([, versions]) => versions);
          return {
            ...cat,
            versions,
          };
        })
        .filter(cat => cat.versions.length > 0 || cat.id === COMING_SOON_CATEGORY_ID);

      setFabricCategories(fabricCats);

      // Also load installed Fabric versions
      const installedFabric = await launcher.getInstalledFabricVersions();
      setFabricVersions(installedFabric);
    } catch (error) {
      console.error("Failed to load Fabric versions:", error);
    }
  };

  // Load Dragon versions data
  const loadDragonVersionsData = async () => {
    try {
      const dragonVersions = await launcher.getDragonVersions();
      setDragonVersionsData(dragonVersions);

      // Group Dragon versions by MC version
      const dragonByMc: Record<string, string[]> = {};
      dragonVersions.forEach((dv: any) => {
        if (!dragonByMc[dv.mc_version]) {
          dragonByMc[dv.mc_version] = [];
        }
        dragonByMc[dv.mc_version].push(dv.id);
      });

      // Create categories for Dragon (keep 26.1 lane visible as "Coming Soon" when empty)
      const dragonCatIds = Object.keys(dragonByMc);
      const dragonCats = VERSION_CATEGORIES
        .filter(cat =>
          cat.id === COMING_SOON_CATEGORY_ID ||
          dragonByMc[cat.id] ||
          dragonCatIds.some(mc => mc.startsWith(cat.id))
        )
        .map(cat => {
          const versions = Object.entries(dragonByMc)
            .filter(([mc]) => mc.startsWith(cat.id))
            .flatMap(([, versions]) => versions);
          return {
            ...cat,
            versions,
          };
        })
        .filter(cat => cat.versions.length > 0 || cat.id === COMING_SOON_CATEGORY_ID);

      setDragonCategories(dragonCats);

      // Also load installed Dragon versions
      const installedDragon = await launcher.getInstalledDragonVersions();
      setDragonVersions(installedDragon);
    } catch (error) {
      console.error("Failed to load Dragon versions:", error);
    }
  };

  // Load Quilt versions data
  const loadQuiltVersionsData = async () => {
    try {
      const quiltVersions = await launcher.getQuiltVersions();
      setQuiltVersionsData(quiltVersions);

      // Group Quilt versions by MC version
      const quiltByMc: Record<string, string[]> = {};
      quiltVersions.forEach((qv: any) => {
        if (!quiltByMc[qv.mc_version]) {
          quiltByMc[qv.mc_version] = [];
        }
        quiltByMc[qv.mc_version].push(qv.id);
      });

      // Create categories for Quilt
      const quiltCatIds = Object.keys(quiltByMc);
      const quiltCats = quiltCatIds.length === 0 ? [] : VERSION_CATEGORIES
        .filter(cat =>
          cat.id === COMING_SOON_CATEGORY_ID ||
          quiltByMc[cat.id] ||
          quiltCatIds.some(mc => mc.startsWith(cat.id))
        )
        .map(cat => {
          const versions = Object.entries(quiltByMc)
            .filter(([mc]) => mc.startsWith(cat.id))
            .flatMap(([, versions]) => versions);
          return {
            ...cat,
            versions,
          };
        })
        .filter(cat => cat.versions.length > 0 || cat.id === COMING_SOON_CATEGORY_ID);

      setQuiltCategories(quiltCats);

      // Also load installed Quilt versions
      const installedQuilt = await launcher.getInstalledQuiltVersions();
      setQuiltVersions(installedQuilt);
    } catch (error) {
      console.error("Failed to load Quilt versions:", error);
    }
  };

  // Load Lapetus (Fabulously Optimized) versions data
  // Removed - Resonance versions no longer used
  // Modpacks are loaded via loadModpacksData() instead
  const loadLapetusVersionsData = async () => {
    // No-op - keeping function for compatibility but it does nothing
    console.log("[Lapetus] Resonance versions disabled - using modpacks only");
  };

  // Load Modpacks data with pagination
  const loadModpacksData = async (page: number = 0) => {
    // Prevent loading if already loading
    if (isLoadingModpacks) {
      console.log(`[Modpacks] Already loading, skipping request for page ${page}`);
      return;
    }

    // Ensure page is not negative
    if (page < 0) {
      console.warn(`[Modpacks] Invalid page ${page}, resetting to 0`);
      page = 0;
    }

    // Update page state immediately to prevent duplicate requests
    setModpacksPage(page);
    setIsLoadingModpacks(true);
    
    try {
      console.log(`[Modpacks] Loading page ${page} from Modrinth...`);
      const result = await launcher.getModpacksPaginated(page, modpacksPerPage);
      console.log(`[Modpacks] API returned:`, result);

      const { modpacks: modpacksList, total } = result;
      console.log(`[Modpacks] Loaded ${modpacksList.length} modpacks (page ${page}, total: ${total})`);

      // If we're on a page beyond the available pages, reset to page 0
      const maxPage = Math.ceil(total / modpacksPerPage) - 1;
      if (page > maxPage && total > 0) {
        console.warn(`[Modpacks] Page ${page} exceeds max page ${maxPage}, resetting to 0`);
        setModpacksPage(0);
        loadModpacksData(0);
        return;
      }

      if (!modpacksList || modpacksList.length === 0) {
        console.warn(`[Modpacks] No modpacks returned for page ${page}`);
        // Clear modpacks if none returned
        setModpacks([]);
      } else {
        setModpacks(modpacksList);
      }
      
      setModpacksTotal(total);

      const installedModpacks = await launcher.getInstalledModpackVersions();
      console.log("[Modpacks] Installed modpack versions:", installedModpacks);
      setLapetusVersions(installedModpacks);

      // If there are installed modpacks and no version is selected, select the first one
      console.log("[Modpacks] Current selectedVersion:", selectedVersion);
      if (installedModpacks.length > 0 && !selectedVersion) {
        console.log("[Modpacks] Auto-selecting first installed modpack:", installedModpacks[0]);
        setSelectedVersion(installedModpacks[0]);
      } else if (installedModpacks.length > 0) {
        console.log("[Modpacks] Not auto-selecting because selectedVersion is already set:", selectedVersion);
      } else {
        console.log("[Modpacks] No installed modpack versions found");
      }
    } catch (error) {
      console.error("[Modpacks] Failed to load modpacks:", error);
      // On error, clear modpacks and show empty state
      setModpacks([]);
    } finally {
      setIsLoadingModpacks(false);
    }
  };

  // Load Bedrock Edition versions data
  const loadBedrockVersionsData = async () => {
    try {
      console.log("[Bedrock] Loading installed Bedrock versions...");
      const installed = await launcher.getInstalledBedrockVersions();
      console.log("[Bedrock] Installed versions:", installed);
      setBedrockVersions(installed);

      // Always set a default Bedrock version (even if not installed)
      const defaultBedrockVersion = "bedrock-1.21.13201";
      if (installed.length > 0) {
        // If installed, select the installed version
        console.log("[Bedrock] Auto-selecting installed Bedrock:", installed[0]);
        setSelectedVersion(installed[0]);
      } else {
        // If not installed, set the default version for installation
        console.log("[Bedrock] Setting default Bedrock version for installation:", defaultBedrockVersion);
        setSelectedVersion(defaultBedrockVersion);
      }
    } catch (error) {
      console.error("[Bedrock] Failed to load Bedrock versions:", error);
    }
  };

  // Voice command handler
  const handleVoiceCommand = async (command: VoiceCommand) => {
    console.log('[Voice] Command received:', command);
    
    try {
      switch (command.action) {
        case 'launch':
          if (command.version && command.loader) {
            // Set the loader
            setActiveLoader(command.loader);
            
            // Find matching version
            let versionToLaunch = command.version;
            
            // Try to find exact match or closest match
            const allVersions = [...installedVersions, ...installedForgeVersions, ...fabricVersions, ...quiltVersions, ...lapetusVersions];
            const matchingVersion = allVersions.find(v => v.includes(command.version!));
            
            if (matchingVersion) {
              setSelectedVersion(matchingVersion);
              // Wait a bit for state to update, then launch
              setTimeout(() => handleLaunch(), 500);
            } else {
              // Version not installed, install it first
              console.log('Installing version first...', `${command.version} ${command.loader}`);
              await handleInstall(command.version);
            }
          }
          break;
          
        case 'install':
          if (command.version && command.loader) {
            setActiveLoader(command.loader);
            setActiveTab('versions');
            // The version will be selected and user can click install
            console.log('Ready to install', `${command.version} ${command.loader}`);
          }
          break;
          
        case 'navigate':
          if (command.tab) {
            const tabMap: Record<string, TabType> = {
              'home': 'home',
              'versions': 'versions',
              'mods': 'mods',
              'servers': 'servers',
              'friends': 'friends',
              'news': 'news',
              'skins': 'news',
              'store': 'store',
              'settings': 'home',
              'hosting': 'hosting',
            };
            const tab = tabMap[command.tab.toLowerCase()];
            if (tab) {
              setActiveTab(tab);
            }
          }
          break;
          
        case 'search':
          if (command.query) {
            setActiveTab('mods');
            // Set search query if there's a search input
            console.log('Searching...', command.query);
          }
          break;
          
        case 'info':
          // Show info about installed versions
          const installedCount = installedVersions.length + installedForgeVersions.length + fabricVersions.length + quiltVersions.length;
          console.log(`${installedCount} versions installed`, `Current tab: ${activeTab}`);
          break;
          
        default:
          console.log('Command not recognized', 'Try saying "launch version 1.21.1 vanilla"');
      }
    } catch (error) {
      console.error('[Voice] Command execution error:', error);
      console.log('Command failed', 'Please try again');
    }
  };

  const handleInstall = async (version?: string, dragonModSource?: DragonModSource) => {
    const requestedVersion = version || selectedVersion;
    const versionToInstall = activeLoader === "dragon" && requestedVersion
      ? resolveDragonVersionId(requestedVersion, dragonVersions, dragonVersionsData)
      : requestedVersion;
    const autoDragonModSource: DragonModSource = "github";
    const effectiveDragonModSource: DragonModSource = dragonModSource || autoDragonModSource;
    if (!versionToInstall) return;
    if (installInProgressRef.current) {
      console.log(`[Install] Skipping duplicate install request for ${versionToInstall}`);
      return;
    }
    installInProgressRef.current = true;
    setSelectedVersion(versionToInstall);
    setIsInstalling(true);
    setInstallProgress(0);
    setRunningLoader(activeLoader);

    // Redirect to home page to show installation progress
    setActiveTab("home");

    const runInstallStep = async <T,>(stepName: string, installFn: () => Promise<T>): Promise<T> => {
      try {
        return await installFn();
      } catch (firstError) {
        console.warn(`[Install Retry] ${stepName} failed, retrying once...`, firstError);
        setGameLogs(prev => [...prev.slice(-50), `[WARN] ${stepName} interrupted. Retrying automatically...`]);
        setInstallStatus(`Retrying ${stepName}...`);
        await new Promise(resolve => setTimeout(resolve, 1200));

        try {
          return await installFn();
        } catch (secondError) {
          const message = secondError instanceof Error ? secondError.message : String(secondError);
          throw new Error(`${stepName} failed after retry: ${message}`);
        }
      }
    };

    const queueAutoLaunch = (targetVersion: string) => {
      const queuedLoader = activeLoader;
      launchOverrideRef.current = {
        version: targetVersion,
        loader: queuedLoader,
        skipInstallCheck: true,
        dragonModSource: queuedLoader === "dragon" ? effectiveDragonModSource : undefined,
      };
      setInstallProgress(100);
      setInstallStatus("Launching...");
      setIsAutoLaunchingAfterInstall(true);
      setGameLogs(prev => [...prev, `[INFO] Launching ${targetVersion} in 1 second...`]);
      setTimeout(() => {
        setSelectedVersion(targetVersion);
        void handleLaunch();
      }, 1000);
    };

    try {
      if (activeLoader === "misc") {
        const miscSelection = customMiscSelections.find(
          (item) =>
            createMiscRuntimeVersionId(item) === versionToInstall ||
            item.installedVersionId === versionToInstall ||
            item.versionId === versionToInstall
        );

        if (!miscSelection) {
          throw new Error(`Misc item ${versionToInstall} not found`);
        }

        if (miscSelection.category !== "modpacks") {
          throw new Error("Only modpacks are installable in Misc right now.");
        }

        let modrinthVersionId = miscSelection.modrinthVersionId;
        let gameVersion = miscSelection.minecraftVersion;
        let detectedLoader = miscSelection.detectedLoader || null;

        if (!modrinthVersionId) {
          const versions = await launcher.getModpackVersions(miscSelection.id);
          const versionCandidates = (versions || [])
            .map((version: any) => {
              const validGameVersions = Array.isArray(version.game_versions)
                ? version.game_versions.filter(
                    (candidate: unknown): candidate is string =>
                      typeof candidate === "string" && /^\d+\.\d+/.test(candidate)
                  )
                : [];

              validGameVersions.sort((a, b) => compareMinecraftVersions(b, a));

              return {
                versionId: typeof version.id === "string" ? version.id : "",
                gameVersion: validGameVersions[0] || "",
                loader: Array.isArray(version.loaders) && typeof version.loaders[0] === "string"
                  ? version.loaders[0]
                  : null,
              };
            })
            .filter((candidate) => candidate.versionId && candidate.gameVersion)
            .sort((a, b) => compareMinecraftVersions(b.gameVersion, a.gameVersion));

          if (versionCandidates.length === 0) {
            throw new Error(`No Modrinth versions found for ${miscSelection.name}`);
          }

          const matchedCandidate = versionCandidates.find(
            (candidate) => candidate.gameVersion === gameVersion
          ) || versionCandidates[0];

          modrinthVersionId = matchedCandidate.versionId;
          gameVersion = matchedCandidate.gameVersion;
          detectedLoader = matchedCandidate.loader;
        }

        if (!modrinthVersionId) {
          throw new Error(`No installable Modrinth version found for ${miscSelection.name}`);
        }

        setGameLogs([`[INFO] Installing ${miscSelection.name}...`]);

        const installedVersionId = await runInstallStep(`Misc modpack ${miscSelection.name}`, () =>
          launcher.installModpack(
            modrinthVersionId,
            miscSelection.name,
            gameVersion,
            (progress, status) => {
              setInstallProgress(progress * 100);
              setInstallStatus(status);
              setGameLogs(prev => [...prev.slice(-50), `[INFO] ${status}`]);
            }
          )
        );

        const [installedFabric, installedForge, installedModpacks] = await Promise.all([
          launcher.getInstalledFabricVersions(),
          launcher.getInstalledForgeVersions(),
          launcher.getInstalledModpackVersions(),
        ]);

        setFabricVersions(installedFabric);
        setLapetusVersions(installedModpacks);
        setInstalledForgeVersions(installedForge);
        setCustomMiscSelections((prev) =>
          prev.map((entry) =>
            entry.versionId === miscSelection.versionId
              ? {
                  ...entry,
                  minecraftVersion: gameVersion,
                  modrinthVersionId,
                  detectedLoader,
                  installedVersionId,
                }
              : entry
          )
        );

        justInstalledVersionRef.current = installedVersionId;
        setSelectedVersion(installedVersionId);
        setSelectedCoustomVersionId(miscSelection.versionId);
        setGameLogs(prev => [
          ...prev,
          `[INFO] ✓ ${miscSelection.name} installed with ${detectedLoader || 'auto-detected'} loader support!`,
        ]);

        queueAutoLaunch(installedVersionId);
        setTimeout(() => {
          justInstalledVersionRef.current = null;
        }, 3000);

      } else if (activeLoader === "forge") {
        // Find the forge version info
        const forgeInfo = forgeVersionsData.find((fv: any) => fv.id === versionToInstall);
        if (!forgeInfo) {
          throw new Error(`Forge version ${versionToInstall} not found`);
        }

        setGameLogs([`[INFO] Installing Forge ${forgeInfo.forge_version} for Minecraft ${forgeInfo.mc_version}...`]);

        // First check if vanilla MC is installed
        if (!installedVersions.includes(forgeInfo.mc_version)) {
          setGameLogs(prev => [...prev, `[INFO] Minecraft ${forgeInfo.mc_version} not installed, installing first...`]);

          // Install vanilla first
          await runInstallStep(`Minecraft ${forgeInfo.mc_version}`, () =>
            launcher.installVersion(forgeInfo.mc_version, (progress, status) => {
              setInstallProgress(prev => Math.max(prev, progress * 50)); // First 50% for vanilla
              setInstallStatus(status);
              setGameLogs(prev => {
                if (prev.length > 0 && prev[prev.length - 1].includes('Downloading')) {
                  return [...prev.slice(0, -1), `[INFO] ${status}`];
                }
                return [...prev.slice(-50), `[INFO] ${status}`];
              });
            })
          );

          const installed = await launcher.getInstalledVersions();
          setInstalledVersions(installed);
          setGameLogs(prev => [...prev, `[INFO] Minecraft ${forgeInfo.mc_version} installed!`]);
        }

        // Now install Forge
        setGameLogs(prev => [...prev, `[INFO] Installing Forge...`]);
        const installedForgeId = await runInstallStep(`Forge ${forgeInfo.mc_version}`, () =>
          launcher.installForge(forgeInfo, (progress, status) => {
            setInstallProgress(prev => Math.max(prev, 50 + progress * 50)); // Second 50% for Forge
            setInstallStatus(status);
            setGameLogs(prev => [...prev.slice(-50), `[INFO] ${status}`]);
          })
        );
        const resolvedForgeId = installedForgeId || versionToInstall;

        // Refresh installed versions to update UI
        const installedForge = await launcher.getInstalledForgeVersions();
        const mergedForgeVersions = Array.from(
          new Set([resolvedForgeId, versionToInstall, ...installedForge].filter(Boolean))
        );
        setInstalledForgeVersions(mergedForgeVersions);
        console.log('[Forge Install] Updated installedForgeVersions:', installedForge);
        console.log('[Forge Install] versionToInstall:', versionToInstall);
        console.log('[Forge Install] install result ID:', installedForgeId);
        console.log('[Forge Install] Is installed?', mergedForgeVersions.includes(resolvedForgeId));
        setGameLogs(prev => [...prev, `[INFO] Forge installation complete!`]);

        justInstalledVersionRef.current = resolvedForgeId;

        // Keep the exact installed version selected so Home button immediately flips to Launch
        setSelectedVersion(resolvedForgeId);
        console.log('[Forge Install] Force updated selectedVersion to:', resolvedForgeId);

        // Auto-launch after installation
        queueAutoLaunch(resolvedForgeId);
        setTimeout(() => {
          justInstalledVersionRef.current = null;
        }, 3000);

      } else if (activeLoader === "fabric") {
        // Find the fabric version info
        const fabricInfo = fabricVersionsData.find((fv: any) => fv.id === versionToInstall);
        if (!fabricInfo) {
          throw new Error(`Fabric version ${versionToInstall} not found`);
        }

        setGameLogs([`[INFO] Installing Fabric ${fabricInfo.loader_version} for Minecraft ${fabricInfo.mc_version}...`]);

        // First check if vanilla MC is installed
        if (!installedVersions.includes(fabricInfo.mc_version)) {
          setGameLogs(prev => [...prev, `[INFO] Minecraft ${fabricInfo.mc_version} not installed, installing first...`]);

          // Install vanilla first
          await runInstallStep(`Minecraft ${fabricInfo.mc_version}`, () =>
            launcher.installVersion(fabricInfo.mc_version, (progress, status) => {
              setInstallProgress(prev => Math.max(prev, progress * 50)); // First 50% for vanilla
              setInstallStatus(status);
              setGameLogs(prev => {
                if (prev.length > 0 && prev[prev.length - 1].includes('Downloading')) {
                  return [...prev.slice(0, -1), `[INFO] ${status}`];
                }
                return [...prev.slice(-50), `[INFO] ${status}`];
              });
            })
          );

          const installed = await launcher.getInstalledVersions();
          setInstalledVersions(installed);
          setGameLogs(prev => [...prev, `[INFO] Minecraft ${fabricInfo.mc_version} installed!`]);
        }

        // Now install Fabric
        setGameLogs(prev => [...prev, `[INFO] Installing Fabric...`]);
        const installedFabricId = await runInstallStep(`Fabric ${fabricInfo.mc_version}`, () =>
          launcher.installFabric(fabricInfo, (progress, status) => {
            setInstallProgress(prev => Math.max(prev, 50 + progress * 50)); // Second 50% for Fabric
            setInstallStatus(status);
            setGameLogs(prev => [...prev.slice(-50), `[INFO] ${status}`]);
          })
        );
        const resolvedFabricId = installedFabricId || versionToInstall;

        // Refresh installed versions to update UI
        const installedFabric = await launcher.getInstalledFabricVersions();
        const mergedFabricVersions = Array.from(
          new Set([resolvedFabricId, versionToInstall, ...installedFabric].filter(Boolean))
        );
        console.log('[Fabric Install] Fetched installedFabric:', installedFabric);
        console.log('[Fabric Install] versionToInstall:', versionToInstall);
        console.log('[Fabric Install] install result ID:', installedFabricId);
        console.log('[Fabric Install] Is in list?', mergedFabricVersions.includes(resolvedFabricId));
        
        // Update state - force re-render
        setFabricVersions(mergedFabricVersions);
        justInstalledVersionRef.current = resolvedFabricId;
        setSelectedVersion(resolvedFabricId);
        setInstallProgress(100);
        setInstallStatus('Installation complete!');
        
        // Force a state update to trigger re-render of button
        setFabricVersions([...mergedFabricVersions]);
        
        console.log('[Fabric Install] State updated - fabricVersions and selectedVersion set');
        setGameLogs(prev => [...prev, `[INFO] Fabric installation complete!`]);
        
        // Small delay to ensure state updates propagate before auto-launch
        await new Promise(resolve => setTimeout(resolve, 200));

        // Auto-launch after installation
        queueAutoLaunch(resolvedFabricId);
        setTimeout(() => {
          justInstalledVersionRef.current = null;
        }, 3000);

      } else if (activeLoader === "dragon") {
        // Find the dragon version info
        const dragonInfo = dragonVersionsData.find((dv: any) => dv.id === versionToInstall);
        if (!dragonInfo) {
          throw new Error(`Dragon version ${versionToInstall} not found`);
        }

        setGameLogs([`[INFO] Installing Dragon ${dragonInfo.loader_version} for Minecraft ${dragonInfo.mc_version}...`]);

        // First check if vanilla MC is installed
        if (!installedVersions.includes(dragonInfo.mc_version)) {
          setGameLogs(prev => [...prev, `[INFO] Minecraft ${dragonInfo.mc_version} not installed, installing first...`]);

          // Install vanilla first
          await runInstallStep(`Minecraft ${dragonInfo.mc_version}`, () =>
            launcher.installVersion(dragonInfo.mc_version, (progress, status) => {
              setInstallProgress(prev => Math.max(prev, progress * 50)); // First 50% for vanilla
              setInstallStatus(status);
              setGameLogs(prev => {
                if (prev.length > 0 && prev[prev.length - 1].includes('Downloading')) {
                  return [...prev.slice(0, -1), `[INFO] ${status}`];
                }
                return [...prev.slice(-50), `[INFO] ${status}`];
              });
            })
          );

          const installed = await launcher.getInstalledVersions();
          setInstalledVersions(installed);
          setGameLogs(prev => [...prev, `[INFO] Minecraft ${dragonInfo.mc_version} installed!`]);
        }

        // Now install Dragon (Fabric-based)
        setGameLogs(prev => [...prev, `[INFO] Installing Dragon...`]);
        const installedDragonId = await runInstallStep(`Dragon ${dragonInfo.mc_version}`, () =>
          launcher.installDragon(dragonInfo, (progress, status) => {
            setInstallProgress(prev => Math.max(prev, 50 + progress * 50)); // Second 50% for Dragon
            setInstallStatus(status);
            setGameLogs(prev => [...prev.slice(-50), `[INFO] ${status}`]);
          })
        );
        const resolvedDragonId = installedDragonId || versionToInstall;

        // Refresh installed versions to update UI
        const installedDragon = await launcher.getInstalledDragonVersions();
        const mergedDragonVersions = Array.from(
          new Set([resolvedDragonId, versionToInstall, ...installedDragon].filter(Boolean))
        );
        console.log('[Dragon Install] Fetched installedDragon:', installedDragon);
        console.log('[Dragon Install] versionToInstall:', versionToInstall);
        console.log('[Dragon Install] install result ID:', installedDragonId);
        console.log('[Dragon Install] Is in list?', mergedDragonVersions.includes(resolvedDragonId));
        
        // Update state - force re-render by updating multiple states
        setDragonVersions(mergedDragonVersions);
        justInstalledVersionRef.current = resolvedDragonId;
        setSelectedVersion(resolvedDragonId);
        setInstallProgress(100);
        setInstallStatus('Installation complete!');
        
        // Force a state update to trigger re-render of button
        // This ensures isVersionInstalled recalculates immediately
        setDragonVersions([...mergedDragonVersions]);
        
        console.log('[Dragon Install] State updated - dragonVersions and selectedVersion set');
        setGameLogs(prev => [...prev, `[INFO] Dragon installation complete!`]);
        
        // Small delay to ensure state updates propagate before auto-launch
        await new Promise(resolve => setTimeout(resolve, 200));

        // Auto-launch after installation
        queueAutoLaunch(resolvedDragonId);
        setTimeout(() => {
          justInstalledVersionRef.current = null;
        }, 3000);

      } else if (activeLoader === "quilt") {
        // Find the quilt version info
        const quiltInfo = quiltVersionsData.find((qv: any) => qv.id === versionToInstall);
        if (!quiltInfo) {
          throw new Error(`Quilt version ${versionToInstall} not found`);
        }

        setGameLogs([`[INFO] Installing Quilt ${quiltInfo.loader_version} for Minecraft ${quiltInfo.mc_version}...`]);

        // First check if vanilla MC is installed
        if (!installedVersions.includes(quiltInfo.mc_version)) {
          setGameLogs(prev => [...prev, `[INFO] Minecraft ${quiltInfo.mc_version} not installed, installing first...`]);

          // Install vanilla first
          await runInstallStep(`Minecraft ${quiltInfo.mc_version}`, () =>
            launcher.installVersion(quiltInfo.mc_version, (progress, status) => {
              setInstallProgress(prev => Math.max(prev, progress * 50)); // First 50% for vanilla
              setInstallStatus(status);
              setGameLogs(prev => {
                if (prev.length > 0 && prev[prev.length - 1].includes('Downloading')) {
                  return [...prev.slice(0, -1), `[INFO] ${status}`];
                }
                return [...prev.slice(-50), `[INFO] ${status}`];
              });
            })
          );

          const installed = await launcher.getInstalledVersions();
          setInstalledVersions(installed);
          setGameLogs(prev => [...prev, `[INFO] Minecraft ${quiltInfo.mc_version} installed!`]);
        }

        // Now install Quilt
        setGameLogs(prev => [...prev, `[INFO] Installing Quilt...`]);
        const installedQuiltId = await runInstallStep(`Quilt ${quiltInfo.mc_version}`, () =>
          launcher.installQuilt(quiltInfo, (progress, status) => {
            setInstallProgress(prev => Math.max(prev, 50 + progress * 50)); // Second 50% for Quilt
            setInstallStatus(status);
            setGameLogs(prev => [...prev.slice(-50), `[INFO] ${status}`]);
          })
        );
        const resolvedQuiltId = installedQuiltId || versionToInstall;

        // Refresh installed versions to update UI
        const installedQuilt = await launcher.getInstalledQuiltVersions();
        const mergedQuiltVersions = Array.from(
          new Set([resolvedQuiltId, versionToInstall, ...installedQuilt].filter(Boolean))
        );
        setQuiltVersions(mergedQuiltVersions);
        console.log('[Quilt Install] Updated quiltVersions:', installedQuilt);
        console.log('[Quilt Install] versionToInstall:', versionToInstall);
        console.log('[Quilt Install] install result ID:', installedQuiltId);
        console.log('[Quilt Install] Is installed?', mergedQuiltVersions.includes(resolvedQuiltId));
        setGameLogs(prev => [...prev, `[INFO] Quilt installation complete!`]);

        justInstalledVersionRef.current = resolvedQuiltId;

        // Keep selected version aligned with installer output
        setSelectedVersion(resolvedQuiltId);
        console.log('[Quilt Install] Force updated selectedVersion to:', resolvedQuiltId);

        // Auto-launch after installation
        queueAutoLaunch(resolvedQuiltId);
        setTimeout(() => {
          justInstalledVersionRef.current = null;
        }, 3000);

      } else if (activeLoader === "bedrock") {
        setGameLogs([`[INFO] Installing Minecraft Bedrock Edition...`]);
        await runInstallStep("Bedrock Edition", () =>
          launcher.installBedrock(versionToInstall, (progress, status) => {
            setInstallProgress(prev => Math.max(prev, progress * 100));
            setInstallStatus(status);
            setGameLogs(prev => {
              if (prev.length > 0 && prev[prev.length - 1].includes('Downloading')) {
                return [...prev.slice(0, -1), `[INFO] ${status}`];
              }
              return [...prev.slice(-50), `[INFO] ${status}`];
            });
          })
        );

        const installed = await launcher.getInstalledBedrockVersions();
        setBedrockVersions(installed);
        
        // Ensure the installed version is selected to update UI
        if (installed.length > 0) {
          setSelectedVersion(installed[0]);
        }
        
        setGameLogs(prev => [...prev, `[INFO] Bedrock Edition installed successfully!`]);

      } else {
        // Vanilla installation
        setGameLogs([`[INFO] Installing Minecraft ${versionToInstall}...`]);

        await runInstallStep(`Minecraft ${versionToInstall}`, () =>
          launcher.installVersion(versionToInstall, (progress, status) => {
            setInstallProgress(prev => Math.max(prev, progress * 100));
            setInstallStatus(status);
            setGameLogs(prev => {
              if (prev.length > 0 && prev[prev.length - 1].includes('Downloading')) {
                return [...prev.slice(0, -1), `[INFO] ${status}`];
              }
              return [...prev.slice(-50), `[INFO] ${status}`];
            });
          })
        );
        const installed = await launcher.getInstalledVersions();
        setInstalledVersions(installed);
        setGameLogs(prev => [...prev, `[INFO] Installation complete!`]);

        // Auto-launch after installation
        queueAutoLaunch(versionToInstall);
      }
    } catch (error) {
      console.error("Installation failed:", error);
      setGameLogs(prev => [...prev, `[ERROR] Installation failed: ${error}`]);
    } finally {
      setIsInstalling(false);
      installInProgressRef.current = false;
      setRunningLoader(null);
    }
  };

  useEffect(() => {
    if (!pendingMiscInstallVersionId) return;
    if (activeLoader !== "misc") return;
    if (installInProgressRef.current) return;

    const hasSelection = customMiscSelections.some((item) => {
      const resolvedVersionId = getMiscSelectionVersionId(item);
      return resolvedVersionId === pendingMiscInstallVersionId || item.versionId === pendingMiscInstallVersionId;
    });

    if (!hasSelection) return;

    const versionToInstall = pendingMiscInstallVersionId;
    setPendingMiscInstallVersionId(null);
    void handleInstall(versionToInstall);
  }, [pendingMiscInstallVersionId, activeLoader, customMiscSelections, handleInstall]);

  const handleLaunch = async (dragonModSource?: DragonModSource) => {
    const launchOverride = launchOverrideRef.current;
    if (launchOverride) {
      launchOverrideRef.current = null;
    }

    const loaderToLaunch = launchOverride?.loader || activeLoader;
    const requestedVersionToLaunch = launchOverride?.version || selectedVersion;
    const versionToLaunch = loaderToLaunch === "dragon" && requestedVersionToLaunch
      ? resolveDragonVersionId(requestedVersionToLaunch, dragonVersions, dragonVersionsData)
      : requestedVersionToLaunch;
    const skipInstallCheck = launchOverride?.skipInstallCheck === true;
    const autoDragonModSource: DragonModSource = "github";
    const requestedDragonModSource =
      launchOverride?.dragonModSource || dragonModSource || autoDragonModSource;
    const effectiveDragonModSource: DragonModSource = requestedDragonModSource;

    if (!versionToLaunch || !username) {
      setIsAutoLaunchingAfterInstall(false);
      return;
    }

    const getTimestamp = () => {
      const now = new Date();
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    };

    // For modded versions, check if they're actually installed before launching
    if (!skipInstallCheck && (loaderToLaunch === "forge" || loaderToLaunch === "fabric" || loaderToLaunch === "quilt" || loaderToLaunch === "dragon" || loaderToLaunch === "misc")) {
      let installedForLoader = currentInstalledVersions;
      try {
        if (loaderToLaunch === "forge") {
          const installedForge = await launcher.getInstalledForgeVersions();
          installedForLoader = installedForge;
          setInstalledForgeVersions(installedForge);
        } else if (loaderToLaunch === "fabric") {
          const installedFabric = await launcher.getInstalledFabricVersions();
          installedForLoader = installedFabric;
          setFabricVersions(installedFabric);
        } else if (loaderToLaunch === "quilt") {
          const installedQuilt = await launcher.getInstalledQuiltVersions();
          installedForLoader = installedQuilt;
          setQuiltVersions(installedQuilt);
        } else if (loaderToLaunch === "dragon") {
          const installedDragon = await launcher.getInstalledDragonVersions();
          installedForLoader = installedDragon;
          setDragonVersions(installedDragon);
        } else if (loaderToLaunch === "misc") {
          const [installedFabric, installedForge, installedModpacks] = await Promise.all([
            launcher.getInstalledFabricVersions(),
            launcher.getInstalledForgeVersions(),
            launcher.getInstalledModpackVersions(),
          ]);
          installedForLoader = Array.from(new Set([...installedModpacks, ...installedForge]));
          setFabricVersions(installedFabric);
          setLapetusVersions(installedModpacks);
          setInstalledForgeVersions(installedForge);
        }
      } catch (refreshError) {
        console.warn("[Launch] Failed to refresh installed versions before launch:", refreshError);
      }

      const installedNow = isInstalledForLoader(loaderToLaunch, versionToLaunch, installedForLoader);
      if (!installedNow) {
        console.log(`[Launch] Version ${versionToLaunch} not marked installed, triggering installation`);
        setGameLogs([`${getTimestamp()} Version not installed, starting installation...`]);
        setIsAutoLaunchingAfterInstall(false);
        await handleInstall(versionToLaunch, effectiveDragonModSource);
        return;
      }

      try {
        const canLaunch = await launcher.quickVerify(versionToLaunch);
        if (!canLaunch) {
          console.log(`[Launch] Quick verify failed for ${versionToLaunch}, continuing to full verification`);
          setGameLogs(prev => [...prev.slice(-50), `${getTimestamp()} Quick check incomplete, continuing launch verification...`]);
        }
      } catch (e) {
        console.error('[Launch] Verification failed:', e);
        setGameLogs(prev => [...prev.slice(-50), `${getTimestamp()} Quick check failed, continuing launch...`]);
      }
    }

    // For Lapetus (Resonance), always check and install everything needed
    // But only if the selected version is actually a Lapetus version
    if (loaderToLaunch === "lapetus" && versionToLaunch.startsWith("lapetus-")) {
      setGameLogs([`${getTimestamp()} Scanning Lapetus installation...`]);

      // Check if Lapetus version exists
      const lapetusVersionId = versionToLaunch;

      // First, do a comprehensive verification of the entire installation
      setGameLogs(prev => [...prev, `${getTimestamp()} Verifying game files...`]);

      // Check if vanilla MC JAR exists for the selected version
      const mcVersion = lapetusVersionId.split('-').pop() || "1.21.1";
      const vanillaOk = await launcher.quickVerify(mcVersion);

      // Check if Lapetus version directory exists
      const lapetusOk = await launcher.quickVerify(lapetusVersionId);

      // Check if mods are properly installed
      let modsOk = false;
      try {
        const verification = await launcher.verifyLapetusMods(lapetusVersionId);
        modsOk = verification.is_valid && !verification.needs_repair;
      } catch (e) {
        modsOk = false;
      }

      // If any component is missing, do a full reinstall
      if (!vanillaOk || !lapetusOk || !modsOk) {
        setGameLogs(prev => [...prev, `${getTimestamp()} ⚠️ Installation incomplete or corrupted`]);
        if (!vanillaOk) setGameLogs(prev => [...prev, `${getTimestamp()}   - Minecraft ${mcVersion}: Missing`]);
        if (!lapetusOk) setGameLogs(prev => [...prev, `${getTimestamp()}   - Lapetus version: Missing`]);
        if (!modsOk) setGameLogs(prev => [...prev, `${getTimestamp()}   - Mods: Missing or incomplete`]);

        setGameLogs(prev => [...prev, `${getTimestamp()} Starting full installation...`]);
        setIsInstalling(true);
        setInstallProgress(0);
        setInstallStatus("Reinstalling Resonance...");

        try {
          // Step 1: Install vanilla MC if missing
          if (!vanillaOk) {
            setGameLogs(prev => [...prev, `${getTimestamp()} Installing Minecraft ${mcVersion}...`]);
            await launcher.installVersion(mcVersion, (progress, status) => {
              setInstallProgress(progress * 30); // 0-30%
              setInstallStatus(status);
              setGameLogs(prev => {
                const lastLog = prev[prev.length - 1] || '';
                if (lastLog.includes('Downloading') && status.includes('Downloading')) {
                  return [...prev.slice(0, -1), `${getTimestamp()} ${status}`];
                }
                return [...prev.slice(-50), `${getTimestamp()} ${status}`];
              });
            });
            const installed = await launcher.getInstalledVersions();
            setInstalledVersions(installed);
            setGameLogs(prev => [...prev, `${getTimestamp()} ✓ Minecraft ${mcVersion} installed`]);
          } else {
            setInstallProgress(30);
          }

          // Step 2: Install/Reinstall Lapetus
          setGameLogs(prev => [...prev, `${getTimestamp()} Installing Resonance...`]);
          const lapetusVersionData = lapetusVersions[0];
          const lapetusInfo = (typeof lapetusVersionData === 'object' && lapetusVersionData !== null) 
            ? lapetusVersionData 
            : {
              id: lapetusVersionId,
              mc_version: mcVersion,
              pack_version: "2.0.0",
              loader_version: "0.16.14",
              version_type: "release",
              download_url: "",
              file_name: "",
              file_size: 0
            };

          await launcher.installLapetus(lapetusInfo, (progress, status) => {
            setInstallProgress(30 + progress * 70); // 30-100%
            setInstallStatus(status);
            setGameLogs(prev => {
              const lastLog = prev[prev.length - 1] || '';
              if ((lastLog.includes('Installing') || lastLog.includes('Downloading')) &&
                (status.includes('Installing') || status.includes('Downloading'))) {
                return [...prev.slice(0, -1), `${getTimestamp()} ${status}`];
              }
              return [...prev.slice(-50), `${getTimestamp()} ${status}`];
            });
          });

          // Refresh Lapetus versions
          const installedLapetus = await launcher.getInstalledLapetusVersions();
          setLapetusVersions(installedLapetus);
          setSelectedVersion(lapetusVersionId);

          setGameLogs(prev => [...prev, `${getTimestamp()} ✓ Resonance installed successfully!`]);
          setIsInstalling(false);
          setInstallProgress(0);

        } catch (installError: any) {
          console.error('Lapetus install failed:', installError);
          setGameLogs(prev => [...prev, `${getTimestamp()} ❌ Installation failed: ${installError}`]);
          setIsInstalling(false);
          setInstallProgress(0);
          return; // Don't continue to launch
        }
      } else {
        setGameLogs(prev => [...prev, `${getTimestamp()} ✓ All game files verified`]);
      }

      // Auto-update check
      // Check for mod updates
      setGameLogs(prev => [...prev, `${getTimestamp()} Checking for updates...`]);

      try {
        const newVersion = await launcher.checkLapetusModUpdate();
        if (newVersion && newVersion.has_update) {
          setGameLogs(prev => [...prev, `${getTimestamp()} 🔄 New mod version available: ${newVersion.version}`]);
          setIsInstalling(true);
          setInstallProgress(0);
          setInstallStatus("Updating Lapetus mod...");

          await launcher.updateLapetusMod((progress, status) => {
            setInstallProgress(progress * 100);
            setInstallStatus(status);
            setGameLogs(prev => {
              const lastLog = prev[prev.length - 1] || '';
              if (lastLog.includes('Downloading') && status.includes('Downloading')) {
                return [...prev.slice(0, -1), `${getTimestamp()} ${status}`];
              }
              return [...prev.slice(-50), `${getTimestamp()} ${status}`];
            });
          });

          setGameLogs(prev => [...prev, `${getTimestamp()} ✓ Mod updated to latest version!`]);
          setIsInstalling(false);
          setInstallProgress(0);
        } else {
          setGameLogs(prev => [...prev, `${getTimestamp()} ✓ Mod is up to date`]);
        }
      } catch (updateError: any) {
        console.error('Mod update check failed:', updateError);
        setGameLogs(prev => [...prev, `${getTimestamp()} ⚠️ Could not check for updates`]);
        setIsInstalling(false);
      }
    }

    if (effectiveDragonModSource === 'local' && versionToLaunch.startsWith('dragon-')) {
      setGameLogs(prev => [...prev, `${getTimestamp()} Using local Dragon Client test jar...`]);
    }

    setGameLogs(prev => [...prev, `${getTimestamp()} Launching game...`]);
    
    // Get loader logo for Dynamic Island
    const loaderLogo = loaderToLaunch === 'vanilla' ? vanillaLogo :
                       loaderToLaunch === 'forge' ? forgeLogo :
                       loaderToLaunch === 'fabric' ? fabricLogo :
                       loaderToLaunch === 'quilt' ? quiltLogo :
                       loaderToLaunch === 'dragon' ? starIcon :
                       loaderToLaunch === 'lapetus' ? starIcon : vanillaLogo;
    
    // Launch the game without Dynamic Island notification
    console.log("Launching", versionToLaunch);

    // Trigger launch lines immediately on launch click (force retrigger each time)
    setTriggerLaunchLines(false);
    setTimeout(() => {
      setTriggerLaunchLines(true);
      setTimeout(() => setTriggerLaunchLines(false), 2100);
    }, 0);

      setTimeout(async () => {
        // Auto-launch phase is done; switch back to normal launch UI
        setIsAutoLaunchingAfterInstall(false);
        setIsLaunching(true);
        setRunningLoader(loaderToLaunch);
        setLaunchProgress(0);
        setGameLogs([`${getTimestamp()} Starting Minecraft ${versionToLaunch}...`]);

      // Animate launch progress
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 8 + 3; // Smaller, smoother increments
        if (progress >= 95) {
          progress = 95;
          clearInterval(progressInterval);
        }
        setLaunchProgress(progress);
      }, 150); // More frequent updates for smoother animation

    // Filter out internal launcher messages, keep game logs
    const filterLog = (line: string): boolean => {
      const hiddenPatterns = [
        '[INFO] Reading version',
        '[INFO] Patching ARM64',
        '[INFO] Finding Java',
        '[INFO] Using Java:',
        '[INFO] Building classpath',
        '[INFO] LWJGL version:',
        '[INFO] Launching Minecraft',
        '[INFO] Minecraft (LWJGL',
        '[INFO] Starting Minecraft',
        '[INFO] Minecraft launched with PID',
        'app bundle',
      ];
      if (
        (line.startsWith('[Skin]') || line.startsWith('[DragonSkins]')) &&
        !/fail|warn|error/i.test(line)
      ) {
        return false;
      }
      return !hiddenPatterns.some(pattern => line.includes(pattern));
    };

    // Format log line with timestamp if not already present
    const formatLog = (line: string): string => {
      if (/^\d{2}:\d{2}:\d{2}/.test(line)) {
        return line;
      }
      const cleanLine = line.replace(/^\[(INFO|ERROR|WARN|STDERR)\]\s*/, '');
      return `${getTimestamp()} ${cleanLine}`;
    };

    try {
      if (logUnlisten) {
        logUnlisten();
      }

      // Skip verification for Bedrock Edition
      if (loaderToLaunch !== "bedrock") {
        // Quick verify first - much faster than full verification
        setGameLogs(prev => [...prev, `${getTimestamp()} Quick verification...`]);
        const quickOk = await launcher.quickVerify(versionToLaunch);

        if (quickOk) {
          setGameLogs(prev => [...prev, `${getTimestamp()} ✓ Files verified (quick check)`]);
        } else {
          // Full verification needed - files may be missing
          setGameLogs(prev => [...prev, `${getTimestamp()} Running full verification...`]);

          let repairedCount = 0;
          try {
            repairedCount = await launcher.repairVersion(versionToLaunch, (progress, status) => {
              console.log('Verify progress:', progress, status);
              // Update logs with verification progress
              setGameLogs(prev => {
                const newLog = `${getTimestamp()} ${status}`;
                // Replace last line if it's a progress update of same type
                const lastLog = prev[prev.length - 1] || '';
                if ((lastLog.includes('Checking libraries') && status.includes('Checking libraries')) ||
                  (lastLog.includes('Downloading assets') && status.includes('Downloading assets')) ||
                  (lastLog.includes('Scanning') && status.includes('Scanning'))) {
                  return [...prev.slice(0, -1), newLog];
                }
                return [...prev, newLog];
              });
            });

            if (repairedCount > 0) {
              setGameLogs(prev => [...prev, `${getTimestamp()} ✓ Repaired ${repairedCount} files`]);
            } else {
              setGameLogs(prev => [...prev, `${getTimestamp()} ✓ All files verified`]);
            }
          } catch (verifyError: any) {
            console.error('Verification error:', verifyError);
            setGameLogs(prev => [...prev, `${getTimestamp()} ⚠ Verification error: ${verifyError}`]);
            // Don't continue if verification failed badly
            if (verifyError.toString().includes('not installed')) {
              setIsLaunching(false);
              setIsAutoLaunchingAfterInstall(false);
              return;
            }
          }
        }
      }

      setGameLogs(prev => [...prev, `${getTimestamp()} Launching Minecraft ${versionToLaunch}...`]);

      // Use account credentials for online mode
      const uuid = activeAccount?.is_offline ? undefined : activeAccount?.uuid;
      const accessToken = activeAccount?.is_offline ? undefined : activeAccount?.access_token;

      if (loaderToLaunch === "bedrock") {
        await launcher.launchBedrock(versionToLaunch);

        // Clear progress interval for Bedrock
        clearInterval(progressInterval);

        setIsPlaying(true);
        setIsAutoLaunchingAfterInstall(false);
        setLaunchProgress(100);
        setTimeout(() => {
          setIsLaunching(false);
          setLaunchProgress(0);
        }, 3000); // Give user time to see launch success

        setGameLogs(prev => [...prev, `${getTimestamp()} Bedrock Edition launched!`]);
        return;
      }
      let cursorImageBase64: string | undefined = undefined;
      let pointerImageBase64: string | undefined = undefined;
      if (equippedCursor !== null && cursorsBase64[equippedCursor]) {
        cursorImageBase64 = cursorsBase64[equippedCursor].default;
        pointerImageBase64 = cursorsBase64[equippedCursor].pointer;
      }

      const unlisten = await launcher.launchGame(versionToLaunch, username, uuid, accessToken, (line) => {
        if (filterLog(line) && line.trim()) {
          setGameLogs(prev => [...prev.slice(-200), formatLog(line)]);
        }
      }, effectiveDragonModSource, cursorImageBase64, pointerImageBase64);

      // Clear progress interval when launch completes
      clearInterval(progressInterval);

      // Start session tracking
      const oderId = localStorage.getItem('lapetus_oder_id');
      await sessionTracker.startSession({
        versionId: versionToLaunch,
        username,
        uuid: activeAccount?.uuid,
        oderId: oderId || undefined,
      });

      setLogUnlisten(() => unlisten);
      setIsPlaying(true);
      setLaunchProgress(100);
      
      // Track last launched loader for Dynamic Island
      setLastLaunchedLoader(loaderToLaunch);
      localStorage.setItem('last_launched_loader', loaderToLaunch);
      savePlayedVersionForLoader(loaderToLaunch, versionToLaunch);
      
      setTimeout(() => {
        setIsLaunching(false);
        setLaunchProgress(0);
      }, 500);
      setGameLogs(prev => [...prev, `${getTimestamp()} Game process started`]);

      // Track achievements
      trackVersionPlayed(versionToLaunch);
      startGameSession();
      
      // Update Discord Rich Presence
      try {
        await invoke('update_discord_status', {
          status: 'playing',
          version: versionToLaunch,
          server: null,
          loader: loaderToLaunch
        });
        console.log('[Discord] Updated Discord RPC to playing:', versionToLaunch, loaderToLaunch);
      } catch (err) {
        console.error('[Discord] Failed to update Discord status:', err);
      }
      
      // Update activity in Supabase
      const currentXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
      console.log('[Activity] Current XUID from localStorage:', currentXuid);
      console.log('[Activity] Active account:', activeAccount?.username);
      
      if (currentXuid) {
        try {
          // First, verify this XUID exists and is unique
          const { data: existingUsers, error: checkError } = await supabase
            .from('dragon_users')
            .select('xuid, gamertag')
            .eq('xuid', currentXuid);
          
          if (checkError) {
            console.error('[Activity] Error checking XUID:', checkError);
            return;
          }
          
          if (!existingUsers || existingUsers.length === 0) {
            console.error('[Activity] No user found with XUID:', currentXuid);
            return;
          }
          
          if (existingUsers.length > 1) {
            console.error('[Activity] CRITICAL: Multiple users found with same XUID!', existingUsers);
            console.error('[Activity] This should never happen. Database has duplicate XUIDs.');
            return;
          }
          
          console.log('[Activity] Verified user:', existingUsers[0].gamertag, 'XUID:', currentXuid);
	          console.log('[Activity] Updating activity:', {
	            xuid: currentXuid,
	            game_version: versionToLaunch,
	            loader: loaderToLaunch
	          });
          
          const { data, error } = await supabase
            .from('dragon_users')
	            .update({
	              current_game: 'Minecraft',
	              game_version: versionToLaunch,
	              loader: loaderToLaunch,
	              server_ip: null, // Will be updated if joining a server
	              world_name: null,
	              is_online: true,
              last_seen: new Date().toISOString() // Update last_seen to ensure online detection works
            })
            .eq('xuid', currentXuid)
            .select();
          
          if (error) {
            console.error('[Activity] Supabase error:', error);
          } else {
            console.log('[Activity] ✓ Updated game activity in Supabase:', data);
            console.log('[Activity] Number of rows updated:', data?.length || 0);
            if (data && data.length > 1) {
              console.error('[Activity] WARNING: Updated multiple rows! This should not happen.');
            }
          }
        } catch (err) {
          console.error('[Activity] Failed to update activity:', err);
        }
      } else {
        console.warn('[Activity] No XUID found in localStorage, cannot update activity');
      }
      
      // Check for loader-specific achievements
      if (versionToLaunch.includes('forge')) {
        const updated = unlockAchievement('forge_master');
        setAchievements(updated);
      } else if (versionToLaunch.includes('fabric')) {
        const updated = unlockAchievement('fabric_weaver');
        setAchievements(updated);
      }

      // Clear any existing interval
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }

      checkIntervalRef.current = setInterval(async () => {
        const isRunning = await launcher.isGameRunning();
        if (!isRunning) {
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
          }

          // Check manual stop flag FIRST before any state changes
          const wasManualStop = manualStopRef.current;
          manualStopRef.current = false; // Reset immediately

          // End session tracking - this will clear activity in Supabase
          await sessionTracker.endSession();

          // Update Discord back to launcher status
          try {
            await invoke('update_discord_status', {
              status: 'launcher',
              version: null,
              server: null,
              loader: null
            });
            console.log('[Discord] Updated Discord RPC back to launcher');
          } catch (err) {
            console.error('[Discord] Failed to update Discord status:', err);
          }

          setIsPlaying(false);
          setRunningLoader(null);
          setGameLogs(prev => [...prev, `${getTimestamp()} Game closed`]);
          
          // End game session for achievement tracking
          endGameSession();

          // Only check for crash if not manually stopped
          if (!wasManualStop) {
            // Small delay to ensure crash report file is written if there was a crash
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
              // First check if there's a recent crash report (created in last 30 seconds)
              const latestCrash = await launcher.getLatestCrash();
              const now = Date.now() / 1000;
              const crashIsRecent = latestCrash?.modified && (now - latestCrash.modified) < 30;

              if (crashIsRecent) {
                // There's a recent crash report - this is a real crash
                setGameLogs(prev => [...prev, `${getTimestamp()} ⚠️ Game crashed. Crash report found.`]);

                // Auto-detect issues and offer repair
                try {
	                  const issues = await invoke<{ issues: string[]; canRepair: boolean }>("detect_installation_issues", {
	                    versionId: versionToLaunch
	                  });

                  if (issues.issues.length > 0) {
                    // Determine issue type from detected issues
                    const issueStr = issues.issues.join(" ");
                    if (issueStr.includes("asset") || issueStr.includes("font")) {
                      setRepairIssueType("font_error");
                    } else if (issueStr.includes("missing")) {
                      setRepairIssueType("missing_files");
                    } else if (issueStr.includes("corrupted")) {
                      setRepairIssueType("corrupted");
                    } else {
                      setRepairIssueType("crash");
                    }
                    setRepairIssueDetails(issues.issues.slice(0, 3).join("\n"));
                    setShowRepairDialog(true);
                  } else {
                    // No detectable issues, show crash report
                    setShowCrashReport(true);
                  }
                } catch (detectError) {
                  // Detection failed, show crash report
                  setShowCrashReport(true);
                }
              }
              // If no recent crash report, it was a normal exit (user quit from taskbar/menu)
              // Don't show any dialog
            } catch (e) {
              // Ignore - no crash report means normal exit
            }
          }
        }
      }, 3000);
    } catch (error: any) {
      console.error('Launch error:', error);
      const errorStr = String(error);
      setGameLogs(prev => [...prev, `${getTimestamp()} ❌ ERROR: ${errorStr}`]);

      // Clear progress interval on error
      clearInterval(progressInterval);

      // For Bedrock on non-Windows, show the error but don't try to repair
      if (loaderToLaunch === "bedrock") {
        setGameLogs(prev => [...prev, `${getTimestamp()} ℹ️ Note: Bedrock Edition can only be launched on Windows`]);
        setIsLaunching(false);
        setIsAutoLaunchingAfterInstall(false);
        setRunningLoader(null);
        return;
      }

      // Try to get more details from the log
      try {
        const latestLog = await launcher.getLatestLog();
        if (latestLog?.has_errors && latestLog.error_summary) {
          setGameLogs(prev => [...prev, `${getTimestamp()} 📋 Error details from log:`]);
          // Split error summary into lines and add each
          const errorLines = latestLog.error_summary.split('\n').slice(0, 20);
          for (const line of errorLines) {
            setGameLogs(prev => [...prev, `    ${line}`]);
          }
        }
      } catch (e) {
        // Ignore
      }

      // Auto-detect issues and offer repair for launch failures
      try {
        const issues = await invoke<{ issues: string[]; canRepair: boolean }>("detect_installation_issues", {
          versionId: versionToLaunch
        });

        if (issues.issues.length > 0) {
          // Determine issue type from error message and detected issues
          if (errorStr.includes('ClassNotFoundException') || errorStr.includes('library')) {
            setRepairIssueType("missing_files");
          } else if (errorStr.includes('IllegalAccessException') || errorStr.includes('mod')) {
            setRepairIssueType("corrupted");
          } else {
            setRepairIssueType("crash");
          }
          setRepairIssueDetails(`Launch failed: ${errorStr.slice(0, 200)}\n\nDetected issues:\n${issues.issues.slice(0, 3).join("\n")}`);
          setShowRepairDialog(true);
        } else {
          // No detectable issues, show crash report
          setShowCrashReport(true);
        }
      } catch (detectError) {
        // Detection failed, show crash report
        setShowCrashReport(true);
      }

      setIsLaunching(false);
      setIsPlaying(false);
      setIsAutoLaunchingAfterInstall(false);
      setRunningLoader(null);
    }
    }, 1600); // Wait 1.6s for lines to reach star and brighten
  };

  const handleStop = async () => {
    manualStopRef.current = true;

    // Clear the check interval immediately to prevent race conditions
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }

    // End session tracking and clear activity IMMEDIATELY
    console.log('[Stop Button] Ending session and clearing activity...');
    await sessionTracker.endSession();

    await launcher.stopGame();
    setIsPlaying(false);
    setIsLaunching(false);
    setRunningLoader(null);
    setStarBrightness(1); // Reset star to dim when game is stopped
    setGameLogs(prev => [...prev, "[INFO] Game stopped by user"]);
    if (logUnlisten) {
      logUnlisten();
      setLogUnlisten(null);
    }

    // Reset manual stop flag after a short delay
    setTimeout(() => {
      manualStopRef.current = false;
    }, 1000);
  };

  const handleOpenVersionDetails = async (version: string) => {
    try {
      const info = await launcher.getVersionInfo(version);
      setVersionDetails(info);
      setSelectedVersionForDetails(version);
      // Navigate to versions tab to show details
      setActiveTab("versions");
      // Load all mods with icons for this version
      loadAllMods(version);
    } catch (error) {
      console.error('Failed to get version info:', error);
    }
  };

  const handleOpenFolder = async (path: string) => {
    try {
      await launcher.openFolder(path);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const isModPathDisabled = useCallback((path?: string) => {
    return !!path && path.toLowerCase().endsWith('.jar.disabled');
  }, []);

  const cleanModFileName = useCallback((name?: string) => {
    if (!name) return '';
    return name.replace(/\.jar\.disabled$/i, '').replace(/\.jar$/i, '');
  }, []);

  const sanitizeModMetadataText = useCallback((value?: string | null) => {
    if (!value) return '';

    let cleaned = value.trim();

    cleaned = cleaned.replace(/\s+#.*$/, '').trim();
    cleaned = cleaned.replace(/^["']+|["']+$/g, '').trim();

    if (!cleaned || cleaned.includes('${')) {
      return '';
    }

    return cleaned;
  }, []);

  const normalizeModIdentity = useCallback((value?: string) => {
    if (!value) return '';
    return value
      .toLowerCase()
      .replace(/\.jar(\.disabled)?$/i, '')
      .replace(/[^a-z0-9]/g, '');
  }, []);

  const handleSearchMods = async () => {
    if (!modSearchQuery.trim()) return;
    setIsSearchingMods(true);
    setSelectedMod(null);
    try {
      const loaderType = activeLoader === 'vanilla' ? undefined : activeLoader;
      const results = await launcher.searchMods(
        modSearchQuery,
        modGameVersion || undefined,
        loaderType,
        20
      );
      setModSearchResults(results.hits || []);
    } catch (error) {
      console.error('Failed to search mods:', error);
    } finally {
      setIsSearchingMods(false);
    }
  };

  // Spotlight search function
  const handleSpotlightSearch = async (query: string): Promise<ModResult[]> => {
    try {
      const loaderType = activeLoader === 'vanilla' ? undefined : activeLoader;
      const results = await launcher.searchMods(query, undefined, loaderType, 10);
      return (results.hits || []).map(hit => ({
        project_id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        description: hit.description,
        categories: hit.categories,
        downloads: hit.downloads,
        icon_url: hit.icon_url,
        author: hit.author,
        source: hit.source
      }));
    } catch (error) {
      console.error('Spotlight search failed:', error);
      return [];
    }
  };

  const handleSpotlightModSelect = (mod: ModResult) => {
    // Convert ModResult to the format expected by handleOpenModDetails
    const fullMod = {
      project_id: mod.project_id,
      slug: mod.slug,
      title: mod.title,
      description: mod.description,
      categories: mod.categories,
      downloads: mod.downloads,
      icon_url: mod.icon_url,
      author: mod.author,
      versions: [],
      source: mod.source
    };
    handleOpenModDetails(fullMod);
  };

  // Helper function to auto-detect game version and loader from version string
  const autoDetectVersionInfo = (versionString?: string) => {
    // IMPORTANT: Use selectedVersion first (the version user is currently viewing/using)
    // Only fallback to first installed version if no version is selected
    const version = versionString || selectedVersion || currentInstalledVersions[0] || '';
    const lowerVersion = version.toLowerCase();
    let gameVersion = '';
    let loader = '';

    console.log(`[Auto-Detect] ========== VERSION DETECTION START ==========`);
    console.log(`[Auto-Detect] versionString param: "${versionString}"`);
    console.log(`[Auto-Detect] selectedVersion: "${selectedVersion}"`);
    console.log(`[Auto-Detect] currentInstalledVersions[0]: "${currentInstalledVersions[0]}"`);
    console.log(`[Auto-Detect] Final version to use: "${version}"`);

    if (lowerVersion.includes('fabric')) {
      loader = 'fabric';
      // Extract MC version from fabric version (e.g., "fabric-loader-0.16.14-1.21.5" -> "1.21.5")
      const parts = version.split('-');
      gameVersion = parts[parts.length - 1];
      console.log(`[Auto-Detect] Matched: fabric loader, parts=[${parts.join(', ')}], extracted gameVersion="${gameVersion}"`);
    } else if (lowerVersion.includes('forge')) {
      loader = 'forge';
      // Extract MC version from forge variants:
      // - "1.20.1-forge-47.2.0" -> "1.20.1"
      // - "1.8.9-forge1.8.9-11.15.1.2318-1.8.9" -> "1.8.9"
      // - "forge-1.20.1-47.2.0" -> "1.20.1"
      if (lowerVersion.startsWith('forge-')) {
        const parts = version.split('-');
        gameVersion = parts[1] || version;
      } else if (lowerVersion.includes('-forge')) {
        gameVersion = version.split(/-forge/i)[0];
      } else {
        gameVersion = version.split('-')[0];
      }
      console.log(`[Auto-Detect] Matched: forge loader, extracted gameVersion="${gameVersion}"`);
    } else if (lowerVersion.includes('quilt')) {
      loader = 'quilt';
      // Extract MC version from quilt version
      const parts = version.split('-');
      gameVersion = parts[parts.length - 1];
      console.log(`[Auto-Detect] Matched: quilt loader, parts=[${parts.join(', ')}], extracted gameVersion="${gameVersion}"`);
    } else if (lowerVersion.startsWith('lapetus')) {
      loader = 'fabric'; // Lapetus uses Fabric
      // Extract MC version from lapetus version (e.g., "lapetus-2.0.0-1.20.1" -> "1.20.1")
      const parts = version.split('-');
      gameVersion = parts[parts.length - 1];
      console.log(`[Auto-Detect] Matched: lapetus (fabric), parts=[${parts.join(', ')}], extracted gameVersion="${gameVersion}"`);
    } else if (lowerVersion.startsWith('dragon-client-')) {
      loader = 'fabric'; // Dragon Client uses Fabric
      // Extract MC version from dragon client version (e.g., "dragon-client-1.21.9" -> "1.21.9")
      const parts = version.split('-');
      gameVersion = parts[parts.length - 1];
      console.log(`[Auto-Detect] Matched: dragon-client (fabric), parts=[${parts.join(', ')}], extracted gameVersion="${gameVersion}"`);
    } else if (lowerVersion.startsWith('dragon-')) {
      loader = 'fabric'; // Dragon uses Fabric
      // Extract MC version from dragon version (e.g., "dragon-1.21.9" -> "1.21.9")
      gameVersion = version.replace('dragon-', '');
      console.log(`[Auto-Detect] Matched: dragon (fabric), extracted gameVersion="${gameVersion}"`);
    } else {
      // Vanilla version
      loader = 'vanilla';
      gameVersion = version;
      console.log(`[Auto-Detect] Matched: vanilla/unknown, using version as-is: "${gameVersion}"`);
    }

    console.log(`[Auto-Detect] ========== FINAL RESULT ==========`);
    console.log(`[Auto-Detect] gameVersion: "${gameVersion}"`);
    console.log(`[Auto-Detect] loader: "${loader}"`);
    console.log(`[Auto-Detect] ========================================`);

    return { gameVersion, loader };
  };

  // Compare Minecraft versions like "1.21.9" and "1.21.11".
  // Returns: 1 if a > b, -1 if a < b, 0 if equal.
  const compareMinecraftVersions = useCallback((a: string, b: string) => {
    const toParts = (v: string) => (v.match(/\d+/g) || []).map(Number);
    const aParts = toParts(a);
    const bParts = toParts(b);
    const maxLen = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLen; i++) {
      const aNum = aParts[i] || 0;
      const bNum = bParts[i] || 0;
      if (aNum > bNum) return 1;
      if (aNum < bNum) return -1;
    }

    return 0;
  }, []);

  const mapLoaderToModrinth = (loader?: string | null) => {
    const normalized = (loader || '').toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'dragon' || normalized === 'lapetus') return 'fabric';
    return normalized;
  };

  const resolveVersionContext = useCallback((
    targetVersionId?: string | null,
    infoOverride?: { version_id?: string; loader?: string; base_version?: string } | null
  ) => {
    const resolvedTargetVersion = targetVersionId
      || selectedVersionForDetails
      || infoOverride?.version_id
      || versionDetails?.version_id
      || selectedVersion
      || currentInstalledVersions[0]
      || '';

    const miscSelection = getMiscSelectionForVersionId(resolvedTargetVersion);
    const info = infoOverride || versionDetails;
    const normalizedInfoLoader = (info?.loader || '').toLowerCase();
    const normalizedMiscLoader = (miscSelection?.detectedLoader || '').toLowerCase();

    let loader = normalizedInfoLoader;
    let gameVersion = '';

    if (info?.base_version) {
      const detectedFromBase = autoDetectVersionInfo(info.base_version);
      gameVersion = /^\d+\.\d+/.test(detectedFromBase.gameVersion)
        ? detectedFromBase.gameVersion
        : info.base_version;
    }

    if (miscSelection) {
      if (!gameVersion || !/^\d+\.\d+/.test(gameVersion)) {
        gameVersion = miscSelection.minecraftVersion;
      }

      if (!loader || loader === 'misc' || loader === 'vanilla') {
        loader = normalizedMiscLoader || loader;
      }
    }

    if (!loader || loader === 'misc' || !gameVersion || !/^\d+\.\d+/.test(gameVersion)) {
      const autoDetected = autoDetectVersionInfo(resolvedTargetVersion);

      if (!loader || loader === 'misc') {
        loader = autoDetected.loader;
      }

      if (!gameVersion || !/^\d+\.\d+/.test(gameVersion)) {
        gameVersion = /^\d+\.\d+/.test(autoDetected.gameVersion) ? autoDetected.gameVersion : gameVersion;
      }
    }

    if (normalizedMiscLoader) {
      loader = normalizedMiscLoader;
    }

    const modrinthLoader = mapLoaderToModrinth(loader) || loader;

    return {
      targetVersionId: resolvedTargetVersion,
      gameVersion,
      loader,
      modrinthLoader,
      miscSelection,
      isMiscSelection: Boolean(miscSelection),
    };
  }, [
    currentInstalledVersions,
    getMiscSelectionForVersionId,
    selectedVersion,
    selectedVersionForDetails,
    versionDetails,
  ]);

  const searchModrinthModpacksDirect = useCallback(async (
    query: string,
    gameVersion?: string,
    loader?: string,
    limit: number = 24,
    offset: number = 0
  ): Promise<{
    hits: Array<{
      project_id: string;
      slug: string;
      title: string;
      description: string;
      icon_url: string;
      banner_url?: string;
      downloads: number;
      versions: string[];
      mc_version?: string;
      date_modified?: string;
      website_url?: string;
      source?: 'modrinth';
    }>;
    total_hits: number;
  }> => {
    const normalizedQuery = normalizeMarketplaceModpackSearchQuery(query);

    const normalizedLoader = mapLoaderToModrinth(loader) || loader;
    const versionMatches = (project: any) =>
      !gameVersion || (Array.isArray(project.game_versions) && project.game_versions.includes(gameVersion));
    const loaderMatches = (project: any) =>
      !normalizedLoader || (Array.isArray(project.loaders) && project.loaders.includes(normalizedLoader));
    const toHit = (project: any) => {
      const versions = Array.isArray(project.game_versions)
        ? project.game_versions.filter((value: unknown): value is string => typeof value === "string" && /^\d+\.\d+/.test(value))
        : [];
      const gallery = Array.isArray(project.gallery) ? project.gallery : [];
      const featuredBanner = gallery.find((entry: any) => entry?.featured)?.raw_url
        || gallery.find((entry: any) => entry?.featured)?.url
        || gallery[0]?.raw_url
        || gallery[0]?.url
        || project.icon_url
        || "";

      return {
        project_id: typeof project.id === "string" ? project.id : "",
        slug: typeof project.slug === "string" ? project.slug : "",
        title: typeof project.title === "string" ? project.title : "Unknown Modpack",
        description: typeof project.description === "string" ? project.description : "",
        icon_url: typeof project.icon_url === "string" ? project.icon_url : "",
        banner_url: featuredBanner,
        downloads: typeof project.downloads === "number" ? project.downloads : 0,
        versions,
        mc_version: versions.slice().sort((a, b) => compareMinecraftVersions(b, a))[0] || "",
        date_modified: typeof project.updated === "string" ? project.updated : "",
        website_url: typeof project.slug === "string" && project.slug
          ? `https://modrinth.com/modpack/${project.slug}`
          : "",
        source: "modrinth" as const,
      };
    };

    const dedupe = new Map<string, ReturnType<typeof toHit>>();
    const slug = extractMarketplaceModpackSlugFromQuery(query)
      || (/^[a-z0-9][a-z0-9-_]*$/i.test(normalizedQuery) ? normalizedQuery : "");

    if (slug && offset === 0) {
      try {
        const directResponse = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`);
        if (directResponse.ok) {
          const project = await directResponse.json();
          if (project?.project_type === "modpack" && versionMatches(project) && loaderMatches(project)) {
            const hit = toHit(project);
            if (hit.project_id) {
              dedupe.set(hit.project_id, hit);
            }
          }
        }
      } catch (error) {
        console.debug("[Misc Modpacks] Direct Modrinth project lookup failed:", error);
      }
    }

    try {
      const facets: string[][] = [["project_type:modpack"]];
      if (gameVersion) facets.push([`versions:${gameVersion}`]);
      if (normalizedLoader) facets.push([`categories:${normalizedLoader.toLowerCase()}`]);

      const url = new URL("https://api.modrinth.com/v2/search");
      url.searchParams.set("facets", JSON.stringify(facets));
      url.searchParams.set("limit", String(Math.max(1, limit)));
      url.searchParams.set("offset", String(Math.max(0, offset)));
      url.searchParams.set("index", "downloads");
      if (normalizedQuery) {
        url.searchParams.set("query", normalizedQuery);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        return { hits: Array.from(dedupe.values()), total_hits: dedupe.size };
      }

      const data = await response.json();
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      for (const hit of hits) {
        const mapped = {
          project_id: typeof hit.project_id === "string" ? hit.project_id : "",
          slug: typeof hit.slug === "string" ? hit.slug : "",
          title: typeof hit.title === "string" ? hit.title : "Unknown Modpack",
          description: typeof hit.description === "string" ? hit.description : "",
          icon_url: typeof hit.icon_url === "string" ? hit.icon_url : "",
          banner_url: typeof hit.banner_url === "string" ? hit.banner_url : (
            Array.isArray(hit.gallery) ? (hit.gallery.find((entry: any) => entry?.featured)?.raw_url || hit.gallery[0]?.raw_url || hit.gallery[0]?.url || hit.icon_url || "") : (hit.icon_url || "")
          ),
          downloads: typeof hit.downloads === "number" ? hit.downloads : 0,
          versions: Array.isArray(hit.versions)
            ? hit.versions.filter((value: unknown): value is string => typeof value === "string" && /^\d+\.\d+/.test(value))
            : [],
          mc_version: typeof hit.mc_version === "string" ? hit.mc_version : "",
          date_modified: typeof hit.date_modified === "string" ? hit.date_modified : "",
          website_url: typeof hit.slug === "string" && hit.slug
            ? `https://modrinth.com/modpack/${hit.slug}`
            : "",
          source: "modrinth" as const,
        };

        if (mapped.project_id) {
          dedupe.set(mapped.project_id, mapped);
        }
      }

      const mergedHits = Array.from(dedupe.values()).sort((a, b) => {
        const scoreDiff = scoreMarketplaceModpackResult(query, b) - scoreMarketplaceModpackResult(query, a);
        if (scoreDiff !== 0) return scoreDiff;
        const downloadDiff = (b.downloads || 0) - (a.downloads || 0);
        if (downloadDiff !== 0) return downloadDiff;
        return (b.date_modified || "").localeCompare(a.date_modified || "");
      });

      return {
        hits: mergedHits,
        total_hits: typeof data?.total_hits === "number" ? Math.max(data.total_hits, mergedHits.length) : mergedHits.length,
      };
    } catch (error) {
      console.debug("[Misc Modpacks] Direct Modrinth search failed:", error);
      const mergedHits = Array.from(dedupe.values());
      return { hits: mergedHits, total_hits: mergedHits.length };
    }
  }, [compareMinecraftVersions]);

  const searchModrinthModsDirect = useCallback(async (
    query: string,
    gameVersion?: string,
    loader?: string
  ): Promise<{
    hits: Array<{
      project_id: string;
      slug: string;
      title: string;
      description: string;
      categories: string[];
      downloads: number;
      icon_url: string;
      author: string;
      versions: string[];
      date_modified?: string;
      source?: 'modrinth';
    }>;
    total_hits: number;
  }> => {
    const normalizedQuery = normalizeMarketplaceModpackSearchQuery(query);
    if (!normalizedQuery) {
      return { hits: [], total_hits: 0 };
    }

    const normalizedLoader = mapLoaderToModrinth(loader) || loader;
    const versionMatches = (project: any) =>
      !gameVersion || (Array.isArray(project.game_versions) && project.game_versions.includes(gameVersion));
    const loaderMatches = (project: any) =>
      !normalizedLoader || (Array.isArray(project.loaders) && project.loaders.includes(normalizedLoader));
    const toHit = (project: any) => ({
      project_id: typeof project.id === "string" ? project.id : "",
      slug: typeof project.slug === "string" ? project.slug : "",
      title: typeof project.title === "string" ? project.title : "Unknown Mod",
      description: typeof project.description === "string" ? project.description : "",
      categories: Array.isArray(project.categories)
        ? project.categories.filter((value: unknown): value is string => typeof value === "string")
        : [],
      downloads: typeof project.downloads === "number" ? project.downloads : 0,
      icon_url: typeof project.icon_url === "string" ? project.icon_url : "",
      author: typeof project.author === "string" ? project.author : "",
      versions: Array.isArray(project.game_versions)
        ? project.game_versions.filter((value: unknown): value is string => typeof value === "string" && /^\d+\.\d+/.test(value))
        : [],
      date_modified: typeof project.updated === "string"
        ? project.updated
        : (typeof project.date_modified === "string" ? project.date_modified : ""),
      source: "modrinth" as const,
    });

    const dedupe = new Map<string, ReturnType<typeof toHit>>();
    const slug = extractMarketplaceModpackSlugFromQuery(query)
      || (/^[a-z0-9][a-z0-9-_]*$/i.test(normalizedQuery) ? normalizedQuery : "");

    if (slug) {
      try {
        const directResponse = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`);
        if (directResponse.ok) {
          const project = await directResponse.json();
          if (project?.project_type === "mod" && versionMatches(project) && loaderMatches(project)) {
            const hit = toHit(project);
            if (hit.project_id) {
              dedupe.set(hit.project_id, hit);
            }
          }
        }
      } catch (error) {
        console.debug("[Mod Search] Direct Modrinth project lookup failed:", error);
      }
    }

    try {
      const facets: string[][] = [["project_type:mod"]];
      if (gameVersion) facets.push([`versions:${gameVersion}`]);
      if (normalizedLoader) facets.push([`categories:${normalizedLoader.toLowerCase()}`]);

      const url = new URL("https://api.modrinth.com/v2/search");
      url.searchParams.set("facets", JSON.stringify(facets));
      url.searchParams.set("limit", "24");
      url.searchParams.set("offset", "0");
      url.searchParams.set("query", normalizedQuery);

      const response = await fetch(url.toString());
      if (!response.ok) {
        return { hits: Array.from(dedupe.values()), total_hits: dedupe.size };
      }

      const data = await response.json();
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      for (const hit of hits) {
        const mapped = {
          project_id: typeof hit.project_id === "string" ? hit.project_id : "",
          slug: typeof hit.slug === "string" ? hit.slug : "",
          title: typeof hit.title === "string" ? hit.title : "Unknown Mod",
          description: typeof hit.description === "string" ? hit.description : "",
          categories: Array.isArray(hit.categories)
            ? hit.categories.filter((value: unknown): value is string => typeof value === "string")
            : [],
          downloads: typeof hit.downloads === "number" ? hit.downloads : 0,
          icon_url: typeof hit.icon_url === "string" ? hit.icon_url : "",
          author: typeof hit.author === "string" ? hit.author : "",
          versions: Array.isArray(hit.versions)
            ? hit.versions.filter((value: unknown): value is string => typeof value === "string" && /^\d+\.\d+/.test(value))
            : [],
          date_modified: typeof hit.date_modified === "string" ? hit.date_modified : "",
          source: "modrinth" as const,
        };

        if (mapped.project_id) {
          dedupe.set(mapped.project_id, mapped);
        }
      }

      const mergedHits = Array.from(dedupe.values()).sort((a, b) => {
        const scoreDiff = scoreMarketplaceModpackResult(query, b) - scoreMarketplaceModpackResult(query, a);
        if (scoreDiff !== 0) return scoreDiff;
        const downloadDiff = (b.downloads || 0) - (a.downloads || 0);
        if (downloadDiff !== 0) return downloadDiff;
        return (b.date_modified || "").localeCompare(a.date_modified || "");
      });

      return {
        hits: mergedHits,
        total_hits: typeof data?.total_hits === "number" ? Math.max(data.total_hits, mergedHits.length) : mergedHits.length,
      };
    } catch (error) {
      console.debug("[Mod Search] Direct Modrinth search failed:", error);
      const mergedHits = Array.from(dedupe.values());
      return { hits: mergedHits, total_hits: mergedHits.length };
    }
  }, []);

  const getMarketplaceSource = (source?: string | null): 'modrinth' | 'curseforge' => {
    return source === 'curseforge' ? 'curseforge' : 'modrinth';
  };

  const getMarketplaceModUrl = (mod: { slug: string; source?: string | null; website_url?: string }) => {
    const source = getMarketplaceSource(mod.source);
    if (mod.website_url) return mod.website_url;
    return source === 'curseforge'
      ? `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`
      : `https://modrinth.com/mod/${mod.slug}`;
  };

  const getMarketplaceModpackUrl = (modpack: {
    slug?: string;
    source?: string | null;
    websiteUrl?: string;
    website_url?: string;
  }) => {
    const source = getMarketplaceSource(modpack.source);
    if (modpack.websiteUrl) return modpack.websiteUrl;
    if (modpack.website_url) return modpack.website_url;
    return source === 'curseforge'
      ? `https://www.curseforge.com/minecraft/modpacks/${modpack.slug || ''}`
      : `https://modrinth.com/modpack/${modpack.slug || ''}`;
  };

  const miscTabs = useMemo(() => ([
    { id: 'modpacks' as MiscLibraryCategory, label: 'Modpacks', icon: Package },
  ]), []);

  const coustomCategory = useMemo<VersionCategory | null>(() => {
    if (customMiscSelections.length === 0) return null;
    return {
      id: COUSTOM_CATEGORY_ID,
      name: 'COUSTOM',
      image: '/misc-banner.png',
      versions: customMiscSelections.map((item) => getMiscSelectionVersionId(item)),
    };
  }, [customMiscSelections]);

  const openCoustomCard = useCallback(() => {
    if (!coustomCategory) return;
    const firstVersion = coustomCategory.versions[0] || "";
    const firstSelectionId = customMiscSelections[0]?.versionId || null;
    setShowInstallMods(false);
    setShowMiscPanel(false);
    setSelectedVersionForDetails(null);
    setVersionDetails(null);
    setActiveLoader("misc");
    setActiveTab("versions");
    window.setTimeout(() => {
      setSelectedCategory(coustomCategory);
      setSelectedCoustomVersionId(firstSelectionId);
      if (firstVersion) {
        setSelectedVersion(firstVersion);
      }
    }, 0);
  }, [coustomCategory, customMiscSelections]);

  const loadMiscModpacks = useCallback(async (query: string = "", page: number = 1) => {
    const requestId = ++miscModpackRequestIdRef.current;
    const trimmedQuery = query.trim();

    try {
      const context = resolveVersionContext();
      const preferredBaseVersion = context.gameVersion || "";
      const detectedBaseVersion = preferredBaseVersion ? autoDetectVersionInfo(preferredBaseVersion).gameVersion : "";
      let baseVersion = /^\d+\.\d+/.test(detectedBaseVersion)
        ? detectedBaseVersion
        : preferredBaseVersion;
      let loader = context.loader || "";
      
      const modrinthLoader = mapLoaderToModrinth(loader) || loader;
      const resolvePage = async (targetPage: number) => {
        const searchOffset = Math.max(0, (targetPage - 1) * 3);
        const rawSearchAttempts = [
          { gameVersion: baseVersion || undefined, loader: modrinthLoader || undefined },
          { gameVersion: undefined, loader: modrinthLoader || undefined },
          { gameVersion: baseVersion || undefined, loader: undefined },
          { gameVersion: undefined, loader: undefined },
        ];
        const searchAttempts = rawSearchAttempts.filter((attempt, index, attempts) =>
          attempts.findIndex(
            (candidate) =>
              candidate.gameVersion === attempt.gameVersion &&
              candidate.loader === attempt.loader
          ) === index
        );

        let result = { hits: [] as any[], total_hits: 0 };

        for (const attempt of searchAttempts) {
          try {
            result = await launcher.searchModpacks(
              trimmedQuery,
              attempt.gameVersion,
              attempt.loader,
              3,
              searchOffset
            );
          } catch (error) {
            console.warn("[Misc Modpacks] Combined search failed, falling back to paginated Modrinth search:", error);
            const fallbackPage = await launcher.getModpacksPaginated(
              targetPage - 1,
              3,
              trimmedQuery || undefined,
              attempt.gameVersion,
              attempt.loader
            );

            result = {
              hits: (fallbackPage.modpacks || []).map((modpack: any) => ({
                project_id: modpack.id,
                slug: modpack.slug || "",
                title: modpack.name,
                description: modpack.description,
                icon_url: modpack.icon,
                banner_url: modpack.banner,
                versions: [],
                mc_version: modpack.mc_version || "",
                website_url: modpack.website_url || "",
                source: "modrinth" as const,
              })),
              total_hits: fallbackPage.total || 0,
            };
          }

          if ((result.hits || []).length > 0) {
            break;
          }
        }

        if ((result.hits || []).length === 0) {
          for (const attempt of searchAttempts) {
            const directResult = await searchModrinthModpacksDirect(
              trimmedQuery,
              attempt.gameVersion,
              attempt.loader,
              3,
              searchOffset
            );

            if ((directResult.hits || []).length > 0 || (directResult.total_hits || 0) > 0) {
              result = directResult;
              break;
            }
          }
        }

        const items = await Promise.all(
          (result.hits || []).map(async (modpack: any): Promise<MiscLibraryItem> => {
            const source = getMarketplaceSource(modpack.source);
            let minecraftVersion = (modpack.mc_version || "").trim();
            let modrinthVersionId: string | undefined;
            let detectedLoader: string | null = null;
            let availableVersions: NonNullable<MiscLibraryItem["availableVersions"]> = [];

            if (source === "modrinth") {
              try {
                const versions = await launcher.getModpackVersions(modpack.project_id);
                const versionCandidates = (versions || [])
                  .map((version: any, versionIndex: number) => {
                    const validGameVersions = Array.isArray(version.game_versions)
                      ? version.game_versions.filter(
                          (gameVersion: unknown): gameVersion is string =>
                            typeof gameVersion === "string" && /^\d+\.\d+/.test(gameVersion)
                        )
                      : [];

                    validGameVersions.sort((a, b) => compareMinecraftVersions(b, a));

                    return {
                      versionId: typeof version.id === "string" ? version.id : "",
                      gameVersion: validGameVersions[0] || "",
                      loader: Array.isArray(version.loaders) && typeof version.loaders[0] === "string"
                        ? version.loaders[0]
                        : null,
                      versionIndex,
                    };
                  })
                  .filter((candidate) => candidate.versionId && candidate.gameVersion)
                  .sort((a, b) => {
                    const versionCompare = compareMinecraftVersions(b.gameVersion, a.gameVersion);
                    if (versionCompare !== 0) return versionCompare;
                    return a.versionIndex - b.versionIndex;
                  });

                availableVersions = versionCandidates.reduce<NonNullable<MiscLibraryItem["availableVersions"]>>(
                  (accumulator, candidate) => {
                    if (
                      accumulator.some(
                        (entry) => entry.minecraftVersion === candidate.gameVersion
                      )
                    ) {
                      return accumulator;
                    }

                    accumulator.push({
                      minecraftVersion: candidate.gameVersion,
                      modrinthVersionId: candidate.versionId,
                      detectedLoader: candidate.loader,
                    });

                    return accumulator;
                  },
                  []
                );

                if (availableVersions.length > 0) {
                  minecraftVersion = availableVersions[0].minecraftVersion;
                  modrinthVersionId = availableVersions[0].modrinthVersionId;
                  detectedLoader = availableVersions[0].detectedLoader ?? null;
                }
              } catch (error) {
                console.warn(`[Misc Modpacks] Failed to resolve Minecraft version for ${modpack.title}:`, error);
              }
            } else {
              const curseforgeVersions = Array.isArray(modpack.versions)
                ? modpack.versions
                    .filter((value: unknown): value is string => typeof value === "string" && /^\d+\.\d+/.test(value))
                    .sort((a: string, b: string) => compareMinecraftVersions(b, a))
                : [];

              availableVersions = Array.from(new Set<string>(curseforgeVersions)).map((version) => ({
                minecraftVersion: version,
              }));

              if (!minecraftVersion && availableVersions.length > 0) {
                minecraftVersion = availableVersions[0].minecraftVersion;
              }
            }

            if (availableVersions.length === 0 && minecraftVersion) {
              availableVersions = [
                {
                  minecraftVersion,
                  modrinthVersionId,
                  detectedLoader,
                },
              ];
            }

            return {
              id: modpack.project_id,
              name: modpack.title,
              minecraftVersion: minecraftVersion || "Latest",
              category: "modpacks",
              description: modpack.description || (source === "curseforge" ? "Popular CurseForge modpack." : "Popular Modrinth modpack."),
              image: modpack.banner_url || modpack.icon_url || "",
              sourceLabel: source === "curseforge" ? "CurseForge Modpack" : "Modrinth Modpack",
              source,
              slug: modpack.slug,
              websiteUrl: modpack.website_url,
              modrinthVersionId,
              detectedLoader,
              availableVersions,
            };
          })
        );

        return {
          items,
          total: typeof result.total_hits === "number" && result.total_hits > 0
            ? result.total_hits
            : items.length,
        };
      };

      const cacheKey = createMiscModpackSearchCacheKey(
        trimmedQuery,
        page,
        baseVersion || undefined,
        modrinthLoader || undefined
      );
      const cachedPage = miscModpackCacheRef.current[cacheKey];

      if (cachedPage) {
        if (requestId === miscModpackRequestIdRef.current) {
          setMiscModpacks(cachedPage.items);
          setMiscModpackTotalHits(cachedPage.total);
          setIsLoadingMiscModpacks(false);
          setIsMiscModpackPageTransitioning(false);
        }

        const nextPage = page + 1;
        const nextPageKey = createMiscModpackSearchCacheKey(
          trimmedQuery,
          nextPage,
          baseVersion || undefined,
          modrinthLoader || undefined
        );
        const maxCachedPage = Math.ceil(cachedPage.total / 3);

        if (
          nextPage <= maxCachedPage &&
          !miscModpackCacheRef.current[nextPageKey] &&
          !miscModpackPrefetchingRef.current.has(nextPageKey)
        ) {
          miscModpackPrefetchingRef.current.add(nextPageKey);
          void resolvePage(nextPage)
            .then((prefetchedPage) => {
              miscModpackCacheRef.current[nextPageKey] = prefetchedPage;
            })
            .catch((error) => {
              console.debug("[Misc Modpacks] Prefetch failed:", error);
            })
            .finally(() => {
              miscModpackPrefetchingRef.current.delete(nextPageKey);
            });
        }
        return;
      }

      if (miscModpacks.length === 0) {
        setIsLoadingMiscModpacks(true);
      }

      const currentPage = await resolvePage(page);

      if (currentPage.total > 0) {
        const maxPage = Math.max(1, Math.ceil(currentPage.total / 3));
        if (page > maxPage) {
          if (requestId === miscModpackRequestIdRef.current) {
            setMiscModpackPage(maxPage);
          }
          return;
        }
      }

      miscModpackCacheRef.current[cacheKey] = currentPage;

      if (requestId !== miscModpackRequestIdRef.current) return;

      setMiscModpacks(currentPage.items);
      setMiscModpackTotalHits(currentPage.total);

      const nextPage = page + 1;
      const maxPage = Math.ceil(currentPage.total / 3);
      const nextPageKey = createMiscModpackSearchCacheKey(
        trimmedQuery,
        nextPage,
        baseVersion || undefined,
        modrinthLoader || undefined
      );

      if (
        nextPage <= maxPage &&
        !miscModpackCacheRef.current[nextPageKey] &&
        !miscModpackPrefetchingRef.current.has(nextPageKey)
      ) {
        miscModpackPrefetchingRef.current.add(nextPageKey);
        void resolvePage(nextPage)
          .then((prefetchedPage) => {
            miscModpackCacheRef.current[nextPageKey] = prefetchedPage;
          })
          .catch((error) => {
            console.debug("[Misc Modpacks] Prefetch failed:", error);
          })
          .finally(() => {
            miscModpackPrefetchingRef.current.delete(nextPageKey);
          });
      }
    } catch (error) {
      console.error("[Misc Modpacks] Failed to load marketplace modpacks:", error);
      if (requestId !== miscModpackRequestIdRef.current) return;
      setMiscModpacks([]);
      setMiscModpackTotalHits(0);
    } finally {
      if (requestId === miscModpackRequestIdRef.current) {
        setIsLoadingMiscModpacks(false);
        setIsMiscModpackPageTransitioning(false);
      }
    }
  }, [autoDetectVersionInfo, compareMinecraftVersions, miscModpacks.length, resolveVersionContext, searchModrinthModpacksDirect]);

  const navigateMiscModpackPage = useCallback((page: number) => {
    if (page === miscModpackPage) return;

    setIsMiscModpackPageTransitioning(true);
    setMiscModpackPage(page);
  }, [miscModpackPage]);

  const handleMiscVersionSelect = useCallback((
    itemKey: string,
    selectedVersion: NonNullable<MiscLibraryItem["availableVersions"]>[number]
  ) => {
    const matchesItem = (entry: MiscLibraryItem) =>
      `${entry.source || "modrinth"}:${entry.id}` === itemKey;

    const applyVersionSelection = (items: MiscLibraryItem[]) =>
      items.map((entry) =>
        matchesItem(entry)
          ? {
              ...entry,
              minecraftVersion: selectedVersion.minecraftVersion,
              modrinthVersionId: selectedVersion.modrinthVersionId,
              detectedLoader: selectedVersion.detectedLoader ?? null,
            }
          : entry
      );

    setMiscModpacks((prev) => applyVersionSelection(prev));

    Object.keys(miscModpackCacheRef.current).forEach((cacheKey) => {
      const cachedEntry = miscModpackCacheRef.current[cacheKey];
      miscModpackCacheRef.current[cacheKey] = {
        ...cachedEntry,
        items: applyVersionSelection(cachedEntry.items),
      };
    });
  }, []);

  useEffect(() => {
    if (activeTab !== "friends") return;

    const timeout = window.setTimeout(() => {
      loadMiscModpacks(miscModpackSearchQuery, miscModpackPage);
    }, miscModpackSearchQuery.trim() ? 280 : 0);

    return () => window.clearTimeout(timeout);
  }, [activeTab, miscModpackSearchQuery, miscModpackPage, loadMiscModpacks]);

  const handleMiscDownload = useCallback((item: MiscLibraryItem) => {
    if (getMarketplaceSource(item.source) === "curseforge") {
      const modpackUrl = getMarketplaceModpackUrl(item);
      if (modpackUrl) {
        window.open(modpackUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    const nextVersionId = createCoustomVersionId(item);
    const existingSelection = customMiscSelections.find((entry) => entry.versionId === nextVersionId);
    const nextSelection: CustomMiscSelection = {
      ...(existingSelection || item),
      ...item,
      versionId: nextVersionId,
      addedAt: existingSelection?.addedAt || new Date().toISOString(),
      installedVersionId: existingSelection?.installedVersionId,
    };
    const nextRuntimeVersionId = getMiscSelectionVersionId(nextSelection);

    setCustomMiscSelections((prev) => {
      if (prev.some((entry) => entry.versionId === nextVersionId)) {
        return prev.map((entry) =>
          entry.versionId === nextVersionId
            ? {
                ...entry,
                ...nextSelection,
                addedAt: entry.addedAt || nextSelection.addedAt,
                installedVersionId: entry.installedVersionId || nextSelection.installedVersionId,
              }
            : entry
        );
      }

      return [nextSelection, ...prev];
    });

    setSelectedCoustomVersionId(nextVersionId);
    setShowMiscPanel(false);
    setShowInstallMods(false);
    setSelectedVersionForDetails(null);
    setVersionDetails(null);
    setSelectedCategory(null);
    setActiveLoader("misc");
    setSelectedVersion(nextRuntimeVersionId);
    setPendingMiscInstallVersionId(nextRuntimeVersionId);
    setActiveTab("home");
  }, [customMiscSelections]);

  const handleOpenModDetails = async (mod: typeof modSearchResults[0]) => {
    setIsLoadingModDetails(true);
    setSelectedMod(mod);
    try {
      const source = getMarketplaceSource(mod.source);
      // Fetch full mod details and versions from Modrinth via Tauri backend (avoids CORS)
      const [projectData, versionsData] = await Promise.all([
        launcher.getModDetails(mod.project_id, source),
        launcher.getModVersions(mod.project_id, source)
      ]);

      setSelectedMod({
        ...mod,
        body: projectData.body,
        gallery: projectData.gallery?.map((g: any) => g.url) || [],
        license: projectData.license?.name,
        source_url: projectData.source_url,
        wiki_url: projectData.wiki_url,
        discord_url: projectData.discord_url,
        website_url: projectData.website_url,
        source: getMarketplaceSource(projectData.source || mod.source),
      });
      console.log('Mod versions loaded:', versionsData);
      // Map the API response to match our state type
      setModVersions((versionsData || []).map((v: any) => ({
        id: v.id,
        name: v.name,
        version_number: v.version_number,
        game_versions: v.game_versions,
        loaders: v.loaders,
        downloads: v.downloads || 0,
        date_published: v.date_published || '',
        files: v.files
      })));
    } catch (error) {
      console.error('Failed to load mod details:', error);
    } finally {
      setIsLoadingModDetails(false);
    }
  };

  const loadFeaturedMods = async (loader?: string, gameVersion?: string, page: number = 1) => {
    // Map dragon to fabric for mod searching since Dragon uses Fabric loader
    const searchLoader = mapLoaderToModrinth(loader) || loader;
    const prefetchFeaturedPage = async (targetPage: number, totalHits?: number) => {
      if (targetPage <= 0) return;
      if (typeof totalHits === 'number' && targetPage > Math.ceil(totalHits / MODS_PER_PAGE)) return;

      const targetKey = `featured_mods_${searchLoader}_${gameVersion}_${targetPage}`;
      if (sessionStorage.getItem(targetKey) || modBrowserPrefetchingRef.current.has(targetKey)) {
        return;
      }

      modBrowserPrefetchingRef.current.add(targetKey);
      try {
        const prefetchedData = await launcher.getFeaturedMods(
          MODS_PER_PAGE,
          searchLoader,
          gameVersion,
          (targetPage - 1) * MODS_PER_PAGE
        );
        sessionStorage.setItem(targetKey, JSON.stringify(prefetchedData));
      } catch (error) {
        console.debug('[Featured Mods] Prefetch failed:', error);
      } finally {
        modBrowserPrefetchingRef.current.delete(targetKey);
      }
    };
    
    // Check cache first for instant loading
    const cacheKey = `featured_mods_${searchLoader}_${gameVersion}_${page}`;
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        setFeaturedMods(cachedData.hits || []);
        setModBrowserTotalHits(cachedData.total_hits || 0);
        setModBrowserPage(page);
        setIsModBrowserPageTransitioning(false);
        console.log('[Featured Mods] Loaded from cache instantly');
        void prefetchFeaturedPage(page + 1, cachedData.total_hits || 0);
        return; // Don't set loading state if using cache
      } catch (e) {
        console.error('[Featured Mods] Cache parse error:', e);
      }
    }
    
    // Only show loading if not cached
    if (featuredMods.length === 0) {
      setIsLoadingFeatured(true);
    }
    
    // Use setTimeout to make this non-blocking
    setTimeout(async () => {
      try {
        const offset = (page - 1) * MODS_PER_PAGE;
        // Load popular mods from Modrinth via Tauri backend (avoids CORS)
        const data = await launcher.getFeaturedMods(MODS_PER_PAGE, searchLoader, gameVersion, offset);
        setFeaturedMods(data.hits || []);
        setModBrowserTotalHits(data.total_hits || 0);
        setModBrowserPage(page);
        
        // Cache the results for 5 minutes
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
        console.log('[Featured Mods] Loaded and cached');
        void prefetchFeaturedPage(page + 1, data.total_hits || 0);
      } catch (error) {
        console.error('Failed to load featured mods:', error);
      } finally {
        setIsLoadingFeatured(false);
        setIsModBrowserPageTransitioning(false);
      }
    }, 0);
  };

  // Search mods with pagination
  const searchModsWithPagination = async (query: string, loader?: string, gameVersion?: string, page: number = 1) => {
    console.log('[searchModsWithPagination] Called with:', { query, loader, gameVersion, page });
    
    if (!query.trim()) {
      console.log('[searchModsWithPagination] Empty query, loading featured');
      setModSearchResults([]);
      loadFeaturedMods(loader, gameVersion, page);
      return;
    }
    
    // Map dragon to fabric for mod searching since Dragon uses Fabric loader
    const searchLoader = mapLoaderToModrinth(loader) || loader;
    console.log('[searchModsWithPagination] Mapped loader:', loader, '->', searchLoader);
    
    // Check cache first for instant loading
    const normalizedQuery = normalizeMarketplaceModpackSearchQuery(query).trim().toLowerCase();
    const prefetchSearchPage = async (targetPage: number, totalHits?: number) => {
      if (targetPage <= 0) return;
      if (typeof totalHits === 'number' && targetPage > Math.ceil(totalHits / MODS_PER_PAGE)) return;

      const targetKey = `search_mods_${MOD_BROWSER_SEARCH_CACHE_VERSION}_${normalizedQuery || query.trim().toLowerCase()}_${searchLoader || 'any-loader'}_${gameVersion || 'any-version'}_${targetPage}`;
      if (sessionStorage.getItem(targetKey) || modBrowserPrefetchingRef.current.has(targetKey)) {
        return;
      }

      modBrowserPrefetchingRef.current.add(targetKey);
      try {
        const prefetchedData = await launcher.searchMods(
          query,
          gameVersion,
          searchLoader,
          MODS_PER_PAGE,
          (targetPage - 1) * MODS_PER_PAGE
        );
        sessionStorage.setItem(targetKey, JSON.stringify(prefetchedData));
      } catch (error) {
        console.debug('[searchModsWithPagination] Prefetch failed:', error);
      } finally {
        modBrowserPrefetchingRef.current.delete(targetKey);
      }
    };
    const cacheKey = `search_mods_${MOD_BROWSER_SEARCH_CACHE_VERSION}_${normalizedQuery || query.trim().toLowerCase()}_${searchLoader || 'any-loader'}_${gameVersion || 'any-version'}_${page}`;
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        setModSearchResults(cachedData.hits || []);
        setModBrowserTotalHits(cachedData.total_hits || 0);
        setModBrowserPage(page);
        setIsModBrowserPageTransitioning(false);
        console.log('[searchModsWithPagination] Loaded from cache:', cachedData.hits?.length, 'results');
        void prefetchSearchPage(page + 1, cachedData.total_hits || 0);
        return; // Don't set loading state if using cache
      } catch (e) {
        console.error('[searchModsWithPagination] Cache parse error:', e);
      }
    }
    
    // Only show loading if not cached
    console.log('[searchModsWithPagination] Fetching from API...');
    if (modSearchResults.length === 0) {
      setIsLoadingFeatured(true);
    }
    try {
      const offset = (page - 1) * MODS_PER_PAGE;
      let data = await launcher.searchMods(query, gameVersion, searchLoader, MODS_PER_PAGE, offset);

      if (page === 1) {
        const directData = await searchModrinthModsDirect(query, gameVersion, searchLoader);
        if ((directData.hits?.length || 0) > 0) {
          const mergedByProject = new Map<string, any>();
          const addHit = (hit: any) => {
            const projectId = typeof hit?.project_id === 'string' ? hit.project_id : '';
            const source = getMarketplaceSource(hit?.source);
            if (!projectId) return;
            mergedByProject.set(`${source}:${projectId}`, hit);
          };

          (directData.hits || []).forEach(addHit);
          (data.hits || []).forEach(addHit);

          const mergedHits = Array.from(mergedByProject.values()).sort((a: any, b: any) => {
            const scoreDiff = scoreMarketplaceModpackResult(query, b) - scoreMarketplaceModpackResult(query, a);
            if (scoreDiff !== 0) return scoreDiff;

            const downloadDiff = (Number(b?.downloads) || 0) - (Number(a?.downloads) || 0);
            if (downloadDiff !== 0) return downloadDiff;

            return String(b?.date_modified || '').localeCompare(String(a?.date_modified || ''));
          });

          data = {
            ...data,
            hits: mergedHits.slice(0, MODS_PER_PAGE),
            total_hits: Math.max(
              Number(data.total_hits) || 0,
              Number(directData.total_hits) || 0,
              mergedHits.length
            ),
          };
        }
      }

      console.log('[searchModsWithPagination] API returned:', data.hits?.length, 'results');
      setModSearchResults(data.hits || []);
      setModBrowserTotalHits(data.total_hits || 0);
      setModBrowserPage(page);
      
      // Cache the results
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      console.log('[searchModsWithPagination] Cached results');
      void prefetchSearchPage(page + 1, data.total_hits || 0);
    } catch (error) {
      console.error('[searchModsWithPagination] Failed to search mods:', error);
    } finally {
      setIsLoadingFeatured(false);
      setIsModBrowserPageTransitioning(false);
    }
  };

  const navigateModBrowserPage = useCallback((page: number) => {
    if (page === modBrowserPage) return;

    setIsModBrowserPageTransitioning(true);
    const context = resolveVersionContext();

    if (modBrowserSearchQuery.trim()) {
      void searchModsWithPagination(modBrowserSearchQuery, context.modrinthLoader, context.gameVersion, page);
    } else {
      void loadFeaturedMods(context.modrinthLoader, context.gameVersion, page);
    }
  }, [
    modBrowserPage,
    modBrowserSearchQuery,
    loadFeaturedMods,
    resolveVersionContext,
    searchModsWithPagination,
  ]);

  const miscModpackPageCount = Math.max(1, Math.ceil(miscModpackTotalHits / 3));
  const modBrowserPageCount = Math.max(1, Math.ceil(modBrowserTotalHits / MODS_PER_PAGE));
  const visibleModBrowserItems = modBrowserSearchQuery.trim() ? modSearchResults : featuredMods;
  const showModBrowserPageSkeleton = showInstallMods
    && isModBrowserPageTransitioning
    && visibleModBrowserItems.length > 0;
  const showMiscModpackPageSkeleton = isMiscModpackPageTransitioning
    && !isLoadingMiscModpacks
    && miscModpacks.length > 0;

  const handlePagedScrollNavigation = useCallback((
    event: ReactWheelEvent<HTMLDivElement>,
    currentPage: number,
    totalPages: number,
    navigate: (page: number) => void,
    deltaRef: { current: number },
    lockRef: { current: number }
  ) => {
    if (totalPages <= 1) return;

    const now = Date.now();
    if (now < lockRef.current) {
      // Debounce: reset the lock so continuous trackpad swipes must pause
      lockRef.current = now + PAGED_SCROLL_COOLDOWN_MS;
      event.preventDefault();
      return;
    }

    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(dominantDelta) < 4) {
      return;
    }

    deltaRef.current += dominantDelta;

    if (Math.abs(deltaRef.current) < PAGED_SCROLL_THRESHOLD) {
      event.preventDefault();
      return;
    }

    const direction = deltaRef.current > 0 ? 1 : -1;
    deltaRef.current = 0;

    const nextPage = Math.min(totalPages, Math.max(1, currentPage + direction));
    lockRef.current = now + PAGED_SCROLL_COOLDOWN_MS;

    if (nextPage !== currentPage) {
      event.preventDefault();
      navigate(nextPage);
      return;
    }

    event.preventDefault();
  }, []);

  const handleModBrowserWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    handlePagedScrollNavigation(
      event,
      modBrowserPage,
      modBrowserPageCount,
      navigateModBrowserPage,
      modBrowserScrollDeltaRef,
      modBrowserScrollLockRef
    );
  }, [handlePagedScrollNavigation, modBrowserPage, modBrowserPageCount, navigateModBrowserPage]);

  const handleMiscModpackWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (openMiscVersionMenuKey) {
      return;
    }

    handlePagedScrollNavigation(
      event,
      miscModpackPage,
      miscModpackPageCount,
      navigateMiscModpackPage,
      miscModpackScrollDeltaRef,
      miscModpackScrollLockRef
    );
  }, [handlePagedScrollNavigation, miscModpackPage, miscModpackPageCount, navigateMiscModpackPage, openMiscVersionMenuKey]);

  const handleCursorWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    handlePagedScrollNavigation(
      event,
      cursorPage,
      2, // totalPages
      setCursorPage,
      cursorScrollDeltaRef,
      cursorScrollLockRef
    );
  }, [handlePagedScrollNavigation, cursorPage]);

  // Load featured mods when store tab is opened

  // Load featured mods when store tab is opened
  useEffect(() => {
    if (activeTab === 'store' && featuredMods.length === 0) {
      // Load featured mods filtered by current loader
      const loaderType = activeLoader === 'vanilla' ? undefined : activeLoader;
      loadFeaturedMods(loaderType);
    }
  }, [activeTab]);

  const handleDownloadMod = async (mod: typeof modSearchResults[0]) => {
    setIsDownloadingMod(mod.project_id);
    try {
      const source = getMarketplaceSource(mod.source);
      // Auto-detect current game version and loader
      console.log(`[Mod Install] ========== STARTING MOD INSTALLATION ==========`);
      console.log(`[Mod Install] Mod: ${mod.title}`);
      console.log(`[Mod Install] Source: "${source}"`);
      console.log(`[Mod Install] selectedVersion: "${selectedVersion}"`);
      console.log(`[Mod Install] activeLoader: "${activeLoader}"`);
      console.log(`[Mod Install] currentInstalledVersions:`, currentInstalledVersions);

      // Keep mod installs pinned to the version currently open in mod manager.
      const modTargetVersion = selectedVersionForDetails || versionDetails?.version_id || selectedVersion || currentInstalledVersions[0] || '';
      if (!modTargetVersion) {
        throw new Error('Could not determine target version. Please select a version first.');
      }
      const context = resolveVersionContext(modTargetVersion, versionDetails);
      const gameVersion = context.gameVersion;
      const loader = context.loader;
      const modrinthLoader = context.modrinthLoader;
      
      console.log(`[Mod Install] ✓ Detected gameVersion: "${gameVersion}"`);
      console.log(`[Mod Install] ✓ Detected loader: "${loader}" -> modrinthLoader: "${modrinthLoader}"`);
      
      // Get mod versions with better compatibility checking
      const versions = await launcher.getModVersions(mod.project_id, source);
      console.log(`[Mod Install] Found ${versions.length} total versions for ${mod.title}`);
      console.log(`[Mod Install] First 3 versions:`, versions.slice(0, 3).map((v: any) => ({
        version: v.version_number,
        game_versions: v.game_versions,
        loaders: v.loaders
      })));
      
      // Extract base version (e.g., "1.21" from "1.21.1" or "1.21.6-fabric")
      const extractBaseVersion = (version: string) => {
        const match = version.match(/(\d+\.\d+)/);
        return match ? match[1] : version;
      };
      
      const baseGameVersion = extractBaseVersion(gameVersion);
      console.log(`[Mod Install] Base game version: "${baseGameVersion}"`);
      
      // Find compatible version with STRICT matching - prefer exact version match
      console.log(`[Mod Install] ========== STEP 1: Looking for EXACT match ==========`);
      let compatibleVersion = versions.find((v: any) => {
        const hasLoader = (v.loaders || []).some((l: string) => l.toLowerCase() === modrinthLoader.toLowerCase());
        const hasExactVersion = v.game_versions.includes(gameVersion);
        
        console.log(`[Mod Install]   Checking v${v.version_number}: loader=${hasLoader}, exactVersion=${hasExactVersion}, game_versions=[${v.game_versions.join(', ')}]`);
        
        if (hasLoader && hasExactVersion) {
          console.log(`[Mod Install] ✓✓✓ Found EXACT match: ${v.version_number} for ${gameVersion}`);
          return true;
        }
        return false;
      });
      
      // Try to find closest minor version match (e.g., prefer 1.21.9 over 1.21.11)
      if (!compatibleVersion) {
        console.log(`[Mod Install] ========== STEP 2: Looking for CLOSEST match in ${baseGameVersion}.x ==========`);
        // Sort versions by how close they are to the target version
        const versionsWithDistance = versions
          .filter((v: any) => {
            const hasLoader = (v.loaders || []).some((l: string) => l.toLowerCase() === modrinthLoader.toLowerCase());
            console.log(`[Mod Install]   Filtering v${v.version_number}: hasLoader=${hasLoader}`);
            return hasLoader;
          })
          .map((v: any) => {
            // Find the closest game version in this mod version
            let minDistance = Infinity;
            let closestGv = '';
            
            for (const gv of v.game_versions) {
              const baseGv = extractBaseVersion(gv);
              if (baseGv === baseGameVersion) {
                // Never auto-upgrade mods to a newer patch than the selected game version.
                if (compareMinecraftVersions(gv, gameVersion) > 0) {
                  continue;
                }

                // Parse version numbers for comparison
                const targetParts = gameVersion.split('.').map(Number);
                const gvParts = gv.split('.').map(Number);
                
                // Calculate distance (prefer lower versions when base matches)
                let distance = 0;
                for (let i = 0; i < Math.max(targetParts.length, gvParts.length); i++) {
                  const t = targetParts[i] || 0;
                  const g = gvParts[i] || 0;
                  distance += Math.abs(t - g) * Math.pow(10, 3 - i);
                }
                
                if (distance < minDistance) {
                  minDistance = distance;
                  closestGv = gv;
                }
              }
            }
            
            console.log(`[Mod Install]   v${v.version_number}: closestGv="${closestGv}", distance=${minDistance}`);
            return { version: v, distance: minDistance, closestGv };
          })
          .filter(item => {
            const isValid = item.distance < Infinity;
            if (!isValid) {
              console.log(`[Mod Install]   Filtered out v${item.version.version_number} (no matching base version)`);
            }
            return isValid;
          })
          .sort((a, b) => a.distance - b.distance);
        
        console.log(`[Mod Install] Found ${versionsWithDistance.length} versions in ${baseGameVersion}.x family`);
        if (versionsWithDistance.length > 0) {
          console.log(`[Mod Install] Top 3 closest:`, versionsWithDistance.slice(0, 3).map(v => ({
            version: v.version.version_number,
            closestGv: v.closestGv,
            distance: v.distance
          })));
        }
        
        if (versionsWithDistance.length > 0) {
          compatibleVersion = versionsWithDistance[0].version;
          console.log(`[Mod Install] ✓✓✓ Found CLOSEST match: ${compatibleVersion.version_number} (supports ${versionsWithDistance[0].closestGv}, distance: ${versionsWithDistance[0].distance})`);
        }
      }
      
      // Last resort: show error instead of installing wrong version
      if (!compatibleVersion) {
        console.error(`[Mod Install] ✗✗✗ No compatible version found for ${gameVersion} (${modrinthLoader})`);
        console.error(`[Mod Install] Available versions:`, versions.slice(0, 5).map((v: any) => ({
          version: v.version_number,
          game_versions: v.game_versions,
          loaders: v.loaders
        })));
        throw new Error(`No compatible version found for ${mod.title}\n\nYour version: ${gameVersion}\nLoader: ${modrinthLoader}\n\nPlease check if this mod supports your Minecraft version.`);
      }
      
      console.log(`[Mod Install] ========== FINAL SELECTION ==========`);
      console.log(`[Mod Install] Selected version: ${compatibleVersion.version_number}`);
      console.log(`[Mod Install] Game versions: [${compatibleVersion.game_versions.join(', ')}]`);
      console.log(`[Mod Install] Loaders: [${compatibleVersion.loaders.join(', ')}]`);
      console.log(`[Mod Install] Files: ${compatibleVersion.files.length}`);
      console.log(`[Mod Install] ========================================`);

      if (compatibleVersion && compatibleVersion.files.length > 0) {
        console.log(`[Mod Install] Installing version ${compatibleVersion.version_number} with ${compatibleVersion.files.length} files`);
        await installModWithDependencies(mod, compatibleVersion, gameVersion, modrinthLoader, modTargetVersion, source);
      } else {
        console.error(`[Mod Install] No compatible version found for ${mod.title}`);
        alert(`No compatible version found for ${mod.title}\n\nSearched for: ${gameVersion} (${modrinthLoader})`);
      }
    } catch (error) {
      console.error('Failed to download mod:', error);
      alert(`Failed to download mod: ${error}`);
    } finally {
      setIsDownloadingMod(null);
    }
  };

  // New function to handle mod installation with automatic dependency resolution
  const installModWithDependencies = async (
    mod: any,
    version: any,
    gameVersion: string,
    loader: string,
    targetVersionId?: string,
    source: 'modrinth' | 'curseforge' = 'modrinth'
  ) => {
    const resolvedTargetVersion = targetVersionId || selectedVersionForDetails || versionDetails?.version_id || selectedVersion || currentInstalledVersions[0];
    if (!resolvedTargetVersion) {
      throw new Error('No target version selected for mod installation.');
    }
    const normalizedLoader = loader.toLowerCase();

    const installQueue = new Set<string>();
    const installedMods = new Set<string>();
    
    // Recursive function to resolve dependencies
    const resolveDependencies = async (modId: string, versionId: string, modName: string) => {
      if (installedMods.has(modId)) return;
      
      try {
        // Get version details to check dependencies
        const versionDetails = await fetch(`https://api.modrinth.com/v2/version/${versionId}`)
          .then(res => res.json());
        
        // Process dependencies
        for (const dep of versionDetails.dependencies || []) {
          if (dep.dependency_type === 'required' && !installedMods.has(dep.project_id)) {
            console.log(`[Dependency] Found required dependency: ${dep.project_id}`);
            
            // Get dependency project info
            const depProject = await fetch(`https://api.modrinth.com/v2/project/${dep.project_id}`)
              .then(res => res.json());
            
            // Get compatible version of dependency using STRICT matching
            const depVersions = await launcher.getModVersions(dep.project_id);
            
            // Try exact match first
            let depVersion = depVersions.find((v: any) => 
              (v.loaders || []).some((l: string) => l.toLowerCase() === normalizedLoader) &&
              v.game_versions.includes(gameVersion)
            );
            
            // If no exact match, find closest version in same base version
            if (!depVersion) {
              const baseGameVersion = gameVersion.match(/(\d+\.\d+)/)?.[1] || gameVersion;
              const compatibleVersions = depVersions
                .filter((v: any) => (v.loaders || []).some((l: string) => l.toLowerCase() === normalizedLoader))
                .map((v: any) => {
                  let minDistance = Infinity;
                  for (const gv of v.game_versions) {
                    const baseGv = gv.match(/(\d+\.\d+)/)?.[1];
                    if (baseGv === baseGameVersion) {
                      if (compareMinecraftVersions(gv, gameVersion) > 0) {
                        continue;
                      }

                      const targetParts = gameVersion.split('.').map(Number);
                      const gvParts = gv.split('.').map(Number);
                      let distance = 0;
                      for (let i = 0; i < Math.max(targetParts.length, gvParts.length); i++) {
                        distance += Math.abs((targetParts[i] || 0) - (gvParts[i] || 0)) * Math.pow(10, 3 - i);
                      }
                      minDistance = Math.min(minDistance, distance);
                    }
                  }
                  return { version: v, distance: minDistance };
                })
                .filter(item => item.distance < Infinity)
                .sort((a, b) => a.distance - b.distance);
              
              depVersion = compatibleVersions[0]?.version;
            }
            
            if (!depVersion) {
              console.warn(`[Dependency] No compatible version found for ${depProject.title} (${gameVersion})`);
              continue; // Skip this dependency
            }
            
            if (depVersion) {
              installQueue.add(JSON.stringify({
                project_id: dep.project_id,
                version_id: depVersion.id,
                name: depProject.title || dep.project_id,
                file: depVersion.files[0]
              }));
              
              // Recursively resolve dependencies of dependencies
              await resolveDependencies(dep.project_id, depVersion.id, depProject.title);
            }
          }
        }
        
        installedMods.add(modId);
      } catch (error) {
        console.warn(`Failed to resolve dependencies for ${modName}:`, error);
      }
    };
    
    if (source === 'modrinth') {
      // Start dependency resolution for Modrinth projects only.
      await resolveDependencies(mod.project_id, version.id, mod.title);
    }
    
    // Add main mod to install queue
    installQueue.add(JSON.stringify({
      project_id: mod.project_id,
      version_id: version.id,
      name: mod.title,
      file: version.files[0]
    }));
    
    // Install all mods in queue
    let installed = 0;
    const total = installQueue.size;
    let successfulInstalls = 0;
    let mainModInstalled = false;
    const failedMods: string[] = [];
    
    for (const modDataStr of installQueue) {
      const modData = JSON.parse(modDataStr);
      installed++;
      
      try {
        console.log(`[Mod Install] Installing ${modData.name} (${installed}/${total})`);

        if (!modData.file?.url || !modData.file?.filename) {
          console.warn(`[Mod Install] Skipping ${modData.name}: missing downloadable file`);
          continue;
        }
        
        // Always install into the exact currently selected/open profile when possible.
        const targetGameVersion = resolvedTargetVersion;

        const modPath = await launcher.downloadMod(
          modData.project_id,
          modData.version_id,
          modData.file.filename,
          modData.file.url,
          targetGameVersion
        );
        
        console.log(`✓ Installed ${modData.name}: ${modPath}`);
        successfulInstalls++;
        if (modData.project_id === mod.project_id) {
          mainModInstalled = true;
        }
      } catch (error) {
        console.error(`Failed to install ${modData.name}:`, error);
        failedMods.push(modData.name || modData.project_id || 'unknown mod');
        // Continue with other mods even if one fails
      }
    }

    if (!mainModInstalled) {
      throw new Error(`Failed to install ${mod.title}${failedMods.length > 0 ? `.\nFailed: ${failedMods.join(', ')}` : ''}`);
    }

    // Silently installed - no alert dialogs
    console.log(`[Mod Install] Successfully installed ${mod.title}${total > 1 ? ` with ${total - 1} dependencies` : ''}`);
    if (failedMods.length > 0) {
      console.warn(`[Mod Install] Some dependencies failed: ${failedMods.join(', ')}`);
    }
    
    // Refresh mod list for the exact target profile so UI and toggles are immediately correct.
    await loadAllMods(resolvedTargetVersion);
  };

  const formatDownloads = useCallback((num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }, []);

  const filteredCategories = useMemo(() => {
    console.log('[FilteredCategories] currentCategories:', currentCategories.map(c => ({ id: c.id, versions: c.versions.length })));
    return currentCategories.filter(cat =>
      cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.versions.some(v => v.includes(searchQuery))
    );
  }, [currentCategories, searchQuery]);

  const sidebarTabs = useMemo(() => [
    { id: "home" as const, icon: playNewIcon, label: "Play", isSvg: true },
    { id: "versions" as const, icon: versionIcon, label: "Versions", isSvg: true },
    { id: "servers" as const, icon: nametagIcon, label: "Misc Store", isSvg: true },
    { id: "news" as const, icon: newsIcon, label: "Skins", isSvg: true },
  ], []);

  const triggerLaunchButtonFill = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const maxX = Math.max(x, rect.width - x);
    const maxY = Math.max(y, rect.height - y);
    const size = Math.sqrt(maxX * maxX + maxY * maxY) * 2;
    const id = Date.now() + Math.random();

    setLaunchButtonFills((prev) => [...prev, { id, x, y, size }]);

    setTimeout(() => {
      setLaunchButtonFills((prev) => prev.filter((fill) => fill.id !== id));
    }, 760);
  }, []);


  // Premium Home Tab - Zimoxy Style
  const renderHome = () => {
    return (
      <div className="flex-1 flex flex-col">
        {/* Full screen hero */}
        <div className="relative flex-1 overflow-hidden bg-[#09090b]">
          {/* Premium smooth fade overlay at top */}
          <div 
            className="absolute top-0 left-0 right-0 h-16 z-50 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.1) 75%, transparent 100%)'
            }}
          />
          
          {/* Background - Image for all loaders */}
          <div className="absolute inset-x-0 top-0 h-[55%]">
            <>
              {/* Image Background for all loaders */}
                {/* Grayscale version (base layer during install) */}
                <AnimatePresence>
                  {isInstalling && (
                    <motion.div
                      key={`install-${activeLoader}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.85 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="absolute inset-0 bg-cover bg-center grayscale"
                      style={{
                        backgroundImage: `url(${currentWallpaper})`,
                        backgroundSize: 'cover',
                        zIndex: 1,
                      }}
                    />
                  )}
                </AnimatePresence>
                {/* Dimmed version as base during launch */}
                <AnimatePresence>
                  {isLaunching && (
                    <motion.div
                      key={`launch-${activeLoader}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.25 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${currentWallpaper})`,
                        backgroundSize: 'cover',
                        zIndex: 1,
                      }}
                    />
                  )}
                </AnimatePresence>
                {/* Color version with smooth crossfade and clip mask */}
                <motion.div
                  key={`wallpaper-${activeLoader}`}
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: 0.85
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ 
                    opacity: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
                  }}
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${currentWallpaper})`,
                    backgroundSize: 'cover',
                    clipPath: (isInstalling || isLaunching)
                      ? `inset(0 ${100 - (isInstalling ? installProgress : launchProgress)}% 0 0)` 
                      : 'inset(0 0 0 0)',
                    transition: 'clip-path 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 2,
                    filter: activeLoader === 'misc'
                      ? 'hue-rotate(320deg) saturate(1.2)'
                      : (activeLoader === 'vanilla' || activeLoader === 'quilt')
                        ? 'hue-rotate(320deg) saturate(1.2)'
                        : 'none'
                  }}
                />
              </>

            {/* Smooth gradient fade to dark - like Zimoxy */}
            <div
              className="absolute inset-0"
              style={{
                background: activeLoader === 'quilt'
                  ? 'linear-gradient(to bottom, transparent 0%, transparent 20%, rgba(9,9,11,0.5) 50%, rgba(9,9,11,0.9) 80%, #09090b 100%)'
                  : 'linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(9,9,11,0.4) 65%, rgba(9,9,11,0.8) 85%, #09090b 100%)',
                zIndex: 4
              }}
            />
            {/* Subtle top vignette */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-transparent" style={{ zIndex: 3 }} />
            
            {/* Corner blur overlays - Left and Right */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 4 }}>
              {/* Left corner blur */}
              <div 
                className="absolute left-0 top-0 bottom-0 w-1/3"
                style={{
                  background: 'radial-gradient(ellipse at left center, rgba(0,0,0,0.6) 0%, transparent 70%)',
                }}
              />
              {/* Right corner blur */}
              <div 
                className="absolute right-0 top-0 bottom-0 w-1/3"
                style={{
                  background: 'radial-gradient(ellipse at right center, rgba(0,0,0,0.6) 0%, transparent 70%)',
                }}
              />
            </div>
          </div>

          {/* Dark section with topographic pattern - covers full area */}
          <div className="absolute inset-0" style={{ zIndex: 5 }}>
            {/* Topography pattern - white on black background */}
            <motion.div
              key={`topography-${activeLoader}-${tier.name}-${tierKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.08 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
              style={{
                backgroundImage: `url('/topography-white.svg?v=${tierKey}')`,
                backgroundSize: '1200px auto',
                backgroundPosition: 'center',
                backgroundRepeat: 'repeat',
                maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 45%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,1) 65%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 45%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,1) 65%)',
              }}
            />
          </div>

          {/* Content - Centered */}
          <div className="relative z-10 h-full flex flex-col items-center justify-center px-8">
            {/* Logo/Icon - hidden during install + post-install auto-launch only */}
            {!((isInstalling && isLoaderBusy) || isAutoLaunchingAfterInstall) && (
              <motion.div
                initial={{ opacity: 0, y: -15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                className={`mb-4 ${activeLoader === "dragon" ? "relative" : ""}`}
              >
                {activeLoader === "dragon" ? (
                  <>
                    {/* Invisible spacer to maintain layout */}
                    <div className="h-20 w-20" />
                    {/* Absolute positioned large logo */}
                    <img
                      src={dragonLogo}
                      alt="TrapGaint"
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-32 object-contain rounded-xl"
                    />
                  </>
                ) : (
                  <img
                    src={activeLoader === "lapetus" ? dragonTitle : (LOADERS[activeLoader].logo || dragonTitle)}
                    alt={activeLoader === "lapetus" ? "Resonance" : LOADERS[activeLoader].name}
                    className="h-20 object-contain rounded-xl"
                    style={activeLoader === 'misc' ? { filter: 'hue-rotate(130deg) saturate(1.5) brightness(1.3)' } : undefined}
                  />
                )}
              </motion.div>
            )}


            {/* Banner Install/Launch Progress */}
            {(isLoaderBusy && isInstalling) || isAutoLaunchingAfterInstall ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="absolute inset-0 flex items-center justify-center -translate-y-16 md:-translate-y-24 pointer-events-none"
                style={{ zIndex: 20 }}
              >
                <div className="flex flex-col items-center leading-none text-center">
                  <p
                    className="text-[5rem] md:text-[6.5rem] text-zinc-100 font-semibold tracking-wide"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" }}
                  >
                    {isAutoLaunchingAfterInstall ? "Launching" : `${Math.round(bannerLineProgress)}%`}
                  </p>
                </div>
              </motion.div>
            ) : null}

            {/* Main Title */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-center mb-4"
            >
              <h1 className="text-4xl md:text-5xl font-normal text-white tracking-wide" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                {isAutoLaunchingAfterInstall ? null :
                isInstalling && (runningLoader === activeLoader || runningLoader === 'modpacks') ? null :
                  isLaunching && (runningLoader === activeLoader || runningLoader === 'modpacks') ? "Launching Game..." :
                    isPlaying && (runningLoader === activeLoader || runningLoader === 'modpacks') ? "Game is Running" :
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      >
                        {getGreeting()}, {username}
                      </motion.span>}
              </h1>
            </motion.div>

            {/* Action Button */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {isAutoLaunchingAfterInstall ? null : isLoaderBusy && isInstalling ? null : isLoaderBusy && isLaunching ? (
                <button
                  disabled
                  className="px-20 py-3 bg-transparent border border-zinc-600 rounded-full font-normal text-2xl cursor-not-allowed tracking-wider"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.2em' }}
                >
                  <ShiningText text="Launching..." className="text-2xl" duration={1.5} />
                </button>
              ) : isPlaying && (runningLoader === activeLoader || runningLoader === 'modpacks') ? (
                <button
                  onClick={handleStop}
                  className="px-20 py-3 bg-transparent border border-zinc-600 rounded-full text-white font-normal text-2xl hover:bg-white/5 hover:border-zinc-500 transition-all tracking-wider"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.2em' }}
                >
                  Stop Game
                </button>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={(event) => {
                      triggerLaunchButtonFill(event);
                      if (activeLoader === "lapetus" || isVersionInstalled) {
                        void handleLaunch();
                      } else {
                        void handleInstall();
                      }
                    }}
                    disabled={isPlaying || isInstalling || isLaunching}
                    className={`relative isolate overflow-hidden px-20 py-3 bg-transparent border border-zinc-600 rounded-full font-normal text-2xl transition-all tracking-wider ${isPlaying || isInstalling || isLaunching
                      ? 'text-zinc-500 cursor-not-allowed'
                      : 'text-white hover:bg-white/5 hover:border-zinc-500'
                      }`}
                    style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.2em' }}
                  >
                    <span className="absolute inset-0 pointer-events-none overflow-hidden rounded-full z-0">
                      {launchButtonFills.map((fill) => (
                        <span
                          key={fill.id}
                          className="launch-button-fill-effect"
                          style={{
                            left: `${fill.x}px`,
                            top: `${fill.y}px`,
                            width: `${fill.size}px`,
                            height: `${fill.size}px`,
                          }}
                        />
                      ))}
                    </span>
                    <span className="relative z-10">
                      <ShiningText 
                        text={activeLoader === "lapetus" || isVersionInstalled ? "Launch" : "Install"} 
                        className="text-2xl" 
                        duration={2} 
                      />
                    </span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>

          {/* Footer */}
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-6 text-xs text-zinc-600">
            <span></span>
            <span style={{ fontFamily: "'Panchang', sans-serif" }}>v{formatVersionDisplay(selectedVersion || "")}</span>
          </div>
        </div>
      </div>
    );
  };

  // Premium Versions Tab
  const renderVersions = () => (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-black">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* Version Details View - Mod Manager Style */}
          {selectedVersionForDetails && versionDetails ? (
            <motion.div
              key="version-details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden relative bg-black"
            >
              {/* Mod Background Image with Loader-based Hue */}
              <div
                className="absolute inset-0 opacity-[0.85] pointer-events-none"
                style={{
                  backgroundImage: 'url(/bg-chat-4k.png)',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: modManagerTheme.backgroundFilter
                }}
              />
              
              {/* Fade gradient at top for header visibility - same as home section */}
              <div 
                className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
                style={{
                  background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.1) 85%, transparent 100%)'
                }}
              />
              {/* Header Bar */}
              <div className="flex items-center justify-between px-6 py-4 shrink-0 relative z-50">
                <div className="flex items-center gap-4">
                  {/* Back Button */}
                  <button
                    onClick={() => {
                      if (showInstallMods) {
                        setShowInstallMods(false);
                      } else {
                        setSelectedVersionForDetails(null);
                        setVersionDetails(null);
                      }
                    }}
                    className={`text-white/60 hover:text-white transition-colors ${showInstallMods ? 'cursor-none' : ''}`}
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  {/* Title */}
                  <h1 className="text-lg font-bold text-white tracking-wide">
                    {showInstallMods ? 'TRAPGAINT' : 'MOD MANAGER'}
                  </h1>
                </div>

                <div className="flex items-center gap-3">
                  {/* Version Badge */}
                  <span className="px-3 py-1.5 bg-zinc-800 rounded-lg text-sm text-white/80 font-medium">
                    {versionDetails.base_version}
                  </span>

                  {/* Open Mod Folder Button - Black */}
                  {!showInstallMods && (
                    <button
                      onClick={async () => {
                        try {
                          const versionId = versionDetails?.version_id || selectedVersion;
                          const minecraftDir = await launcher.getMinecraftDir();
                          const context = resolveVersionContext(versionId, versionDetails);
                          
                          console.log('[Open Folder] Version ID:', versionId);
                          console.log('[Open Folder] Minecraft Dir:', minecraftDir);
                          
                          // Construct mods folder path based on version type
                          let modsFolder = '';
                          
                          // Check if it's a modded version (has instance directory)
                          const normalizedVersionId = (versionId || '').toLowerCase();
                          const normalizedLoader = (context.loader || versionDetails?.loader || '').toLowerCase();
                          const usesInstanceModsFolder = context.isMiscSelection
                            || normalizedVersionId.includes('forge')
                            || normalizedVersionId.includes('fabric')
                            || normalizedVersionId.includes('quilt')
                            || normalizedVersionId.includes('dragon')
                            || normalizedVersionId.includes('lapetus')
                            || ['forge', 'fabric', 'quilt', 'dragon', 'lapetus'].includes(normalizedLoader);

                          if (usesInstanceModsFolder) {
                            // Modded versions use instances directory
                            modsFolder = `${minecraftDir}/instances/${versionId}/mods`;
                          } else {
                            // Vanilla versions use global mods directory
                            modsFolder = `${minecraftDir}/mods`;
                          }
                          
                          console.log('[Open Folder] Target path:', modsFolder);
                          
                          // Create the folder if it doesn't exist
                          try {
                            const { invoke } = await import('@tauri-apps/api/core');
                            await invoke('create_directory', { path: modsFolder });
                            console.log('[Open Folder] Directory created/verified');
                          } catch (mkdirError) {
                            console.log('[Open Folder] Directory might already exist:', mkdirError);
                          }
                          
                          // Open the folder
                          await launcher.openFolder(modsFolder);
                          console.log('[Open Folder] Folder opened successfully');
                        } catch (error) {
                          console.error('[Open Folder] Failed to open mods folder:', error);
                          alert('Failed to open mods folder: ' + error);
                        }
                      }}
                      className="h-9 px-6 bg-black hover:bg-zinc-900 text-white rounded-full text-sm font-medium transition-colors"
                    >
                      Open Folder
                    </button>
                  )}

                  {!showInstallMods && (
                    <button
                      onClick={() => {
                        setActiveTab("friends");
                      }}
                      className="h-9 px-6 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full text-sm font-medium transition-colors"
                    >
                      Modpacks
                    </button>
                  )}

                  {/* Install Mod Button - White */}
                  {!showInstallMods && (
                    <button
                      onClick={async () => {
                        // Open panel immediately for instant response
                        setShowInstallMods(true);
                        
                        // Reset search state
                        setModBrowserSearchQuery("");
                        setModBrowserPage(1);

                        // Get current version to load mods for
                        const currentVersion = selectedVersionForDetails || versionDetails?.version_id || selectedVersion || currentInstalledVersions[0];
                        console.log(`[Install Mod Button] Current version:`, currentVersion);

                        // Refresh installed mods once when opening install mode so
                        // manually-added jars are immediately marked as installed.
                        if (currentVersion) {
                          await loadAllMods(currentVersion);
                        }

                        // Fetch version details if not already loaded or if version changed
                        if (!versionDetails || versionDetails.version_id !== currentVersion) {
                          console.log(`[Install Mod Button] Fetching version details for:`, currentVersion);
                          try {
                            const info = await launcher.getVersionInfo(currentVersion);
                            setVersionDetails(info);
                            console.log(`[Install Mod Button] Version details loaded:`, info);

                            const context = resolveVersionContext(currentVersion, info);
                            console.log(`[Install Mod Button] Loading mods for ${context.gameVersion} (${context.modrinthLoader})`);
                            loadFeaturedMods(context.modrinthLoader, context.gameVersion, 1);
                          } catch (error) {
                            console.error(`[Install Mod Button] Failed to fetch version details:`, error);
                            const context = resolveVersionContext(currentVersion);
                            console.log(`[Install Mod Button] Fallback resolve: ${context.gameVersion} (${context.modrinthLoader})`);
                            loadFeaturedMods(context.modrinthLoader, context.gameVersion, 1);
                          }
                        } else {
                          console.log(`[Install Mod Button] Using cached version details:`, versionDetails);
                          const context = resolveVersionContext(currentVersion, versionDetails);
                          console.log(`[Install Mod Button] Loading mods for ${context.gameVersion} (${context.modrinthLoader})`);
                          loadFeaturedMods(context.modrinthLoader, context.gameVersion, 1);
                        }
                      }}
                      className="h-9 px-6 bg-white hover:bg-zinc-100 text-black rounded-full text-sm font-medium transition-colors"
                    >
                      Install Mod
                    </button>
                  )}

                  {/* Inline Search in Install Mode */}
                  {showInstallMods && (
                    <div className="flex-1 max-w-md">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
                        <input
                          type="text"
                          placeholder="Search mods..."
                          value={modBrowserSearchQuery}
                          onChange={(e) => {
                            const query = e.target.value;
                            setModBrowserSearchQuery(query);
                            
                            // Clear previous timeout
                            if (spotlightSearchDebounce) {
                              clearTimeout(spotlightSearchDebounce);
                            }
                            
                            // Debounce search by 500ms
                            const timeout = setTimeout(() => {
                              if (query.trim()) {
                                const context = resolveVersionContext();
                                searchModsWithPagination(query, context.modrinthLoader, context.gameVersion, 1);
                              } else {
                                setModSearchResults([]);
                                const context = resolveVersionContext();
                                loadFeaturedMods(context.modrinthLoader, context.gameVersion, 1);
                              }
                            }, 500);
                            
                            setSpotlightSearchDebounce(timeout);
                          }}
                          className="w-full h-9 pl-10 pr-4 bg-zinc-800/50 hover:bg-zinc-800 text-white rounded-full text-sm placeholder:text-white/40 border border-white/10 focus:border-white/20 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  )}


                </div>
              </div>

              {/* Content */}
              <div 
                className={`flex-1 overflow-y-auto scrollbar-hide p-6 ${showInstallMods ? 'cursor-none' : ''}`}
                style={showInstallMods ? { cursor: 'none' } : {}}
                onWheelCapture={showInstallMods ? handleModBrowserWheel : undefined}
              >
                {showInstallMods ? (
                  /* Install Mods Grid */
                  <div style={{ cursor: 'none' }} className="cursor-none [&_*]:cursor-none install-mods-container">
                    <style>{`
                      .install-mods-container,
                      .install-mods-container *,
                      .install-mods-container *::before,
                      .install-mods-container *::after,
                      .install-mods-container button,
                      .install-mods-container a,
                      .install-mods-container input,
                      .install-mods-container [role="button"] {
                        cursor: none !important;
                      }
                    `}</style>
                  <div>
                    {isLoadingFeatured ? (
                      <AnimatedLoadingSkeleton />
                    ) : visibleModBrowserItems.length > 0 ? (
                      <>
                        <div className="relative">
                          <div 
                            className={`grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 cursor-none transition-opacity duration-200 ${
                              showModBrowserPageSkeleton ? 'opacity-35' : 'opacity-100'
                            }`}
                            style={{ cursor: 'none', gridAutoRows: 'minmax(130px, auto)' }}
                          >
                          {visibleModBrowserItems.map((mod) => {
                            // Check if mod is already installed with improved matching
                            const isInstalled = allMods.some((installedMod: any) => {
                              const installedModId = normalizeModIdentity(installedMod.mod_id);
                              const installedFileName = normalizeModIdentity(cleanModFileName(installedMod.name));
                              const installedDisplayName = normalizeModIdentity(installedMod.display_name);

                              const projectId = normalizeModIdentity(mod.project_id);
                              const modSlug = normalizeModIdentity(mod.slug);
                              const modTitle = normalizeModIdentity(mod.title);

                              // Exact mod_id match (most reliable)
                              if (installedModId && (installedModId === projectId || installedModId === modSlug)) {
                                return true;
                              }

                              // Check filename against normalized slug/project/title
                              if (
                                installedFileName &&
                                (
                                  (modSlug && installedFileName.includes(modSlug)) ||
                                  (projectId && installedFileName.includes(projectId)) ||
                                  (modTitle && installedFileName.includes(modTitle))
                                )
                              ) {
                                return true;
                              }

                              // Check display metadata fallback
                              if (
                                installedDisplayName &&
                                (
                                  (modTitle && installedDisplayName === modTitle) ||
                                  (modSlug && installedDisplayName === modSlug) ||
                                  (projectId && installedDisplayName === projectId)
                                )
                              ) {
                                return true;
                              }
                              
                              return false;
                            });

                            return (
                              <FollowerPointerCard
                                key={mod.project_id}
                                title={mod.title}
                                className="h-full"
                              >
                                <div
                                  className="relative rounded-3xl transition-all overflow-hidden h-full cursor-none backdrop-blur-xl flex"
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid rgba(255, 255, 255, 0.12)',
                                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
                                  }}
                                >
                                {/* Mod Icon - 30% width, full height */}
                                <div className="w-[30%] h-full bg-zinc-800 shrink-0 flex items-center justify-center overflow-hidden cursor-none">
                                  {mod.icon_url ? (
                                    <img src={mod.icon_url} alt={mod.title} className="w-full h-full object-cover cursor-none" />
                                  ) : (
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="cursor-none">
                                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                      <path d="M2 17L12 22L22 17" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                      <path d="M2 12L12 17L22 12" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>

                                {/* Mod Content - 70% width */}
                                <div className="flex-1 p-3 flex flex-col justify-between cursor-none gap-2">
                                  {/* Mod Info */}
                                  <div className="cursor-none">
                                    <h3 className="text-white font-semibold text-lg truncate mb-0.5 cursor-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                                      {mod.title}
                                    </h3>
                                    <p className="text-zinc-400 text-sm truncate cursor-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                                      {mod.author || `${formatDownloads(mod.downloads)} downloads`} • {getMarketplaceSource(mod.source) === 'curseforge' ? 'CurseForge' : 'Modrinth'}
                                    </p>
                                  </div>

                                  {/* Install Button */}
                                  <div className="relative z-10 flex justify-end cursor-none mt-auto">
                                  {isInstalled ? (
                                    <span className="h-8 px-4 bg-black rounded-full text-xs text-white font-medium flex items-center cursor-none shrink-0">
                                      Installed
                                    </span>
                                  ) : (
                                    <button
                                      onClick={async () => {
                                        await handleDownloadMod(mod);
                                      }}
                                      disabled={isDownloadingMod === mod.project_id}
                                      className="cursor-none h-8 px-4 bg-white hover:bg-zinc-100 disabled:bg-white/50 rounded-full text-xs text-black font-medium transition-colors shrink-0"
                                    >
                                      {isDownloadingMod === mod.project_id ? 'Installing...' : 'Install'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            </FollowerPointerCard>
                            );
                          })}
                          </div>

                          {showModBrowserPageSkeleton && (
                            <div className="pointer-events-none absolute inset-0 z-10">
                              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {Array.from({ length: Math.max(visibleModBrowserItems.length, MODS_PER_PAGE) }).map((_, index) => (
                                  <div
                                    key={`mod-browser-page-skeleton-${index}`}
                                    className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl"
                                    style={{ boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.26)' }}
                                  >
                                    <div className="flex h-full">
                                      <div className="w-[30%] rounded-2xl bg-white/10 animate-pulse" />
                                      <div className="flex-1 pl-4 flex flex-col justify-between">
                                        <div>
                                          <div className="h-6 w-4/5 rounded-full bg-white/10 animate-pulse" />
                                          <div className="mt-2 h-3.5 w-3/5 rounded-full bg-white/10 animate-pulse" />
                                        </div>
                                        <div className="flex justify-end">
                                          <div className="h-9 w-24 rounded-full bg-white/10 animate-pulse" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Pagination */}
                        {modBrowserTotalHits > MODS_PER_PAGE && (
                          <div className="flex flex-col items-center gap-2.5 mt-6 pb-4">
                            <div className="flex items-center justify-center gap-2">
                              {getVisiblePageIndices(modBrowserPage - 1, modBrowserPageCount).map((pageIndex) => (
                                <button
                                  key={`mod-browser-page-${pageIndex}`}
                                  onClick={() => navigateModBrowserPage(pageIndex + 1)}
                                  className={`cursor-none rounded-full transition-all ${
                                    modBrowserPage - 1 === pageIndex
                                      ? 'w-16 h-2 bg-white shadow-lg'
                                      : 'w-2 h-2 bg-white/50 hover:bg-white/70 shadow-md'
                                  }`}
                                  aria-label={`Go to mod page ${pageIndex + 1}`}
                                />
                              ))}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-white/28">
                              Page {modBrowserPage} of {modBrowserPageCount}
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-white/18">
                              <Mouse className="h-3 w-3 text-white/22" />
                              <span>Scroll to change page</span>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-4">
                          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#3F3F46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M2 17L12 22L22 17" stroke="#3F3F46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M2 12L12 17L22 12" stroke="#3F3F46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p className="text-lg text-zinc-500 mb-2">No mods found</p>
                        <p className="text-sm text-zinc-600">
                          {modBrowserSearchQuery.trim()
                            ? 'Checked Modrinth and CurseForge for that search.'
                            : 'Try a different search or browse featured mods.'}
                        </p>
                      </div>
                    )}
                  </div>
                  </div>
                ) : (
                  /* Installed Mods Grid */
                  <>
                    {isLoadingMods ? (
                      <AnimatedLoadingSkeleton />
                    ) : allMods.length > 0 ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {allMods.map((mod: any, i: number) => (
                          <div
                            key={i}
                            className={`relative rounded-3xl p-6 transition-all overflow-hidden backdrop-blur-xl ${mod.enabled === false || isModPathDisabled(mod.path) ? 'opacity-50' : ''}`}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
                            }}
                          >
                            {/* Mod Info Section */}
                            <div className="flex w-full items-center justify-between gap-3">
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-semibold text-white text-base">
                                  {sanitizeModMetadataText(mod.display_name) || cleanModFileName(mod.name)}
                                </span>
                                <span className="text-white/80 text-sm">
                                  {sanitizeModMetadataText(mod.version) || sanitizeModMetadataText(mod.author) || 'Unknown Version'}
                                </span>
                              </div>

                              {/* Toggle Switch - Hide for Dragon Client mod */}
                              {!mod.name.toLowerCase().includes('dragonclient') && !mod.display_name?.toLowerCase().includes('dragon client') && (
                                <div className="shrink-0">
                                  <FigmaSwitch
                                    checked={mod.enabled !== false && !isModPathDisabled(mod.path)}
                                    activeColor={modManagerTheme.accent}
                                    inactiveColor="rgba(63, 63, 70, 0.92)"
                                    activeShadow={`0 10px 26px -14px ${modManagerTheme.accentHover}, inset 0 1px 0 rgba(255,255,255,0.2)`}
                                    inactiveShadow="inset 0 1px 0 rgba(255,255,255,0.08)"
                                    thumbBorderColor={modManagerTheme.accentBorder}
                                    onChange={async (checked) => {
                                      try {
                                        console.log('[Toggle] Toggling mod:', mod.path, 'enabled:', mod.enabled);
                                        await launcher.toggleMod(mod.path);
                                        // Refresh mods list
                                        await loadAllMods(selectedVersionForDetails || versionDetails.version_id);
                                      } catch (e) {
                                        console.error('Failed to toggle mod:', e);
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <NoModsFound 
                        onInstallClick={() => {
                          setShowInstallMods(true);
                          setModBrowserSearchQuery("");
                          setModBrowserPage(1);
                          const context = resolveVersionContext();
                          loadFeaturedMods(context.modrinthLoader, context.gameVersion, 1);
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </motion.div>
          ) : selectedCategory ? (
            <motion.div
              key="versions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden px-4 relative"
            >
              {/* Background Image with Loader-based Hue */}
              <div
                className="absolute inset-0 opacity-[0.85] pointer-events-none"
                style={{
                  backgroundImage: 'url(/bg-chat-4k.png)',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: activeLoader === 'vanilla' ? 'hue-rotate(220deg) saturate(1.04)' : // green
                    activeLoader === 'forge' ? 'hue-rotate(130deg) saturate(0.9)' : // orange
                    activeLoader === 'fabric' ? 'hue-rotate(145deg) saturate(1.0)' : // golden
                    activeLoader === 'quilt' ? 'hue-rotate(30deg) saturate(1.0)' : // purple
                    activeLoader === 'dragon' ? 'hue-rotate(108deg) saturate(0.94)' : // green
                    activeLoader === 'lapetus' ? 'hue-rotate(180deg) saturate(0.8)' : // cyan
                    activeLoader === 'misc' ? 'hue-rotate(130deg) saturate(0.8)' :
                    'hue-rotate(260deg) saturate(0.9)'
                }}
              />
              
              {/* Fade gradient at top */}
              <div 
                className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.1) 85%, transparent 100%)'
                }}
              />
              
              {/* Fixed Header */}
              <div className="shrink-0 relative z-20">
                {/* Category Name Header */}
                <div className="text-center pt-3 pb-2">
                  <h2 className="text-[8.5rem] leading-[0.92] tracking-[0.02em] font-bold text-white drop-shadow-2xl mb-6" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    {activeLoader === "lapetus" ? (
                      selectedCategory?.name ?
                        selectedCategory.name
                          .split(' Official')[0]
                          .split(' [')[0]
                          .split(':')[0]
                          .split(' -')[0]
                          .split(' |')[0]
                          .trim()
                        : "1.20"
                    ) : (
                      selectedCategory?.name
                        .split(' Official')[0]
                        .split(' [')[0]
                        .split(':')[0]
                        .split(' -')[0]
                        .split(' |')[0]
                        .trim()
                    )}
                  </h2>
                  <p className="text-white/60 text-sm mt-1 mb-5">
                    {isComingSoonCategoryForLoader(activeLoader, selectedCategory?.id || '', selectedCategory?.versions.length || 0)
                      ? 'Coming soon'
                      : `${selectedCategory?.versions.length || 0} versions available`}
                  </p>
                  
                  {/* Single Capsule with both buttons */}
                  <div className="inline-flex items-stretch rounded-full overflow-hidden mb-6">
                    {/* Back Button - White */}
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className="text-black font-normal text-sm transition-all tracking-wider flex items-center gap-2 px-6 py-2 hover:bg-gray-100"
                      style={{ 
                        fontFamily: "'Bebas Neue', sans-serif",
                        background: '#ffffff'
                      }}
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to Categories</span>
                    </button>

                    {/* Mods Button - Black - Only show if modpack is installed */}
                    {(() => {
                      let version;
                      let isInstalled = false;
                      
                      if (activeLoader === "lapetus") {
                        const modpackName = selectedCategory?.name || '';
                        const cleanName = modpackName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                        version = lapetusVersions.find(v => v.startsWith(cleanName));
                        isInstalled = !!version;
                      } else {
                        version = selectedVersion || selectedCategory?.versions[0];
                        isInstalled = version ? isInstalledForLoader(activeLoader, version, currentInstalledVersions) : false;
                      }

                      if (!isInstalled || activeLoader === 'vanilla') return null;

                      return (
                        <button
                          onClick={async () => {
                            if (version) {
                              try {
                                console.log('[Mods Button] Opening mod manager for version:', version);
                                const info = await launcher.getVersionInfo(version);
                                setVersionDetails(info);
                                setSelectedVersionForDetails(version);
                                await loadAllMods(version);
                                setTimeout(() => {
                                  const context = resolveVersionContext(version, info);
                                  loadFeaturedMods(context.modrinthLoader, context.gameVersion, 1);
                                }, 100);
                              } catch (error) {
                                console.error('Failed to get version info:', error);
                              }
                            }
                          }}
                          className="text-white text-sm font-medium tracking-wider uppercase transition-all flex items-center gap-2 px-6 py-2 hover:bg-zinc-800"
                          style={{ 
                            fontFamily: "'Bebas Neue', sans-serif", 
                            letterSpacing: '0.1em',
                            background: '#000000'
                          }}
                        >
                          <span>Mods</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Scrollable Version List */}
              <div className="flex-1 overflow-y-auto min-h-0 relative z-20">
                {selectedCategory?.id === COUSTOM_CATEGORY_ID ? (
                  <div className="pr-2">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 p-4 pb-[200px]">
                      {customMiscSelections.map((item) => {
                        const runtimeVersionId = item.installedVersionId || createMiscRuntimeVersionId(item);
                        const isInstalled = miscInstalledVersions.includes(runtimeVersionId);

                        return (
                        <div key={item.versionId} className="pt-5 pb-5">
                          <VersionCard
                            version={runtimeVersionId}
                            displayName={item.minecraftVersion}
                            loaderLabel={
                              item.category === "modpacks"
                                ? "MODPACK"
                                : item.category === "shaders"
                                  ? "SHADER"
                                  : "RESOURCE PACK"
                            }
                            installed={isInstalled}
                            selected={selectedVersion === runtimeVersionId || selectedCoustomVersionId === item.versionId}
                            hideVersionLabel={true}
                            subtitle={item.name}
                            contentAlignment="upper"
                            subtitlePlacement="border-float"
                            loaderLabelPlacement="border-float-top"
                            onClick={() => {
                              setSelectedCoustomVersionId(item.versionId);
                              setSelectedVersion(runtimeVersionId);
                              if (isInstalled) {
                                setSelectedCategory(null);
                                setActiveTab("home");
                              } else {
                                void handleInstall(runtimeVersionId);
                              }
                            }}
                          />
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ) : activeLoader === "lapetus" && selectedCategory?.id && modpacks.find(m => m.id === selectedCategory.id) ? (
                  /* Modpack versions list */
                  <div className="flex flex-col divide-y divide-white/5">
                    {modpackVersions.map((version: any) => {
                      // Check if this modpack version is installed
                      // The installed version ID format is: {modpack-name}-{mc-version}
                      // e.g., "fabulously-optimized-1.21.11"
                      const gameVersions = version.game_versions || [];
                      const sortedVersions = gameVersions.sort((a: string, b: string) => {
                        const aParts = a.split('.').map(Number);
                        const bParts = b.split('.').map(Number);
                        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                          const aNum = aParts[i] || 0;
                          const bNum = bParts[i] || 0;
                          if (aNum !== bNum) return bNum - aNum;
                        }
                        return 0;
                      });
                      const gameVersion = sortedVersions[0] || "Unknown";

                      // Build expected version ID
                      const modpackName = selectedModpack?.name || '';
                      const cleanName = modpackName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                      const expectedVersionId = `${cleanName}-${gameVersion}`;

                      // Check if installed (check both Fabric/Quilt AND Forge versions)
                      const installed = lapetusVersions.includes(expectedVersionId) || installedForgeVersions.includes(expectedVersionId);
                      const selected = selectedVersion === expectedVersionId;

                      return (
                        <button
                          key={version.id}
                          onClick={async () => {
                            if (installed) {
                              // Select the installed version ID and go to home/launch page
                              setSelectedVersion(expectedVersionId);
                              setSelectedCategory(null);
                              setActiveTab("home");
                            } else {
                              // Install this modpack version
                              try {
                                console.log("[Modpack Install] Starting installation for:", version.id, gameVersion);
                                setIsInstalling(true);
                                setInstallProgress(0);
                                setInstallStatus(`Installing ${selectedModpack?.name || 'modpack'}...`);
                                setRunningLoader('modpacks'); // Set running loader for progress display
                                setSelectedCategory(null);
                                setActiveTab("home");

                                const installedVersionId = await launcher.installModpack(
                                  version.id,
                                  selectedModpack?.name || 'modpack',
                                  gameVersion,
                                  (progress, status) => {
                                    console.log("[Modpack Install] Progress:", progress, status);
                                    setInstallProgress(progress * 100); // Convert to percentage
                                    setInstallStatus(status);
                                    setGameLogs(prev => [...prev.slice(-50), `[INFO] ${status}`]);
                                  }
                                );

                                console.log("[Modpack Install] Installation complete! Version ID:", installedVersionId);

                                setIsInstalling(false);
                                setRunningLoader(null);
                                setInstallProgress(0);
                                setInstallStatus(`${selectedModpack?.name || 'Modpack'} installed!`);
                                setGameLogs(prev => [...prev, `[INFO] ✓ ${selectedModpack?.name || 'Modpack'} installed successfully!`]);

                                // Mark this version as just installed FIRST to prevent auto-selection override
                                justInstalledVersionRef.current = installedVersionId;

                                const [installedModpacks, installedFabric, installedForge] = await Promise.all([
                                  launcher.getInstalledModpackVersions(),
                                  launcher.getInstalledFabricVersions(),
                                  launcher.getInstalledForgeVersions(),
                                ]);
                                setLapetusVersions(installedModpacks);
                                setFabricVersions(installedFabric);
                                setInstalledForgeVersions(installedForge);

                                // IMPORTANT: Set selected version AFTER updating the lists
                                // This ensures the useEffect sees it in the installed list
                                setSelectedVersion(installedVersionId);

                                // Load mods for the newly installed modpack
                                console.log('[Modpack Install] Loading mods for:', installedVersionId);
                                await loadAllMods(installedVersionId);

                                console.log("[Modpack Install] Selected version set to:", installedVersionId);
                                console.log("[Modpack Install] Installation complete! Ready to launch.");
                                
                                // Clear the just installed flag after a delay
                                setTimeout(() => {
                                  justInstalledVersionRef.current = null;
                                }, 3000);
                              } catch (error) {
                                console.error(`[Modpack Install] Failed to install modpack:`, error);
                                setIsInstalling(false);
                                setRunningLoader(null);
                                setInstallProgress(0);
                                setInstallStatus(`Failed to install modpack: ${error}`);
                                setGameLogs(prev => [...prev, `[ERROR] Failed to install modpack: ${error}`]);
                              }
                            }
                          }}
                          className={`flex items-center gap-4 px-5 py-4 text-left transition-all duration-200 hover:bg-white/5 ${selected ? 'bg-white/10' : ''}`}
                        >
                          {installed ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : (
                            <PiDownloadSimpleBold className="w-5 h-5 text-sky-400" />
                          )}
                          <div className="flex-1">
                            <div style={{ fontFamily: "'Bebas Neue', sans-serif" }} className="text-xl">
                              <ShiningText 
                                text={version.name}
                                className="text-xl"
                                duration={2}
                                baseColor="#1e40af"
                                highlightColor="#93c5fd"
                              />
                            </div>
                            <div className="text-white/40 text-sm" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                              Minecraft {gameVersion}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="pr-2">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 p-4 pb-[200px]">
                    {isComingSoonCategoryForLoader(activeLoader, selectedCategory.id, selectedCategory.versions.length) && (
                      <div className="relative w-full p-1 rounded-xl overflow-hidden bg-black border border-white/10 shadow-[0_4px_12px_rgb(0_0_0_/_0.15)]">
                        <div className="w-full p-4 rounded-lg relative bg-black border border-white/[0.08] text-white flex flex-col items-center justify-center gap-1">
                          <div className="text-center relative z-10">
                            <span className="text-3xl font-bold text-white/30 block" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                              26.1
                            </span>
                            <div className="text-xs text-amber-400/80 mt-2 font-semibold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                              Coming Soon
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Coming Soon card for 1.20.1 Dragon (only show for Dragon loader and 1.20 category) */}
                    {activeLoader === "dragon" && selectedCategory.id === "1.20" && (
                      <div className="relative w-full p-1 rounded-xl overflow-hidden bg-black border border-white/10 shadow-[0_4px_12px_rgb(0_0_0_/_0.15)]">
                        <div className="w-full p-4 rounded-lg relative bg-black border border-white/[0.08] text-white flex flex-col items-center justify-center gap-1">
                          <div className="text-center relative z-10">
                            <span className="text-3xl font-bold text-white/30 block" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                              1.20.1
                            </span>
                            <div className="text-xs text-amber-400/80 mt-2 font-semibold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                              Coming Soon
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {selectedCategory.versions.map(version => {
                      const miscSelection = activeLoader === "misc"
                        ? customMiscSelections.find((item) => getMiscSelectionVersionId(item) === version)
                        : undefined;
                      // Check if this specific version is installed using currentInstalledVersions
                      // This will respect the loader-specific logic (vanilla checks versions, forge/fabric/quilt check instances)
                      const installed = isInstalledForLoader(activeLoader, version, currentInstalledVersions);
                      const selected = selectedVersion === version;
                      
                      // Format display name and loader label
                      let displayName = miscSelection?.minecraftVersion || version;
                      let loaderLabel = "";
                      let subtitle = miscSelection?.name;
                      
                      if (activeLoader === 'vanilla') {
                        displayName = version;
                        loaderLabel = "VANILLA";
                      } else if (version.includes('-forge') || version.includes('-FORGE')) {
                        const mcVersion = version.split('-')[0];
                        displayName = mcVersion;
                        loaderLabel = "FORGE";
                      } else if (version.includes('fabric-loader')) {
                        const mcVersion = version.split('-').pop() || version;
                        displayName = mcVersion;
                        loaderLabel = "FABRIC";
                      } else if (version.includes('quilt-loader')) {
                        const mcVersion = version.split('-').pop() || version;
                        displayName = mcVersion;
                        loaderLabel = "QUILT";
                      } else if (activeLoader === 'dragon') {
                        displayName = version;
                        loaderLabel = "DRAGON";
                      } else if (activeLoader === 'misc') {
                        displayName = miscSelection?.minecraftVersion || extractMcVersion(version) || version;
                        loaderLabel = "MODPACK";
                      } else {
                        displayName = version;
                        loaderLabel = activeLoader.toUpperCase();
                      }

                      return (
                        <VersionCard
                          key={version}
                          version={version}
                          displayName={displayName}
                          loaderLabel={loaderLabel}
                          installed={installed}
                          selected={selected}
                          hideVersionLabel={true}
                          subtitle={subtitle}
                          contentAlignment="upper"
                          subtitlePlacement={activeLoader === "misc" ? "border-float" : "inline"}
                          loaderLabelPlacement="border-float-top"
                          onClick={() => {
                            if (installed) {
                              // Select the version and go to home/launch page
                              setSelectedVersion(version);
                              setSelectedCategory(null);
                              setActiveTab("home");
                            } else {
                              handleInstall(version);
                            }
                          }}
                        />
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="categories"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-black"
            >
              <div
                className="absolute inset-0 opacity-[0.85] pointer-events-none"
                style={{
                  backgroundImage: 'url(/bg-chat-4k.png)',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: getModManagerTheme(activeLoader).backgroundFilter,
                }}
              />

              <div
                className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
                style={{
                  background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.1) 85%, transparent 100%)'
                }}
              />
              
              {/* Versions Header - Fixed outside scroll */}
              {!selectedCategory && activeLoader !== "lapetus" && activeLoader !== "modpacks" && (
                <div className="relative z-20">
                  <div className="relative z-20 text-center pt-3 pb-6 mb-1 px-4">
                    {/* Icon above text */}
                    <div className="flex justify-center mb-3">
                      <img
                        src="/121.png"
                        alt="Versions"
                        className="w-20 h-20 object-contain"
                        style={{
                          filter: `${getModManagerTheme(activeLoader).backgroundFilter} drop-shadow(0 6px 14px rgba(0,0,0,0.45))`
                        }}
                      />
                    </div>
                    <h2 className="-mt-1 text-[8.5rem] leading-[0.92] tracking-[0.02em] font-bold text-white drop-shadow-2xl" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                      VERSIONS
                    </h2>
                  </div>
                  {/* Fade gradient at bottom */}
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none"
                    style={{
                      background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.12) 62%, rgba(0,0,0,0.24) 100%)'
                    }}
                  />
                </div>
              )}
              
              <ScrollArea className="relative z-20 flex-1">
                <div className="px-4 pb-4 pt-4">
              {/* Show loading/empty state for Lapetus when no categories */}
              {activeLoader === "lapetus" && isLoadingModpacks ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Loader2 className="w-8 h-8 text-white/40 animate-spin mb-4" />
                  <p className="text-white/60 text-lg">Loading Modpacks...</p>
                </div>
              ) : activeLoader === "lapetus" ? (
                /* Modpacks section - replacing Resonance */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                  {modpacks.length === 0 && !isLoadingModpacks ? (
                    <div className="col-span-full flex flex-col items-center justify-center h-64 text-center">
                      <Package className="w-12 h-12 text-white/20 mb-4" />
                      <p className="text-white/60 text-lg">No modpacks available</p>
                      <p className="text-white/40 text-sm mt-2">Check your internet connection</p>
                    </div>
                  ) : (
                    modpacks.map((modpack: any) => {
                      const modpackBackdrop = modpack.banner || modpack.icon || '';
                      // Check if this modpack is installed
                      const modpackName = modpack.name || '';
                      const cleanName = modpackName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                      
                      // Check if any installed version matches this EXACT modpack
                      // We need to be more precise - check if the installed version name matches exactly
                      // Format: {exact-modpack-name}-{mc-version}
                      const isInstalled = lapetusVersions.some(v => {
                        const versionLower = v.toLowerCase();
                        // Extract the modpack part (everything before the last dash and version number)
                        // e.g., "chocolate-1.21.11" -> "chocolate"
                        // e.g., "simply-optimized-1.21.11" -> "simply-optimized"
                        const parts = versionLower.split('-');
                        // Find where the MC version starts (looks like X.Y or X.Y.Z)
                        let modpackPart = '';
                        for (let i = 0; i < parts.length; i++) {
                          const part = parts[i];
                          // Check if this part looks like a version number (starts with digit and contains dot)
                          if (/^\d+\.\d+/.test(part)) {
                            // This is the MC version, everything before is the modpack name
                            modpackPart = parts.slice(0, i).join('-');
                            break;
                          }
                        }
                        return modpackPart === cleanName;
                      }) || installedForgeVersions.some(v => {
                        const versionLower = v.toLowerCase();
                        const parts = versionLower.split('-');
                        let modpackPart = '';
                        for (let i = 0; i < parts.length; i++) {
                          const part = parts[i];
                          if (/^\d+\.\d+/.test(part)) {
                            modpackPart = parts.slice(0, i).join('-');
                            break;
                          }
                        }
                        return modpackPart === cleanName;
                      });
                      
                      console.log(`[Lapetus Modpack Card] ${modpack.name}: cleanName="${cleanName}", isInstalled=${isInstalled}, lapetusVersions=`, lapetusVersions, 'forgeVersions=', installedForgeVersions);
                      
                      return (
                      <motion.div
                        key={modpack.id}
                        className="relative cursor-pointer select-none"
                        onClick={async (e) => {
                          e.stopPropagation();
                          console.log("[Modpack Click] Clicked modpack:", modpack.name, modpack.id);

                          // Fetch versions for this modpack
                          try {
                            const versions = await launcher.getModpackVersions(modpack.id);
                            console.log("[Modpack Click] Fetched versions:", versions);

                            // Extract version IDs and game versions
                            const versionList = versions.map((v: any) => ({
                              id: v.id,
                              name: v.name,
                              version_number: v.version_number,
                              game_versions: v.game_versions || [],
                              loaders: v.loaders || [],
                            }));

                            setModpackVersions(versionList);
                            setSelectedModpack(modpack);

                            // Create a category-like object for the modpack
                            const modpackCategory = {
                              id: modpack.id,
                              name: modpack.name,
                              image: modpack.banner || modpack.icon || heroImage,
                              versions: versionList.map((v: any) => v.id),
                            };
                            setSelectedCategory(modpackCategory);
                            console.log("[Modpack Click] Set selectedCategory:", modpackCategory);
                          } catch (error) {
                            console.error("[Modpack Click] Failed to fetch versions:", error);
                          }
                        }}
                        whileHover={{
                          scale: 1.02,
                          transition: { duration: 0.1 }
                        }}
                        whileTap={{
                          scale: 0.98,
                          transition: { duration: 0.1 }
                        }}
                      >
                        <div className="relative h-48 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
                          {/* Installed badge */}
                          {isInstalled && (
                            <div className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}

                          {modpack.icon && (
                            <div className="absolute left-4 top-4 z-20 h-10 w-10 overflow-hidden rounded-2xl border border-white/12 bg-black/45 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.9)] backdrop-blur-sm">
                              <img
                                src={modpack.icon}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          )}
                          
                          {modpackBackdrop && (
                            <img
                              src={modpackBackdrop}
                              alt={modpack.name}
                              loading="lazy"
                              decoding="async"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          )}

                          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/48 to-black/95" />

                          <div
                            className="absolute inset-0 opacity-[0.12] pointer-events-none"
                            style={{
                              backgroundImage: 'url(/topography-white.svg)',
                              backgroundRepeat: 'repeat',
                              backgroundSize: '400px 400px'
                            }}
                          />

                          {/* Modpack info overlay */}
                          <div className="relative z-10 flex h-full flex-col justify-end p-6 text-left pointer-events-none">
                            <p className="text-[10px] uppercase tracking-[0.28em] text-white/55">
                              Modrinth Modpack
                            </p>
                            <h2 className="mt-2 text-3xl font-bold text-white tracking-wide drop-shadow-lg">
                              {modpack.name}
                            </h2>
                            <p className="mt-2 max-w-[34ch] text-white/78 text-xs line-clamp-2">
                              {modpack.description}
                            </p>
                            <p className="mt-3 text-white/55 text-[11px] uppercase tracking-[0.24em]">
                              Click to select
                            </p>
                          </div>
                        </div>
                      </motion.div>
                      );
                    })
                  )}
                </div>
              ) : activeLoader === "modpacks" ? (
                /* Modpacks - One-click install modpacks */
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-8">
                    {isLoadingModpacks ? (
                      /* Skeleton Loading Cards */
                      Array.from({ length: modpacksPerPage }).map((_, index) => (
                        <div
                          key={`skeleton-${index}`}
                          className="relative h-48 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 animate-pulse"
                        >
                          {/* Shimmer effect */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-800/50 to-transparent animate-shimmer" />

                          <div className="relative z-10 flex flex-col items-center justify-center h-full p-6 text-center space-y-3">
                            {/* Title skeleton */}
                            <div className="h-8 w-3/4 bg-zinc-800 rounded" />
                            {/* Description skeleton */}
                            <div className="h-4 w-full bg-zinc-800 rounded" />
                            <div className="h-4 w-2/3 bg-zinc-800 rounded" />
                            {/* Meta skeleton */}
                            <div className="flex gap-2 mt-2">
                              <div className="h-3 w-20 bg-zinc-800 rounded" />
                              <div className="h-3 w-16 bg-zinc-800 rounded" />
                            </div>
                          </div>
                        </div>
                      ))
                    ) : modpacks.length === 0 ? (
                      /* No modpacks message */
                      <div className="col-span-full flex flex-col items-center justify-center py-20">
                        <Package className="w-16 h-16 text-zinc-600 mb-4" />
                        <h3 className="text-white text-xl font-semibold mb-2">No modpacks available</h3>
                        <p className="text-zinc-400 text-sm">Check your internet connection</p>
                      </div>
                    ) : (
                      /* Modpack Cards */
                      modpacks.map((modpack: any) => {
                        const modpackBackdrop = modpack.banner || modpack.icon || '';
                        // Check if this modpack is installed
                        const modpackName = modpack.name || '';
                        const cleanName = modpackName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                        
                        // Check if any installed version matches this EXACT modpack
                        // We need to be more precise - check if the installed version name matches exactly
                        // Format: {exact-modpack-name}-{mc-version}
                        const isInstalled = lapetusVersions.some(v => {
                          const versionLower = v.toLowerCase();
                          // Extract the modpack part (everything before the last dash and version number)
                          const parts = versionLower.split('-');
                          let modpackPart = '';
                          for (let i = 0; i < parts.length; i++) {
                            const part = parts[i];
                            if (/^\d+\.\d+/.test(part)) {
                              modpackPart = parts.slice(0, i).join('-');
                              break;
                            }
                          }
                          return modpackPart === cleanName;
                        }) || installedForgeVersions.some(v => {
                          const versionLower = v.toLowerCase();
                          const parts = versionLower.split('-');
                          let modpackPart = '';
                          for (let i = 0; i < parts.length; i++) {
                            const part = parts[i];
                            if (/^\d+\.\d+/.test(part)) {
                              modpackPart = parts.slice(0, i).join('-');
                              break;
                            }
                          }
                          return modpackPart === cleanName;
                        });
                        
                        console.log(`[Modpack Card] ${modpack.name}: cleanName="${cleanName}", isInstalled=${isInstalled}, lapetusVersions=`, lapetusVersions, 'forgeVersions=', installedForgeVersions);
                        
                        return (
                        <motion.div
                          key={modpack.id}
                          className="cursor-pointer"
                          onClick={async () => {
                            try {
                              // First, fetch available versions for this modpack
                              setInstallStatus(`Loading ${modpack.name} versions...`);
                              const versions = await launcher.getModpackVersions(modpack.id);

                              if (versions.length === 0) {
                                setInstallStatus(`No versions found for ${modpack.name}`);
                                return;
                              }

                              // Use the latest version (first in the list from Modrinth)
                              const targetVersion = versions[0];
                              const versionId = targetVersion.id;

                              // Get the Minecraft version from the version data
                              // Modrinth returns game_versions as an array, use the LATEST one
                              const gameVersions = targetVersion.game_versions || [];

                              // Sort versions to get the latest (e.g., prefer 1.21.1 over 1.20.1)
                              const sortedVersions = gameVersions.sort((a: string, b: string) => {
                                const aParts = a.split('.').map(Number);
                                const bParts = b.split('.').map(Number);
                                for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                                  const aNum = aParts[i] || 0;
                                  const bNum = bParts[i] || 0;
                                  if (aNum !== bNum) return bNum - aNum; // Descending order
                                }
                                return 0;
                              });

                              const gameVersion = sortedVersions[0] || '1.21.1';

                              console.log('[Modpack Install] Version details:', {
                                totalVersions: versions.length,
                                selectedVersionId: versionId,
                                allGameVersions: gameVersions,
                                sortedVersions,
                                selectedGameVersion: gameVersion,
                                versionName: targetVersion.name
                              });

                              setIsInstalling(true);
                              setInstallProgress(0);
                              setInstallStatus(`Installing ${modpack.name}...`);
                              setRunningLoader('modpacks'); // Set running loader for progress display

                              const installedVersionId = await launcher.installModpack(
                                versionId,
                                modpack.name,
                                gameVersion,
                                (progress, status) => {
                                  setInstallProgress(progress * 100); // Convert to percentage
                                  setInstallStatus(status);
                                  setGameLogs(prev => [...prev.slice(-50), `[INFO] ${status}`]);
                                }
                              );

                              console.log('[Modpack Install] Installation returned version ID:', installedVersionId);
                              console.log('[Modpack Install] Expected format: {modpack-name}-{mc-version}');

                              setIsInstalling(false);
                              setRunningLoader(null);
                              setInstallProgress(0);
                              setInstallStatus(`${modpack.name} installed!`);
                              setGameLogs(prev => [...prev, `[INFO] ✓ ${modpack.name} installed successfully!`]);

                              // Mark this version as just installed FIRST to prevent auto-selection override
                              justInstalledVersionRef.current = installedVersionId;
                              
                              setActiveTab("home");

                              const [installedModpacks, installedFabric, installedForge] = await Promise.all([
                                launcher.getInstalledModpackVersions(),
                                launcher.getInstalledFabricVersions(),
                                launcher.getInstalledForgeVersions(),
                              ]);
                              setLapetusVersions(installedModpacks);
                              setFabricVersions(installedFabric);
                              setInstalledForgeVersions(installedForge);
                              console.log('[Modpack Install] Updated lapetusVersions:', installedModpacks);

                              // IMPORTANT: Set selected version AFTER updating the list
                              // This ensures the useEffect sees it in the installed list
                              console.log('[Modpack Install] Setting selectedVersion to:', installedVersionId);
                              setSelectedVersion(installedVersionId);

                              // Load mods for the newly installed modpack
                              console.log('[Modpack Install] Loading mods for:', installedVersionId);
                              await loadAllMods(installedVersionId);

                              console.log('[Modpack Install] Installation complete! Ready to launch.');
                              
                              // Clear the just installed flag after a delay
                              setTimeout(() => {
                                justInstalledVersionRef.current = null;
                              }, 3000);
                            } catch (error) {
                              console.error(`Failed to install ${modpack.name}:`, error);
                              setIsInstalling(false);
                              setRunningLoader(null);
                              setInstallProgress(0);
                              setInstallStatus(`Failed to install ${modpack.name}: ${error}`);
                              setGameLogs(prev => [...prev, `[ERROR] Failed to install ${modpack.name}: ${error}`]);
                            }
                          }}
                          whileHover={{
                            scale: 1.02,
                            transition: { duration: 0.1 }
                          }}
                          whileTap={{
                            scale: 0.98,
                            transition: { duration: 0.1 }
                          }}
                          style={{ borderRadius: '1rem' }}
                        >
                          <div className="relative h-48 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
                            {/* Installed badge */}
                            {isInstalled && (
                              <div className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}

                            {modpack.icon && (
                              <div className="absolute left-4 top-4 z-20 h-10 w-10 overflow-hidden rounded-2xl border border-white/12 bg-black/45 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.9)] backdrop-blur-sm">
                                <img
                                  src={modpack.icon}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}

                            {modpackBackdrop && (
                              <img
                                src={modpackBackdrop}
                                alt={modpack.name}
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            )}

                            <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/52 to-black/95" />

                            <div
                              className="absolute inset-0 opacity-[0.12]"
                              style={{
                                backgroundImage: 'url(/topography-white.svg)',
                                backgroundRepeat: 'repeat',
                                backgroundSize: '400px 400px'
                              }}
                            />

                            {/* Modpack info */}
                            <div className="relative z-10 flex h-full flex-col justify-end p-6 text-left">
                              <p className="text-[10px] uppercase tracking-[0.28em] text-white/55">
                                Modrinth Modpack
                              </p>
                              <h2 className="mt-2 text-3xl font-bold text-white tracking-wider drop-shadow-lg">
                                {modpack.name}
                              </h2>
                              <p className="mt-2 max-w-[34ch] text-white/74 text-sm line-clamp-2">
                                {modpack.description}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.22em] text-white/48">
                                <span>{modpack.mc_version ? `Minecraft ${modpack.mc_version}` : 'Latest'}</span>
                                <span>{modpack.mods.length} mods</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                    {filteredCategories.map(category => {
                    // Check if ANY version from this category is actually installed
                    // Must match the EXACT major.minor version, not just a prefix
                    const isCoustomCategory = category.id === COUSTOM_CATEGORY_ID;
                    const categoryVersionKey = category.id.startsWith("misc-") ? category.id.replace("misc-", "") : category.id;
                    const matchesInstalledCategory = (installedVersion: string) => {
                      // For vanilla loader - must match exact major.minor
                      if (activeLoader === "vanilla") {
                        const majorMinor = getVanillaCategoryFromVersionId(installedVersion);
                        return majorMinor === category.id;
                      }
                      // For forge loader
                      if (activeLoader === "forge") {
                        const mcVersion = installedVersion.split('-')[0];
                        const parts = mcVersion.split('.');
                        if (parts.length >= 2) {
                          const majorMinor = `${parts[0]}.${parts[1]}`;
                          return majorMinor === category.id;
                        }
                        return false;
                      }
                      // For fabric loader
                      if (activeLoader === "fabric") {
                        const parts = installedVersion.split('-');
                        const mcVersion = parts[parts.length - 1];
                        const versionParts = mcVersion.split('.');
                        if (versionParts.length >= 2) {
                          const majorMinor = `${versionParts[0]}.${versionParts[1]}`;
                          return majorMinor === category.id;
                        }
                        return false;
                      }
                      // For quilt loader
                      if (activeLoader === "quilt") {
                        const parts = installedVersion.split('-');
                        const mcVersion = parts[parts.length - 1];
                        const versionParts = mcVersion.split('.');
                        if (versionParts.length >= 2) {
                          const majorMinor = `${versionParts[0]}.${versionParts[1]}`;
                          return majorMinor === category.id;
                        }
                        return false;
                      }
                      // For dragon loader
                      if (activeLoader === "dragon") {
                        const parts = installedVersion.split('-');
                        const mcVersion = parts[parts.length - 1];
                        const versionParts = mcVersion.split('.');
                        if (versionParts.length >= 2) {
                          const majorMinor = `${versionParts[0]}.${versionParts[1]}`;
                          return majorMinor === category.id;
                        }
                        return false;
                      }
                      // For misc modpack categories grouped as misc-1.21, misc-1.20, etc.
                      if (activeLoader === "misc") {
                        const mcVersion = extractMcVersion(installedVersion);
                        const versionParts = mcVersion.split('.');
                        if (versionParts.length >= 2) {
                          const majorMinor = `${versionParts[0]}.${versionParts[1]}`;
                          return majorMinor === categoryVersionKey;
                        }
                        return false;
                      }

                      return false;
                    };

                    const hasInstalledVersion = isCoustomCategory ? customMiscSelections.length > 0 : currentInstalledVersions.some(installedVersion => {
                      const matches = matchesInstalledCategory(installedVersion);
                      if (matches) {
                        console.log(`[Card Color] Category ${category.id} has installed version: ${installedVersion}`);
                      }
                      return matches;
                    });
                    
                    console.log(`[Card Color] Category ${category.id}: hasInstalled=${hasInstalledVersion}, loader=${activeLoader}`);
                    
                    // Count how many versions are installed for the badge - use same logic as hasInstalledVersion
                    const installedCount = isCoustomCategory
                      ? customMiscSelections.length
                      : currentInstalledVersions.filter((installedVersion) => matchesInstalledCategory(installedVersion)).length;
                    const installedRibbonStyle = getLoaderRibbonStyle(activeLoader);
                    
                    return (
                      <div
                        key={`${category.id}-${installedCount}`}
                        className="cursor-pointer"
                        onClick={() => {
                          console.log('[Category Click] Selected:', category.id);
                          console.log('[Category Click] Category versions:', category.versions.length);
                          console.log('[Category Click] Current categories state:', currentCategories.map(c => ({ id: c.id, count: c.versions.length })));
                          
                          // Find the category from currentCategories to ensure we have the latest data
                          const latestCategory = currentCategories.find(c => c.id === category.id);
                          if (latestCategory) {
                            console.log('[Category Click] Using latest category with', latestCategory.versions.length, 'versions');
                            setSelectedCategory(latestCategory);
                          } else {
                            console.log('[Category Click] Category not found in currentCategories, using clicked category');
                            setSelectedCategory(category);
                          }
                        }}
                      >
                        {/* Outer container with gradient shadow */}
                        <div className="relative rounded-[40px] bg-transparent p-3.5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)] transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)]">
                          {/* Inner highlight */}
                          <div
                            className="absolute inset-[1px] rounded-[39px] bg-gradient-to-b from-white/10 to-transparent pointer-events-none"
                            style={{ height: "50%" }}
                          />
                          
                          {/* Inner card */}
                          <motion.div
                            className="relative overflow-hidden rounded-[28px] bg-black shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05)]"
                            whileHover={{
                              scale: 1.02,
                              transition: { duration: 0.1 }
                            }}
                            whileTap={{
                              scale: 0.98,
                              transition: { duration: 0.1 }
                            }}
                          >
                            <div className="relative h-48">
                              {/* Diagonal line texture */}
                              <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] z-10"></div>
                              
                              <img
                                src={category.image}
                                alt={category.name}
                                style={{
                                  filter: hasInstalledVersion ? 'none' : 'grayscale(100%)',
                                  transition: 'filter 0.5s ease'
                                }}
                                className="w-full h-full object-cover object-center hover:filter-none"
                              />
                              {hasInstalledVersion && installedCount > 0 && (
                                <div className="absolute top-0 right-6 z-30">
                                  {/* Vertical ribbon tag */}
                                  <div
                                    className="relative px-3 py-4"
                                    style={{
                                      ...installedRibbonStyle,
                                      clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)'
                                    }}
                                  >
                                    <div className="flex flex-col items-center justify-center text-white">
                                      <span className="text-2xl font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{installedCount}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {/* Big centered text */}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20">
                                <h3 className={`text-white text-7xl md:text-8xl lg:text-9xl font-bold tracking-wide drop-shadow-lg`}>
                                  {category.name
                                    .split(' Official')[0]
                                    .split(' [')[0]
                                    .split(':')[0]
                                    .split(' -')[0]
                                    .split(' |')[0]
                                    .trim()}
                                </h3>
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </>
              )}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );


  // Dragon Skins Section - Custom skin and cape system
  const renderNews = () => {
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (!file.type.startsWith('image/')) {
          alert('Please select a valid image file (PNG recommended)');
          return;
        }

        setSkinFile(file);
        setSelectedGallerySkin(null); // Clear gallery selection when uploading custom skin
        
        const reader = new FileReader();
        reader.onload = (event) => {
          setSkinPreview(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };

    const handleGallerySkinSelect = (skin: any) => {
      // Don't set selected skin state - only used for modal interaction
      // The dome gallery will handle showing the modal directly
    };

    const handleRemoveSkin = async () => {
      const currentUsername = activeAccount?.username;
      if (!currentUsername) {
        return;
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_custom_skin', {
          playerName: currentUsername
        });
        await syncOfflineSkinSelection(null);

        setSelectedGallerySkin(null);
        setSkinFile(null);
        setSkinPreview(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        dynamicIsland.addState({
          type: 'notification',
          title: 'Skin removed',
          subtitle: 'Default appearance restored',
          icon: <Check className="w-4 h-4" />,
          color: 'success',
          duration: 4000,
        });
        void speakEvent('apply', 'Skin removed successfully.', 800);
      } catch (error) {
        console.error('Failed to remove skin:', error);
        dynamicIsland.addState({
          type: 'notification',
          title: 'Failed to remove skin',
          subtitle: String(error),
          icon: <XCircle className="w-4 h-4" />,
          color: 'error',
          duration: 5000,
        });
      }
    };

    // Get cape color based on cape index
    const getCapeColor = (index: number) => {
      const colors = [
        '#8B0000', // Dark Red - Migrator
        '#FF69B4', // Hot Pink - Pan
        '#FFD700', // Gold - 15th Anniversary
        '#32CD32', // Lime Green - Common
        '#FF4500', // Orange Red - Animated Fire
        '#8B4513', // Saddle Brown - Vanilla
        '#FF1493', // Deep Pink - Cherry Blossom
        '#9932CC', // Dark Orchid - Purple Heart
        '#00CED1', // Dark Turquoise - Follower's
        '#DC143C', // Crimson - Menace
        '#4169E1', // Royal Blue - Home
        '#B87333', // Copper - Copper
        '#2F4F4F', // Dark Slate Gray - Mojang Office
        '#FF4500', // Orange Red - Translator
        '#0000CD', // Medium Blue - Cobalt
        '#20B2AA', // Light Sea Green - Prismarine
        '#228B22', // Forest Green - Turtle
        '#FF6347', // Tomato - Birthday
        '#000000', // Black - Spade
        '#FF0000', // Red - Heart
        '#006400', // Dark Green - Christmas
        '#FFD700', // Gold - New Year
        '#8B4513', // Saddle Brown - Bacon
        '#C0C0C0', // Silver - Millionth Customer
        '#800080', // Purple - Vet
        '#FF8C00', // Dark Orange - MINECON 2011
        '#1E90FF', // Dodger Blue - MINECON 2012
        '#32CD32', // Lime Green - MINECON 2013
        '#FF1493', // Deep Pink - MINECON 2015
        '#9932CC', // Dark Orchid - MINECON 2016
        '#4B0082'  // Indigo - Realms
      ];
      return colors[index % colors.length];
    };



    const handleUploadSkin = async () => {
      // Auto-use current account username
      const currentUsername = activeAccount?.username;
      
      if ((!skinFile && !selectedGallerySkin) || !currentUsername) {
        setUploadStatus('❌ Please select a skin and make sure you are logged in');
        return;
      }

      setIsUploading(true);

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        
        if (selectedGallerySkin) {
          // Download skin from gallery
          try {
            const response = await fetch(selectedGallerySkin.downloadUrl);
            const blob = await response.blob();
            
            const base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result !== 'string') {
                  reject(new Error('Failed to read skin file'));
                  return;
                }
                const payload = result.split(',')[1];
                if (!payload) {
                  reject(new Error('Invalid skin data payload'));
                  return;
                }
                resolve(payload);
              };
              reader.onerror = () => reject(reader.error || new Error('Failed to read skin file'));
              reader.readAsDataURL(blob);
            });

            await invoke('save_custom_skin', {
              playerName: currentUsername,
              skinData: base64Data,
              model: skinModel
            });
            const selectedSkinUsername = (() => {
              try {
                const raw = typeof selectedGallerySkin?.downloadUrl === 'string'
                  ? selectedGallerySkin.downloadUrl.split('/').pop() || ''
                  : '';
                const cleaned = decodeURIComponent(raw).trim();
                return cleaned || currentUsername;
              } catch {
                return currentUsername;
              }
            })();
            await syncOfflineSkinSelection(selectedSkinUsername);

            await invoke('set_selected_cape', {
              capeIndex: normalizedSelectedCapeIndex
            });
            
            // Show success in Dynamic Island
            dynamicIsland.addState({
              type: 'notification',
              title: 'Skin applied successfully!',
              subtitle: 'Restart game to see changes',
              icon: <Check className="w-4 h-4" />,
              color: 'success',
              duration: 5000,
            });
            void speakEvent('apply', 'Skin applied successfully.', 800);
            
            // Don't clear the preview immediately - keep it visible
            setTimeout(() => {
              setSelectedGallerySkin(null);
              setUploadStatus('');
              setIsUploading(false);
            }, 3000);
          } catch (error) {
            console.error('Failed to download skin:', error);
            
            // Show error in Dynamic Island
            dynamicIsland.addState({
              type: 'notification',
              title: 'Failed to download skin',
              subtitle: String(error),
              icon: <XCircle className="w-4 h-4" />,
              color: 'error',
              duration: 5000,
            });
            
            setIsUploading(false);
          }
        } else if (skinFile) {
          // Upload custom skin file
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const result = event.target?.result;
              if (typeof result !== 'string') {
                reject(new Error('Failed to read skin file'));
                return;
              }
              const payload = result.split(',')[1];
              if (!payload) {
                reject(new Error('Invalid skin data payload'));
                return;
              }
              resolve(payload);
            };
            reader.onerror = () => reject(reader.error || new Error('Failed to read skin file'));
            reader.readAsDataURL(skinFile);
          });

          await invoke('save_custom_skin', {
            playerName: currentUsername,
            skinData: base64Data,
            model: skinModel
          });
          await syncOfflineSkinSelection(currentUsername);

          await invoke('set_selected_cape', {
            capeIndex: normalizedSelectedCapeIndex
          });
          
          // Show success in Dynamic Island
          dynamicIsland.addState({
            type: 'notification',
            title: 'Skin applied successfully!',
            subtitle: 'Restart game to see changes',
            icon: <Check className="w-4 h-4" />,
            color: 'success',
            duration: 5000,
          });
          void speakEvent('apply', 'Skin applied successfully.', 800);
          
          // Don't clear the preview immediately - keep it visible
          setTimeout(() => {
            setSkinFile(null);
            setUploadStatus('');
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }, 3000);
        }
      } catch (error) {
        console.error('Upload error:', error);
        setUploadStatus('❌ Upload error: ' + error);
        setIsUploading(false);
      }
    };

    const handleApplyCape = async () => {
      if (!activeAccount?.username) {
        setUploadStatus('❌ Please log in before selecting a cape');
        return;
      }

      setIsUploading(true);
      setUploadStatus('Applying cape selection...');

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_selected_cape', {
          capeIndex: normalizedSelectedCapeIndex
        });

        if (normalizedSelectedCapeIndex === null) {
          setUploadStatus('✓ Cape removed! Restart the game to apply.');
        } else {
          setUploadStatus('✓ Cape selected! Restart the game to apply.');
        }
        void speakEvent(
          'apply',
          normalizedSelectedCapeIndex === null ? 'Cape removed successfully.' : 'Cape applied successfully.',
          800
        );
      } catch (error) {
        console.error('Cape selection failed:', error);
        setUploadStatus('❌ Failed to save cape: ' + error);
      } finally {
        setIsUploading(false);
      }
    };

    return (
      <div className="h-full flex relative overflow-hidden">
        {/* Background Image */}
        <div
          className="absolute inset-0 opacity-[0.85] pointer-events-none"
          style={{
            backgroundImage: 'url(/bg-chat-4k.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
        
        {/* Fade gradient at top */}
        <div 
          className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.1) 85%, transparent 100%)'
          }}
        />
        
        {/* Status Messages - Hidden since we use Dynamic Island */}
        {false && uploadStatus && (
          <div className="absolute top-6 right-6 z-50">
            <div className={`px-4 py-2 rounded-full backdrop-blur-md text-center font-medium text-xs shadow-lg ${
              uploadStatus.includes('✓') 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {uploadStatus}
            </div>
          </div>
        )}

        {/* Dot Pagination */}
        {(skinsActiveTab === 'skins' || skinsActiveTab === 'capes') && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1">
            {/* Generate dots with sliding window */}
            {(() => {
              const totalPages = skinsActiveTab === 'capes' ? CAPE_TOTAL_PAGES : 10;
              const maxVisibleDots = 3; // Show max 3 dots at a time
              
              let startPage = Math.max(0, currentPage - Math.floor(maxVisibleDots / 2));
              let endPage = Math.min(totalPages - 1, startPage + maxVisibleDots - 1);
              
              // Adjust start if we're near the end
              if (endPage - startPage < maxVisibleDots - 1) {
                startPage = Math.max(0, endPage - maxVisibleDots + 1);
              }
              
              const visiblePages = [];
              for (let i = startPage; i <= endPage; i++) {
                visiblePages.push(i);
              }
              
              return (
                <>
                  {/* Left arrow if not at start */}
                  {startPage > 0 && (
                    <button
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      className="w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full transition-all duration-300"
                    />
                  )}
                  
                  {/* Visible page dots */}
                  {visiblePages.map((pageIndex) => (
                    <button
                      key={pageIndex}
                      onClick={() => setCurrentPage(pageIndex)}
                      className={`transition-all duration-300 ${
                        currentPage === pageIndex
                          ? 'w-8 h-3 bg-white rounded-full' // Long capsule for current page
                          : 'w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full' // Small dots for other pages
                      }`}
                    />
                  ))}
                  
                  {/* Right arrow if not at end */}
                  {endPage < totalPages - 1 && (
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                      className="w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full transition-all duration-300"
                    />
                  )}
                </>
              );
            })()}
          </div>
        )}
        
        {/* Category Buttons Overlay - Above Everything */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50">
          <div className="flex gap-3">
            {/* Skins Button */}
            <button
              onClick={() => {
                if (isTransitioning) return;
                setIsTransitioning(true);
                setSkinsActiveTab('skins');
                setCurrentPage(0);
                setTimeout(() => setIsTransitioning(false), 500);
              }}
              disabled={isTransitioning}
              className={`px-6 py-3 rounded-full backdrop-blur-md transition-all shadow-lg ${
                skinsActiveTab === 'skins'
                  ? 'bg-white border border-white text-black'
                  : 'bg-transparent border border-white/30 text-white hover:bg-white/10'
              } ${isTransitioning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="font-medium text-sm">Skins</span>
            </button>
            
            {/* Capes Button */}
            <button
              onClick={() => {
                if (isTransitioning) return;
                setIsTransitioning(true);
                setSkinsActiveTab('capes');
                setCurrentPage(0);
                setTimeout(() => setIsTransitioning(false), 500);
              }}
              disabled={isTransitioning}
              className={`px-6 py-3 rounded-full backdrop-blur-md transition-all shadow-lg ${
                skinsActiveTab === 'capes'
                  ? 'bg-white border border-white text-black'
                  : 'bg-transparent border border-white/30 text-white hover:bg-white/10'
              } ${isTransitioning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="font-medium text-sm">Capes</span>
            </button>
            
            {/* Custom Skins Button */}
            <button
              onClick={() => setSkinsActiveTab('custom-skins')}
              className={`px-6 py-3 rounded-full backdrop-blur-md transition-all shadow-lg ${
                skinsActiveTab === 'custom-skins'
                  ? 'bg-white border border-white text-black'
                  : 'bg-transparent border border-white/30 text-white hover:bg-white/10'
              }`}
            >
              <span className="font-medium text-sm">Custom Skins</span>
            </button>
          </div>
        </div>

        {/* Main Content - Full Width with Overlay Buttons */}
        <div className="flex-1 relative z-20">
          {skinsActiveTab === 'skins' && (
            <div className="h-full flex items-center justify-center p-8">
              <div className="max-w-6xl w-full">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-white mb-2 tracking-wide" style={{ fontFamily: "'Panchang', sans-serif" }}>CHOOSE YOUR SKIN</h2>
                  <p className="text-zinc-400">Select a skin to customize your appearance</p>
                </div>
                
                <SkinGallery 
                  onSkinSelect={handleGallerySkinSelect}
                  onRemoveSkin={handleRemoveSkin}
                  selectedSkinUsername={activeAccount?.skin_username ?? null}
                  currentPage={currentPage}
                />
              </div>
            </div>
          )}
          
          {skinsActiveTab === 'capes' && (
            <div className="h-full flex items-center justify-center p-8">
              <div className="max-w-6xl w-full">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-white mb-2 tracking-wide" style={{ fontFamily: "'Panchang', sans-serif" }}>CHOOSE YOUR CAPE</h2>
                  <p className="text-zinc-400">Select a cape to customize your appearance</p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* Show capes based on current page - 4 capes per page */}
                  {DISPLAY_CAPE_OPTIONS.map((cape, index) => {
                    const startIndex = currentPage * CAPES_PER_PAGE;
                    const endIndex = startIndex + CAPES_PER_PAGE;
                    
                    // Only show capes for current page
                    if (index < startIndex || index >= endIndex) return null;
                    
                    return (
                      <div
                        key={`cape-${cape.index}`}
                        onClick={async () => {
                          setSelectedCapeIndex(cape.index);
                          // Auto-apply cape immediately
                          if (activeAccount?.username) {
                            try {
                              const { invoke } = await import('@tauri-apps/api/core');
                              await invoke('set_selected_cape', {
                                capeIndex: cape.index
                              });
                            } catch (error) {
                              console.error('Failed to apply cape:', error);
                            }
                          }
                        }}
                        className={`bg-zinc-900 rounded-lg p-4 cursor-pointer transition-all hover:bg-zinc-800 relative ${
                          normalizedSelectedCapeIndex === cape.index ? 'ring-2 ring-white' : 'ring-2 ring-transparent'
                        }`}
                      >
                        {/* White overlay when selected */}
                        {normalizedSelectedCapeIndex === cape.index && (
                          <div className="absolute inset-0 bg-white/50 rounded-lg pointer-events-none" />
                        )}
                        
                        {/* 3D Cape Preview */}
                        <div className="h-48 bg-zinc-800 rounded-lg mb-3 flex items-center justify-center">
                          <CapeViewer
                            capeUrl={cape.image}
                            width={120}
                            height={192}
                            className="w-full h-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Show message when no capes on current page */}
                  {currentPage >= CAPE_TOTAL_PAGES && (
                    <div className="col-span-full text-center py-8">
                      <p className="text-zinc-400">No more capes available</p>
                      <p className="text-zinc-500 text-sm mt-2">Go back to previous pages to see all available capes</p>
                    </div>
                  )}
                </div>
                
                {/* Remove Cape Option - Show on all pages */}
                {currentPage < CAPE_TOTAL_PAGES && (
                  <div className="mt-2">
                    <button
                      onClick={async () => {
                        setSelectedCapeIndex(null);
                        // Auto-apply no cape immediately
                        if (activeAccount?.username) {
                          try {
                            const { invoke } = await import('@tauri-apps/api/core');
                            await invoke('set_selected_cape', {
                              capeIndex: null
                            });
                          } catch (error) {
                            console.error('Failed to remove cape:', error);
                          }
                        }
                      }}
                      className={`w-full bg-zinc-900 rounded-lg p-6 cursor-pointer transition-all hover:bg-zinc-800 ${
                        normalizedSelectedCapeIndex === null ? 'ring-2 ring-white' : 'ring-2 ring-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-center">
                        <h3 className="text-white font-medium text-sm tracking-widest" style={{ fontFamily: "'Panchang', sans-serif" }}>REMOVE CAPE</h3>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {skinsActiveTab === 'custom-skins' && (
            <div className="h-full flex items-center justify-center p-8">
              <div className="max-w-6xl w-full">
                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center h-full">
                  {/* Left Column - Upload Section with Title */}
                  <div className="flex flex-col">
                    {/* Title above left card only */}
                    <div className="mb-6">
                      <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>Upload Custom Skin</h2>
                      <p className="text-zinc-400">Upload your own skin file and preview it</p>
                    </div>
                    
                    {/* Upload Card */}
                    <div className="bg-black/60 backdrop-blur-sm rounded-2xl border border-zinc-800 p-6">
                      <div className="space-y-4">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-6 border-2 border-dashed border-zinc-600 rounded-xl hover:border-zinc-500 transition-colors"
                        >
                          <div className="text-center">
                            <span className="text-white text-6xl font-bold">+</span>
                          </div>
                        </button>
                        
                        {/* Apply Custom Skin Button */}
                        <button
                          onClick={handleUploadSkin}
                          disabled={!skinFile || !activeAccount?.username || isUploading}
                          className="w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUploading ? 'Applying...' : 'Apply Custom Skin'}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Right Column - 3D Preview Only (Transparent, Centered) */}
                  <div className="flex flex-col items-center justify-center h-full lg:pl-24 xl:pl-48">
                    <div className="text-center mb-4">
                      <h3 className="text-lg font-bold text-white mb-1">Skin Preview</h3>
                      <p className="text-zinc-400 text-xs">See how your skin will look</p>
                    </div>
                    
                    {skinPreview ? (
                      <div className="h-[500px] flex items-center justify-center">
                        <SkinViewer
                          skinUrl={skinPreview}
                          model={skinModel}
                          width={350}
                          height={500}
                          className="w-full h-full"
                        />
                      </div>
                    ) : (
                      <div className="h-[500px] flex items-center justify-center">
                        <SkinViewer
                          skinUrl="/mannequin.png"
                          model={skinModel}
                          width={350}
                          height={500}
                          className="w-full h-full"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Premium placeholder tabs
  const renderPlaceholder = (title: string, description: string, icon: React.ReactNode, features: string[]) => (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="max-w-md w-full bg-zinc-900/50 border-zinc-800/50">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-zinc-700/50">
            {icon}
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
          <p className="text-zinc-500 text-sm mb-6">{description}</p>
          <div className="space-y-2 text-left">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                <Star className="w-4 h-4 text-yellow-500" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
          <Badge className="mt-6 bg-zinc-800 border-zinc-700">
            <Crown className="w-3 h-3 mr-1" />
            Coming Soon
          </Badge>
        </CardContent>
      </Card>
    </div>
  );

  // Get loader icon based on loader type - Helper function for friend activity display
  const getLoaderIcon = (loader: string | null) => {
    if (!loader) return vanillaLogo; // Default to vanilla logo
    
    const loaderLower = loader.toLowerCase();
    
    // Map loader to the same logos used in the loader tabs
    const iconMap: Record<string, string> = {
      'forge': forgeLogo,
      'fabric': fabricLogo,
      'quilt': quiltLogo,
      'vanilla': vanillaLogo,
      'lapetus': dragonLogo
    };
    
    return iconMap[loaderLower] || vanillaLogo;
  };

  // Format player count for display (e.g., 1234 -> "1.2K", 567 -> "567")
  const formatPlayerCount = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // Fetch players playing a specific version
  const fetchVersionPlayers = async (version: string) => {
    try {
      console.log('[Version Players] Fetching players for version:', version);
      
      // Get all users playing this version (match major.minor) with last_seen
      const { data: players, error } = await supabase
        .from('dragon_users')
        .select('xuid, gamertag, avatar_url, game_version, loader, server_ip, world_name, is_online, last_seen')
        .not('game_version', 'is', null)
        .ilike('game_version', `${version}%`); // Match versions starting with this (e.g., "1.21" matches "1.21.1", "1.21.4")
      
      if (error) {
        console.error('[Version Players] Error fetching:', error);
        return [];
      }
      
      // Filter to only include users who are actually online (last_seen within 30 seconds)
      const now = new Date().getTime();
      const ONLINE_THRESHOLD = 30000; // 30 seconds
      
      const onlinePlayers = (players || []).filter(player => {
        if (!player.last_seen) return false;
        const lastSeenTime = new Date(player.last_seen).getTime();
        const timeSinceLastSeen = now - lastSeenTime;
        return timeSinceLastSeen < ONLINE_THRESHOLD;
      });
      
      console.log('[Version Players] Found', onlinePlayers.length, 'online players for', version);
      return onlinePlayers;
    } catch (err) {
      console.error('[Version Players] Failed to fetch:', err);
      return [];
    }
  };

  // Partnerships Tab - Now showing Version-Specific Modpacks
  const renderFriends = () => {
    return (
      <div className="h-full flex relative overflow-hidden">
        {/* Background Image */}
        <div
          className="absolute inset-0 opacity-[0.85] pointer-events-none"
          style={{
            backgroundImage: 'url(/bg-chat-4k.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'hue-rotate(180deg) saturate(1.3)'
          }}
        />
        
        {/* Fade gradient at top */}
        <div 
          className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.1) 85%, transparent 100%)'
          }}
        />
        
        <div className="flex-1 relative z-20 overflow-hidden">
        <div
          className="max-w-7xl mx-auto h-full px-8 pt-5 pb-4 flex flex-col gap-4"
          onWheelCapture={handleMiscModpackWheel}
        >
          {/* Banner Hero */}
          <div className="relative rounded-[28px] overflow-hidden bg-gradient-to-br from-zinc-900 to-black" style={{ height: '132px' }}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            <div className="absolute inset-0 flex items-end justify-between px-7 pb-5 pt-5">
              <div>
                <h2 className="text-[2.25rem] leading-none text-white tracking-wide drop-shadow-lg" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  MODPACKS
                </h2>
                <p className="text-white/60 mt-1 text-[10px] uppercase tracking-[0.16em]">
                  Version Specific Modpacks
                </p>
              </div>
              
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                <input
                  type="text"
                  placeholder="Search modpacks..."
                  value={miscModpackSearchQuery}
                  onChange={(event) => {
                    setMiscModpackSearchQuery(event.target.value);
                    setMiscModpackPage(1);
                  }}
                  className="w-full h-9 pl-10 pr-4 bg-black/40 backdrop-blur-md hover:bg-black/60 text-white rounded-full text-sm placeholder:text-white/35 border border-white/15 focus:border-white/30 focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="relative">
              <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity duration-200 ${
                showMiscModpackPageSkeleton ? 'opacity-35' : 'opacity-100'
              }`}>
                {isLoadingMiscModpacks ? (
                  Array.from({ length: 3 }).map((_, index) => {
                    const theme = MISC_MODPACK_CARD_THEMES[index % MISC_MODPACK_CARD_THEMES.length];
                    const topBackground = theme.variant === "first"
                      ? `radial-gradient(120% 120% at 50% -8%, ${theme.primary} 0%, ${theme.secondary} 32%, rgba(4,4,10,0.98) 82%)`
                      : `linear-gradient(180deg, ${theme.primary} 0%, ${theme.secondary} 58%, rgba(4,4,10,0.98) 100%)`;

                    return (
                      <div
                        key={`misc-modpack-skeleton-${index}`}
                        className="relative min-h-[220px] overflow-hidden rounded-[28px] border animate-pulse"
                        style={{
                          background: 'linear-gradient(180deg, rgba(7,7,13,0.98) 0%, rgba(3,3,6,1) 100%)',
                          borderColor: theme.edge,
                          boxShadow: `0 28px 80px -48px ${theme.glow}`,
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-[76px]" style={{ background: topBackground }} />
                        <div className="relative z-10 flex h-full flex-col px-5 pb-5 pt-[84px]">
                          <div className="h-3.5 w-28 rounded-full bg-white/10" />
                          <div className="mt-2.5 h-7 w-3/4 rounded-2xl bg-white/10" />
                          <div className="mt-3 h-3.5 w-full rounded-full bg-white/10" />
                          <div className="mt-2 h-4 w-5/6 rounded-full bg-white/10" />
                          <div className="mt-auto flex items-end justify-between gap-4">
                            <div className="h-3.5 w-24 rounded-full bg-white/10" />
                            <div className="h-8 w-24 rounded-full bg-white/15" />
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : miscModpacks.length > 0 ? (
                  miscModpacks.map((item, index) => {
                const theme = MISC_MODPACK_CARD_THEMES[index % MISC_MODPACK_CARD_THEMES.length];
                const itemVersionId = createCoustomVersionId(item);
                const isCurseForge = getMarketplaceSource(item.source) === "curseforge";
                const versionOptions = item.availableVersions && item.availableVersions.length > 0
                  ? item.availableVersions
                  : [{ minecraftVersion: item.minecraftVersion, modrinthVersionId: item.modrinthVersionId, detectedLoader: item.detectedLoader }];
                const existingSelection = customMiscSelections.find((entry) => entry.versionId === itemVersionId);
                const selectionVersionId = existingSelection
                  ? getMiscSelectionVersionId(existingSelection)
                  : createMiscRuntimeVersionId(item);
                const isInstalled = existingSelection
                  ? miscInstalledVersions.includes(selectionVersionId)
                  : false;
                const topBackground = theme.variant === "first"
                  ? `radial-gradient(120% 120% at 50% -8%, ${theme.primary} 0%, ${theme.secondary} 32%, rgba(4,4,10,0.98) 82%)`
                  : `linear-gradient(180deg, ${theme.primary} 0%, ${theme.secondary} 58%, rgba(4,4,10,0.98) 100%)`;
                const cardImage = item.image || "";

                    return (
                      <div
                        key={itemVersionId}
                        className="relative min-h-[220px] overflow-hidden rounded-[28px] border backdrop-blur-xl group hover:border-white/20 transition-all duration-300"
                        style={{
                          background: 'linear-gradient(180deg, rgba(7,7,13,0.98) 0%, rgba(3,3,6,1) 100%)',
                          borderColor: theme.edge,
                          boxShadow: `0 28px 80px -48px ${theme.glow}`,
                        }}
                      >
                    {cardImage && (
                      <img
                        src={cardImage}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-x-0 top-0 h-[96px] w-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    )}
                    <div className="absolute inset-x-0 top-0 h-[110px] bg-gradient-to-b from-black/5 via-black/45 to-[rgba(3,3,6,0.98)]" />
                    <div className="absolute inset-x-0 bottom-0 top-[92px] bg-[linear-gradient(180deg,rgba(7,7,13,0.92)_0%,rgba(3,3,6,1)_100%)]" />
                    <div className="absolute inset-x-0 top-0 h-[76px] bg-gradient-to-b from-black/18 via-black/8 to-transparent" />

                    <div className="relative z-10 flex h-full flex-col px-5 pb-5 pt-[84px]">
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/28">
                          {item.sourceLabel}
                        </p>
                        <DropdownMenu
                          open={openMiscVersionMenuKey === itemVersionId}
                          onOpenChange={(open) => {
                            setOpenMiscVersionMenuKey(open ? itemVersionId : null);
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-white/72 transition-colors ${
                                versionOptions.length > 1 ? 'hover:bg-white/12' : 'cursor-default'
                              }`}
                              disabled={versionOptions.length <= 1}
                            >
                              <span>{item.minecraftVersion}</span>
                              {versionOptions.length > 1 && (
                                <ChevronDown className="h-3.5 w-3.5 text-white/48" />
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          {versionOptions.length > 1 && (
                            <DropdownMenuContent
                              align="end"
                              sideOffset={8}
                              className="max-h-[214px] w-40 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/98 p-1 text-white backdrop-blur-xl"
                            >
                              <DropdownMenuLabel className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-white/38">
                                Select Version
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator className="bg-white/8" />
                              {versionOptions.map((versionOption) => {
                                const isSelectedVersion = versionOption.minecraftVersion === item.minecraftVersion;

                                return (
                                  <DropdownMenuItem
                                    key={`${item.id}-${versionOption.minecraftVersion}`}
                                    onSelect={() => handleMiscVersionSelect(`${item.source || "modrinth"}:${item.id}`, versionOption)}
                                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[12px] text-white/82 focus:bg-white/10 focus:text-white"
                                  >
                                    <span>{versionOption.minecraftVersion}</span>
                                    {isSelectedVersion && <Check className="h-3.5 w-3.5 text-white/70" />}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                      </div>

                      <h3
                        className="mt-2 text-[1.8rem] leading-[0.92] text-white drop-shadow-lg"
                        style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                      >
                        {item.name}
                      </h3>

                      <p className="mt-2.5 min-h-[42px] max-w-[28ch] text-[11px] leading-[18px] text-white/58 line-clamp-3">
                        {item.description}
                      </p>

                      <div className="mt-auto flex items-end justify-between gap-3 pt-2.5">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/28">
                          {isCurseForge ? 'Browser Link' : 'Profile Ready'}
                        </div>
                        <button
                          onClick={() => handleMiscDownload(item)}
                          disabled={!isCurseForge && isInstalled}
                          className={`h-8 min-w-[108px] rounded-full px-4 text-[12px] font-medium transition-all duration-300 ${
                            !isCurseForge && isInstalled
                              ? 'bg-emerald-500/20 text-emerald-300 cursor-default'
                              : 'bg-white text-black hover:bg-zinc-100 hover:scale-105 active:scale-95'
                          }`}
                        >
                          {isCurseForge ? 'Open Page' : isInstalled ? 'Installed' : 'Download'}
                        </button>
                      </div>
                    </div>
                  </div>
                    );
                  })
                ) : (
                  <div className="md:col-span-2 lg:col-span-3 rounded-[28px] border border-white/10 bg-black/40 px-8 py-12 text-center">
                    <Package className="mx-auto h-10 w-10 text-white/20" />
                    <h3 className="mt-4 text-[1.7rem] text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                      No modpacks found
                    </h3>
                    <p className="mt-2 text-[13px] text-white/45">
                      {miscModpackSearchQuery.trim()
                        ? 'No Modrinth or CurseForge modpacks matched that search.'
                        : 'Modrinth and CurseForge did not return any modpacks right now.'}
                    </p>
                  </div>
                )}
              </div>

              {showMiscModpackPageSkeleton && (
                <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: Math.max(miscModpacks.length, 3) }).map((_, index) => {
                    const theme = MISC_MODPACK_CARD_THEMES[index % MISC_MODPACK_CARD_THEMES.length];
                    const topBackground = theme.variant === "first"
                      ? `radial-gradient(120% 120% at 50% -8%, ${theme.primary} 0%, ${theme.secondary} 32%, rgba(4,4,10,0.98) 82%)`
                      : `linear-gradient(180deg, ${theme.primary} 0%, ${theme.secondary} 58%, rgba(4,4,10,0.98) 100%)`;

                    return (
                      <div
                        key={`misc-modpack-page-skeleton-${index}`}
                        className="relative min-h-[220px] overflow-hidden rounded-[28px] border"
                        style={{
                          background: 'linear-gradient(180deg, rgba(7,7,13,0.98) 0%, rgba(3,3,6,1) 100%)',
                          borderColor: theme.edge,
                          boxShadow: `0 28px 80px -48px ${theme.glow}`,
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-[76px]" style={{ background: topBackground }} />
                        <div className="relative z-10 flex h-full flex-col px-5 pb-5 pt-[84px]">
                          <div className="h-3.5 w-28 rounded-full bg-white/10 animate-pulse" />
                          <div className="mt-2.5 h-7 w-3/4 rounded-2xl bg-white/10 animate-pulse" />
                          <div className="mt-3 h-3.5 w-full rounded-full bg-white/10 animate-pulse" />
                          <div className="mt-2 h-4 w-5/6 rounded-full bg-white/10 animate-pulse" />
                          <div className="mt-auto flex items-end justify-between gap-4">
                            <div className="h-3.5 w-24 rounded-full bg-white/10 animate-pulse" />
                            <div className="h-8 w-24 rounded-full bg-white/15 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Pagination Layer - Achievement Style Capsule with Dots */}
            {!isLoadingMiscModpacks && miscModpackTotalHits > 3 && (
              <div className="flex flex-col items-center gap-2.5 mt-2 pb-0">
                <div className="flex items-center justify-center gap-2">
                  {getVisiblePageIndices(miscModpackPage - 1, miscModpackPageCount).map((pageIndex) => (
                    <button
                      key={`misc-modpack-page-${pageIndex}`}
                      onClick={() => navigateMiscModpackPage(pageIndex + 1)}
                      className={`transition-all ${
                        miscModpackPage - 1 === pageIndex
                          ? 'w-16 h-2 bg-white shadow-lg'
                          : 'w-2 h-2 bg-white/50 hover:bg-white/70 shadow-md'
                      } rounded-full`}
                      aria-label={`Go to modpack page ${pageIndex + 1}`}
                    />
                  ))}
                </div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/28">
                  Page {miscModpackPage} of {miscModpackPageCount}
                </div>
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-white/18">
                  <Mouse className="h-3 w-3 text-white/22" />
                  <span>Scroll to change page</span>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    );
  };

  // Mod Marketplace
  const renderStore = () => {
    // Mod categories for sidebar
    const modCategories = [
      { id: 'mods', label: 'Mods', icon: Package },
      { id: 'shaders', label: 'Shaders', icon: Sparkles },
      { id: 'resourcepacks', label: 'Resource Packs', icon: Palette },
    ];

    // Main Store View with Sidebar
    return (
      <div className="h-full flex relative overflow-hidden">
        {/* Background Image */}
        <div
          className="absolute inset-0 opacity-[0.85] pointer-events-none"
          style={{
            backgroundImage: 'url(/bg-chat-4k.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'hue-rotate(180deg) saturate(1.3)'
          }}
        />
        
        {/* Fade gradient at top */}
        <div 
          className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 15%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.1) 85%, transparent 100%)'
          }}
        />
        
        <div className="flex-1 flex min-h-0 relative z-20">
        {/* Left Sidebar */}
        <div className="w-44 shrink-0 border-r border-white/5 p-4">
          <div className="space-y-1">
            {modCategories.map((cat) => {
              const isActive = activeModFilter === cat.id || (!activeModFilter && cat.id === 'mods');
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveModFilter(cat.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <cat.icon className="w-4 h-4" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="shrink-0 px-6 pt-6 pb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: 'Orborn, sans-serif' }}>
                  {activeModFilter === 'shaders' ? 'Shaders' : activeModFilter === 'resourcepacks' ? 'Resource Packs' : 'Mods'}
                </h1>
                <p className="text-zinc-500 text-sm">
                  {activeModFilter === 'shaders'
                    ? 'Enhance your visuals with shader packs'
                    : activeModFilter === 'resourcepacks'
                      ? 'Customize textures and sounds'
                      : 'Browse and download mods from Modrinth and CurseForge'}
                </p>
              </div>
            </div>

            {/* Search Bar */}
            <div
              onClick={() => setShowModSpotlight(true)}
              className="flex items-center gap-3 cursor-pointer group max-w-xl"
            >
              <div className="flex-1 flex items-center gap-3 px-4 h-12 bg-zinc-800/60 border border-white/10 rounded-xl hover:border-white/20 hover:bg-zinc-800 transition-all">
                <Search className="w-4 h-4 text-zinc-500 group-hover:text-zinc-400 transition-colors" />
                <span className="text-zinc-500 group-hover:text-zinc-400 transition-colors text-sm">Search mods...</span>
                <div className="ml-auto flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-zinc-700/50 border border-white/10 rounded text-xs text-zinc-500">⌘K</kbd>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide px-6 pb-6">
            {modSearchResults.length > 0 ? (
              <>
                <h2 className="text-lg font-semibold text-white mb-4">Search Results</h2>
                <div className="space-y-3">
                  {modSearchResults.map((mod) => (
                    <div
                      key={mod.project_id}
                      onClick={() => handleOpenModDetails(mod)}
                      className="flex items-center bg-zinc-800/40 hover:bg-zinc-800/70 rounded-2xl cursor-pointer transition-all border border-white/5 hover:border-white/10 group overflow-hidden h-20"
                    >
                      {/* Mod Icon - 30% width */}
                      <div className="w-[30%] h-full flex items-center justify-center bg-zinc-700/30 shrink-0">
                        {mod.icon_url ? (
                          <img 
                            src={mod.icon_url} 
                            alt={mod.title} 
                            className="w-16 h-16 object-cover rounded-xl" 
                            loading="lazy"
                            onError={(e) => {
                              // Fallback to higher quality icon from Modrinth CDN
                              const target = e.target as HTMLImageElement;
                              if (getMarketplaceSource(mod.source) === 'modrinth' && !target.src.includes('cdn.modrinth.com')) {
                                target.src = `https://cdn.modrinth.com/data/${mod.project_id}/icon.png`;
                              }
                            }}
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-zinc-600/50 flex items-center justify-center">
                            <Package className="w-8 h-8 text-zinc-400" />
                          </div>
                        )}
                      </div>
                      
                      {/* Mod Info - 70% width */}
                      <div className="w-[70%] px-4 py-3 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white text-base truncate mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{mod.title}</h3>
                          <p className="text-zinc-400 text-sm line-clamp-2 leading-relaxed" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{mod.description}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1">
                              <Download className="w-3 h-3 text-zinc-500" />
                              <span className="text-xs text-zinc-500" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{formatDownloads(mod.downloads)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-zinc-500" />
                              <span className="text-xs text-zinc-500" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                                {mod.date_modified ? new Date(mod.date_modified).toLocaleDateString() : "Unknown"}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Install Button */}
                        <div className="shrink-0 ml-4">
                          <button className="px-4 py-2 bg-[#3DF56B] hover:bg-[#32d45c] text-black font-medium text-sm rounded-lg transition-all">
                            Install
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-white mb-4">Popular Mods</h2>
                {isLoadingFeatured ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-[#3DF56B] animate-spin" />
                  </div>
                ) : featuredMods.length > 0 ? (
                  <div className="space-y-3">
                    {featuredMods.map((mod) => (
                      <div
                        key={mod.project_id}
                        onClick={() => handleOpenModDetails(mod)}
                        className="flex items-center bg-zinc-800/40 hover:bg-zinc-800/70 rounded-2xl cursor-pointer transition-all border border-white/5 hover:border-white/10 group overflow-hidden h-20"
                      >
                        {/* Mod Icon - 30% width */}
                        <div className="w-[30%] h-full flex items-center justify-center bg-zinc-700/30 shrink-0">
                          {mod.icon_url ? (
                            <img 
                              src={mod.icon_url} 
                              alt={mod.title} 
                              className="w-16 h-16 object-cover rounded-xl" 
                              loading="lazy"
                              onError={(e) => {
                                // Fallback to higher quality icon from Modrinth CDN
                                const target = e.target as HTMLImageElement;
                                if (getMarketplaceSource(mod.source) === 'modrinth' && !target.src.includes('cdn.modrinth.com')) {
                                  target.src = `https://cdn.modrinth.com/data/${mod.project_id}/icon.png`;
                                }
                              }}
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-zinc-600/50 flex items-center justify-center">
                              <Package className="w-8 h-8 text-zinc-400" />
                            </div>
                          )}
                        </div>
                        
                        {/* Mod Info - 70% width */}
                        <div className="w-[70%] px-4 py-3 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white text-base truncate mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{mod.title}</h3>
                            <p className="text-zinc-400 text-sm line-clamp-2 leading-relaxed" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{mod.description}</p>
                            <div className="flex items-center gap-4 mt-2">
                              <div className="flex items-center gap-1">
                                <Download className="w-3 h-3 text-zinc-500" />
                                <span className="text-xs text-zinc-500" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>{formatDownloads(mod.downloads)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-zinc-500" />
                                <span className="text-xs text-zinc-500" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                                  {mod.date_modified ? new Date(mod.date_modified).toLocaleDateString() : "Unknown"}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Install Button */}
                          <div className="shrink-0 ml-4">
                            <button className="px-4 py-2 bg-[#3DF56B] hover:bg-[#32d45c] text-black font-medium text-sm rounded-lg transition-all">
                              Install
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center py-16">
                    <div className="text-center">
                      <Package className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-white/80 mb-2">Discover Mods</h3>
                      <p className="text-sm text-zinc-500 max-w-sm">
                        Search for mods or browse popular mods from Modrinth.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mod Download Dialog */}
        {selectedMod && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => {
                setSelectedMod(null);
                setModVersions([]);
                setSelectedModLoader(null);
                setSelectedModGameVersion(null);
                setInstallComplete(null);
              }}
            />

            {/* Dialog */}
            <div className="relative bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md mx-4 overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-4 p-6 border-b border-white/10">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-800 shrink-0">
                  {selectedMod.icon_url ? (
                    <img src={selectedMod.icon_url} alt={selectedMod.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-white/20" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-white truncate">Download {selectedMod.title}</h2>
                </div>
                <button
                  onClick={() => {
                    setSelectedMod(null);
                    setModVersions([]);
                    setSelectedModLoader(null);
                    setSelectedModGameVersion(null);
                    setInstallComplete(null);
                  }}
                  className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white/60 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {isLoadingModDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                ) : installComplete ? (
                  /* Install Complete */
                  <div className="text-center py-4">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">Install Complete</h3>
                    <p className="text-white/60 text-sm mb-6">{installComplete.filename}</p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => {
                          if (installComplete.path) {
                            const modsFolder = installComplete.path.substring(0, installComplete.path.lastIndexOf('/'));
                            launcher.openFolder(modsFolder);
                          }
                        }}
                        className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-full text-sm text-white transition-all"
                      >
                        Open Folder
                      </button>
                      <button
                        onClick={() => {
                          setSelectedMod(null);
                          setInstallComplete(null);
                        }}
                        className="px-6 py-2.5 bg-[#3DF56B] hover:bg-[#32d45c] rounded-full text-sm text-black font-medium transition-all"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Select Game Version Dropdown */}
                    <div className="mb-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-full text-white transition-all">
                            <div className="flex items-center gap-3">
                              <Gamepad2 className="w-5 h-5 text-white/60" />
                              <span>{selectedModGameVersion || "Select game version"}</span>
                            </div>
                            <ChevronDown className="w-5 h-5 text-white/60" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-80 bg-zinc-900 border-white/10 max-h-60 overflow-y-auto">
                          <DropdownMenuLabel className="text-white/50">Game Versions</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-white/10" />
                          {(() => {
                            const gameVersions = Array.from(new Set(modVersions.flatMap(v => v.game_versions)));
                            gameVersions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                            return gameVersions.slice(0, 20).map(gv => (
                              <DropdownMenuItem
                                key={gv}
                                onClick={() => setSelectedModGameVersion(gv)}
                                className="text-white hover:bg-white/10 cursor-pointer"
                              >
                                {gv}
                              </DropdownMenuItem>
                            ));
                          })()}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Select Platform/Loader Dropdown */}
                    <div className="mb-6">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-full text-white transition-all">
                            <div className="flex items-center gap-3">
                              <Wand2 className="w-5 h-5 text-white/60" />
                              <span className="capitalize">{selectedModLoader || "Select platform"}</span>
                            </div>
                            <ChevronDown className="w-5 h-5 text-white/60" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-80 bg-zinc-900 border-white/10">
                          <DropdownMenuLabel className="text-white/50">Mod Loaders</DropdownMenuLabel>
                          <DropdownMenuSeparator className="bg-white/10" />
                          {(() => {
                            const availableLoaders = Array.from(new Set(modVersions.flatMap(v => v.loaders || [])));
                            return availableLoaders.map(loader => (
                              <DropdownMenuItem
                                key={loader}
                                onClick={() => setSelectedModLoader(loader)}
                                className="text-white hover:bg-white/10 cursor-pointer capitalize"
                              >
                                {loader}
                              </DropdownMenuItem>
                            ));
                          })()}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Download Button */}
                    <Button3D
                      variant="success"
                      size="md"
                      onClick={async () => {
                        if (!selectedModGameVersion || !selectedModLoader) {
                          alert("Please select game version and platform");
                          return;
                        }

                        const matchingVersion = modVersions.find(v =>
                          v.game_versions.includes(selectedModGameVersion) &&
                          (v.loaders || []).some((loader: string) => loader.toLowerCase() === selectedModLoader.toLowerCase())
                        );

                        if (!matchingVersion || matchingVersion.files.length === 0) {
                          alert("No compatible version found for this combination");
                          return;
                        }

                        setIsDownloadingMod(matchingVersion.id);
                        try {
                          const targetVersionId = selectedVersionForDetails || versionDetails?.version_id || selectedVersion || currentInstalledVersions[0];
                          if (!targetVersionId) {
                            throw new Error('No target version selected. Please select a version first.');
                          }

                          const modPath = await launcher.downloadMod(
                            selectedMod.project_id,
                            matchingVersion.id,
                            matchingVersion.files[0].filename,
                            matchingVersion.files[0].url,
                            targetVersionId
                          );

                          await loadAllMods(targetVersionId);
                          setInstallComplete({ filename: matchingVersion.files[0].filename, path: modPath });
                        } catch (e) {
                          alert(`Failed to download: ${e}`);
                        } finally {
                          setIsDownloadingMod(null);
                        }
                      }}
                      disabled={!selectedModGameVersion || !selectedModLoader || isDownloadingMod !== null}
                      className="w-full"
                    >
                      {isDownloadingMod ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          Download
                        </>
                      )}
                    </Button3D>

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-6">
                      <div className="flex-1 h-px bg-white/10" />
                      <span className="text-white/40 text-sm">or</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {/* View on Modrinth */}
                    <a
                      href={getMarketplaceModUrl(selectedMod)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-full text-white transition-all"
                    >
                      <ExternalLink className="w-5 h-5" />
                      {getMarketplaceSource(selectedMod.source) === 'curseforge' ? 'View on CurseForge' : 'View on Modrinth'}
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  };

  // Get ring color based on active loader - memoized (must be before early returns)
  const loaderRingColor = useMemo(() => {
    switch (activeLoader) {
      case "vanilla": return "ring-emerald-500";
      case "forge": return "ring-orange-500";
      case "fabric": return "ring-amber-500";
      case "quilt": return "ring-purple-500";
      case "misc": return "ring-cyan-500";
      default: return "ring-emerald-500";
    }
  }, [activeLoader]);

  // Loading state - Black splash screen with delayed logo fade-in (Apple-style)
  if (isLoading) {
    return (
      <div className="flex h-screen bg-black items-center justify-center">
        <div 
          className="opacity-0 animate-[fadeIn_0.8s_ease-in-out_0.5s_forwards]"
        >
          {isLowEnd ? (
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          ) : (
            <Spinner size="lg" />
          )}
        </div>
      </div>
    );
  }

  const dynamicIslandLastLaunched =
    lastLaunchedLoader === "vanilla" ||
    lastLaunchedLoader === "forge" ||
    lastLaunchedLoader === "fabric" ||
    lastLaunchedLoader === "quilt" ||
    lastLaunchedLoader === "dragon"
      ? {
          loader: lastLaunchedLoader,
          logo:
            lastLaunchedLoader === "vanilla"
              ? vanillaLogo
              : lastLaunchedLoader === "forge"
              ? forgeLogo
              : lastLaunchedLoader === "fabric"
              ? fabricLogo
              : lastLaunchedLoader === "quilt"
              ? quiltLogo
              : starIcon,
        }
      : undefined;

  return (
    <TooltipProvider>
      {/* Launch Lines Effect */}
      <LaunchLines 
        trigger={triggerLaunchLines}
        progress={isLoaderBusy && (isInstalling || isLaunching) ? bannerLineProgress : 0}
        primaryColor={
          activeLoader === 'vanilla' ? 'rgba(34,197,94,1)' :
          activeLoader === 'forge' ? 'rgba(249,115,22,1)' :
          activeLoader === 'fabric' ? 'rgba(245,158,11,1)' :
          activeLoader === 'quilt' ? 'rgba(168,85,247,1)' :
          activeLoader === 'dragon' ? 'rgba(59,130,246,1)' :
          activeLoader === 'misc' ? 'rgba(236,72,153,1)' :
          'rgba(59,130,246,1)'
        }
        secondaryColor="rgba(255,255,255,1)"
        onStarReached={() => {
          console.log('Star reached callback fired! Setting brightness to 5');
          // Brighten the star and keep it bright (don't reset)
          setStarBrightness(5);
        }}
      />
      
      {/* Dynamic Island - Fixed Overlay */}
      {/* Dynamic Island - Only show when there are active states */}
      {dynamicIsland.states.length > 0 && (
        <div className="fixed top-12 left-1/2 transform -translate-x-1/2 z-[9999] pointer-events-none">
          <div className="pointer-events-auto">
            <DynamicIsland 
              states={dynamicIsland.states} 
              onDismiss={dynamicIsland.removeState}
              lastLaunched={dynamicIslandLastLaunched}
              username={username}
            />
          </div>
        </div>
      )}
      
      <div className="flex flex-col h-screen bg-black overflow-hidden">
        {/* Draggable Title Bar */}
        <div
          className={`h-8 bg-black border-b border-zinc-950 flex-shrink-0 flex items-center justify-between px-4 relative z-[120] transition-opacity duration-300 ${isInstalling ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          data-tauri-drag-region
          style={{ paddingLeft: '80px' }}
        >
          {/* Empty space for drag region */}
          <div />
        </div>

        {/* Top Bar with Zimoxy-style Loader Tabs */}
        <div className={`bg-black border-b border-zinc-950 px-3 relative z-[110] transition-opacity duration-300 ${isInstalling ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ paddingLeft: '80px' }}>
          
          <div className="flex items-center gap-0 relative">
            {/* Loader Tabs */}
            {(["vanilla", "forge", "fabric", "quilt"] as LoaderType[]).map((loader, index) => {
              const loaderConfig = LOADERS[loader];
              const isActive = activeLoader === loader;
              return (
                <Tooltip key={loader}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleLoaderSelect(loader)}
                      className={`relative px-5 py-2.5 flex items-center justify-center transition-all duration-300 ${isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                      {/* Tubelight indicator */}
                      {isActive && (
                        <motion.div
                          layoutId="activeLoaderIndicator"
                          className="absolute top-1 left-1/2 -translate-x-1/2"
                          initial={false}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        >
                          {/* Tubelight lamp on top */}
                          <div className="w-8 h-1 bg-white rounded-t-full" />
                        </motion.div>
                      )}
                      {loaderConfig.logo ? (
                        <img
                          src={loaderConfig.logo}
                          alt={loaderConfig.name}
                          className={`w-8 h-8 object-contain transition-all duration-300 ${isActive ? '' : 'grayscale opacity-50'} ${loader === 'misc' ? 'scale-[1.8]' : ''}`}
                          style={loader === 'misc' && isActive ? { filter: 'hue-rotate(130deg) saturate(1.5) brightness(1.3)' } : loader === 'misc' ? { filter: 'hue-rotate(130deg) saturate(1.5) brightness(1.3) grayscale(1) opacity(0.5)' } : undefined}
                        />
                      ) : (
                        <div className={`transition-all duration-300 ${isActive ? '' : 'grayscale opacity-50'}`}>
                          <Logo size="sm" showText={false} />
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700">
                    <span className="font-medium text-white">{loaderConfig.name}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Spacer */}
            <div className="flex-1" />

            {/* Navigation Tabs - Zimoxy style with top line indicator */}
            <nav className="flex items-center gap-0">
              {sidebarTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setActiveTab(tab.id);
                          // When clicking home tab, ensure we have a selected version
                          if (tab.id === 'home' && currentInstalledVersions.length > 0) {
                            // Restore stored version first, then fallback only when needed
                            if (
                              !selectedVersion ||
                              !isVersionKnownForLoader(activeLoader, selectedVersion, currentInstalledVersions, currentCategories)
                            ) {
                              const storedVersion = getStoredVersionForLoader(activeLoader);
                              if (
                                storedVersion &&
                                isVersionKnownForLoader(activeLoader, storedVersion, currentInstalledVersions, currentCategories)
                              ) {
                                setSelectedVersion(storedVersion);
                              } else {
                                setSelectedVersion(currentInstalledVersions[0]);
                              }
                            }
                          }
                        }}
                        className={`relative px-5 py-2.5 flex items-center justify-center transition-all duration-300 ${isActive
                          ? "text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                          }`}
                      >
                        {/* Tubelight indicator */}
                        {isActive && (
                          <motion.div
                            layoutId="activeTabIndicator"
                            className="absolute top-0 left-1/2 -translate-x-1/2"
                            initial={false}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          >
                            {/* Tubelight lamp on top */}
                            <div className="w-8 h-1 bg-white rounded-t-full" />
                          </motion.div>
                        )}
                        {tab.isSvg ? (
                          <img 
                            src={tab.icon} 
                            alt={tab.label}
                            className={`${tab.id === 'servers' || tab.id === 'news' ? 'w-10 h-10' : 'w-9 h-9'} transition-all duration-300 ${isActive ? 'brightness-100' : 'grayscale opacity-50'}`}
                          />
                        ) : (
                          <img 
                            src={tab.icon as string} 
                            alt={tab.label}
                            className={`w-9 h-9 transition-all duration-300 ${isActive ? '' : 'grayscale opacity-50'}`}
                          />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700">
                      <span className="font-medium text-white">{tab.label}</span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>

            {/* Divider */}
            <div className="w-px h-6 bg-zinc-700/50 mx-2" />

            {/* Manage Account Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowAccountDialog(true)}
                  className="px-3 py-2 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all duration-300"
                >
                  <img 
                    src={settingsIcon} 
                    alt="Settings"
                    className="w-8 h-8 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700">
                <span className="font-medium text-white">Manage Account</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Main Content - Connected to active tab */}
        <main className="flex-1 flex flex-col overflow-hidden bg-black">
          {isLowEnd ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {activeTab === "home" && renderHome()}
              {activeTab === "versions" && renderVersions()}
              {activeTab === "hosting" && <ServerHosting />}
              {activeTab === "friends" && (
                <div 
                  className="flex-1 relative overflow-hidden"
                  style={{
                    backgroundImage: 'url(/overlay.svg)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  }}
                >
                  {/* 110090.svg overlay */}
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: 'url(/110090.svg)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      opacity: 0.4,
                      zIndex: 5
                    }}
                  />
                  
                  {/* Header fade overlay */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-64 pointer-events-none"
                    style={{
                      background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 10%, rgba(0,0,0,0.9) 20%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0.05) 80%, transparent 100%)',
                      zIndex: 40
                    }}
                  />
                  
                  {/* Header Title */}
                  <div className="absolute top-0 left-0 right-0 pt-12 pb-4 pointer-events-none" style={{ zIndex: 60 }}>
                    <div className="max-w-7xl mx-auto px-8">
                      <div className="text-center">
                        <h1 className="text-6xl font-bold text-white tracking-tight" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                          FRIENDS
                        </h1>
                      </div>
                    </div>
                  </div>
                  
                  {/* Friends Content */}
                  <div className="absolute inset-0 flex flex-col" style={{ zIndex: 10 }}>
                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto pt-32">
                      <div className="max-w-7xl mx-auto px-8 pt-2">
                        {/* Friends Header */}
                        <div className="mb-6">
                          <h2 className="text-2xl font-bold text-white/90" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
                            Friends (0)
                          </h2>
                        </div>

                        {/* Friends Grid - Roblox Style */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8">
                          {/* Example Friend Card - Remove when implementing real data */}
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                            <div
                              key={i}
                              className="bg-white/10 backdrop-blur-sm rounded-xl p-4 hover:bg-white/15 transition-all duration-200 cursor-pointer group"
                            >
                              {/* Avatar */}
                              <div className="relative mb-3">
                                <div className="w-full aspect-square rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden">
                                  <span className="text-4xl">😊</span>
                                </div>
                                {/* Online Status Indicator */}
                                <div className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white/20" />
                              </div>

                              {/* Username */}
                              <div className="text-center mb-2">
                                <h3 className="text-white font-semibold text-sm truncate" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
                                  Player{i}
                                </h3>
                              </div>

                              {/* Status Text */}
                              <div className="text-center">
                                <p className="text-white/60 text-xs truncate" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
                                  Playing Minecraft
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Empty State - Show when no friends */}
                        {/* <div className="text-center text-white/60 py-20">
                          <div className="mb-4">
                            <svg className="w-24 h-24 mx-auto opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <p className="text-xl mb-2">No friends yet</p>
                          <p className="text-sm">Add friends to see them here</p>
                        </div> */}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "servers" && (
                <div 
                  className="flex-1 relative overflow-hidden"
                  style={{
                    backgroundImage: 'url(/misc.jpg)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                >
                  {/* Red Hue Overlay for Cursors */}
                  <div 
                    className={`absolute inset-0 bg-red-600/40 mix-blend-color pointer-events-none transition-opacity duration-500 ${miscStoreCategory === 'cursors' ? 'opacity-100' : 'opacity-0'}`} 
                    style={{ zIndex: 10 }} 
                  />
                  
                  {/* Header fade overlay - BIGGER */}
                  <div 
                    className="absolute top-0 left-0 right-0 h-64 pointer-events-none"
                    style={{
                      background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 10%, rgba(0,0,0,0.9) 20%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0.05) 80%, transparent 100%)',
                      zIndex: 40
                    }}
                  />
                  
                  {/* Header Title - OVERLAY on top of fade */}
                  <div className="absolute top-0 left-0 right-0 pt-12 pb-4 pointer-events-none" style={{ zIndex: 60 }}>
                    <div className="max-w-7xl mx-auto px-8">
                      <div className="text-center">
                        <h1 className="text-6xl font-bold text-white tracking-tight" style={{ fontFamily: "'Panchang', sans-serif" }}>
                          CURSORS
                        </h1>
                      </div>
                    </div>
                  </div>
                  
                  <div className="absolute inset-x-0 bottom-0 top-[200px] overflow-y-auto p-8 pointer-events-auto" style={{ zIndex: 50 }}>
                    <div className="relative max-w-7xl mx-auto w-full group">
                      
                      {(() => {
                        const ALL_CURSORS = [
                          { id: 1, color: '#98f576', cursor1: '/netherite-frame-0.png', cursor2: null },
                          { id: 2, color: '#f576a3', cursor1: '/jujutsu-cursor.png', cursor2: '/jujutsu-pointer.png' },
                          { id: 3, color: '#76b5f5', cursor1: '/demon-slayer-cursor.png', cursor2: '/demon-slayer-pointer.png' },
                          { id: 4, color: '#ffc745', cursor1: '/fifa-cursor.png', cursor2: '/fifa-pointer.png' },
                          { id: 5, color: '#a9a3b8', cursor1: '/hollow-knight-cursor.png', cursor2: '/hollow-knight-pointer.png' },
                          { id: 6, color: '#f576e2', cursor1: '/preppy-pink-cursor.png', cursor2: '/preppy-pink-pointer.png' }
                        ];
                        const CURSORS_PER_PAGE = 4;
                        const totalPages = Math.ceil(ALL_CURSORS.length / CURSORS_PER_PAGE);
                        const paginatedCursors = ALL_CURSORS.slice(cursorPage * CURSORS_PER_PAGE, (cursorPage + 1) * CURSORS_PER_PAGE);
                        
                        return (
                          <div className="flex flex-col items-center w-full">
                            <div 
                              className="flex justify-center gap-6 overflow-x-auto snap-x hide-scrollbar px-4 py-4 w-full" 
                              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                              onWheelCapture={handleCursorWheel}
                            >
                              {paginatedCursors.map((cursor) => (
                                <div 
                                  key={cursor.id} 
                                  onClick={() => {
                                    setEquippedCursor(cursor.id);
                                    localStorage.setItem('dragon_equipped_cursor', cursor.id.toString());
                                    new Audio('/select.mp3').play();
                                  }}
                                  className={`snap-center shrink-0 rounded-[1.5rem] p-2 flex flex-col w-[280px] text-black border-2 transition-all duration-500 ease-out cursor-pointer hover:scale-105 shadow-2xl ${
                                    equippedCursor === cursor.id 
                                      ? 'bg-black border-black shadow-[0_0_30px_rgba(0,0,0,0.6)]' 
                                      : 'bg-white border-black/5'
                                  }`}
                                >
                                  {/* Top Section */}
                                  <div 
                                    className="relative p-8 flex items-center justify-center min-h-[200px]" 
                                    style={{ 
                                      backgroundColor: equippedCursor === cursor.id ? '#000000' : cursor.color, 
                                      backgroundImage: 'url(/background-1.svg)', 
                                      backgroundSize: 'cover', 
                                      backgroundPosition: 'center', 
                                      backgroundBlendMode: 'overlay', 
                                      borderRadius: '1.25rem'
                                    }}
                                  >
                                    {/* Cursor Previews Side by Side */}
                                    <div className="flex items-center justify-center gap-6">
                                      <img src={cursor.cursor1} alt="Cursor 1" className="w-24 h-24 object-contain drop-shadow-lg hover:scale-110 transition-transform duration-300" />
                                      {cursor.cursor2 && <img src={cursor.cursor2} alt="Cursor 2" className="w-24 h-24 object-contain drop-shadow-lg hover:scale-110 transition-transform duration-300" />}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Dot Pagination */}
                            {totalPages > 1 && (
                              <div className="flex items-center gap-2 mt-6">
                                {cursorPage > 0 && (
                                  <button
                                    onClick={() => setCursorPage(Math.max(0, cursorPage - 1))}
                                    className="w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full transition-all duration-300"
                                  />
                                )}
                                
                                {Array.from({ length: totalPages }).map((_, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setCursorPage(i)}
                                    className={`transition-all duration-300 ${
                                      cursorPage === i
                                        ? 'w-8 h-3 bg-white rounded-full'
                                        : 'w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full'
                                    }`}
                                  />
                                ))}
                                
                                {cursorPage < totalPages - 1 && (
                                  <button
                                    onClick={() => setCursorPage(Math.min(totalPages - 1, cursorPage + 1))}
                                    className="w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full transition-all duration-300"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "news" && renderNews()}
              {activeTab === "store" && renderStore()}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                {activeTab === "home" && renderHome()}
                {activeTab === "versions" && renderVersions()}
                {activeTab === "hosting" && <ServerHosting />}
                {activeTab === "friends" && renderFriends()}
                {activeTab === "servers" && (
                  <div 
                    className="flex-1 relative overflow-hidden"
                    style={{
                      backgroundImage: 'url(/misc.jpg)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }}
                  >
                    {/* Red Hue Overlay for Cursors */}
                    <div 
                      className={`absolute inset-0 bg-red-600/40 mix-blend-color pointer-events-none transition-opacity duration-500 ${miscStoreCategory === 'cursors' ? 'opacity-100' : 'opacity-0'}`} 
                      style={{ zIndex: 10 }} 
                    />
                    
                    {/* Header fade overlay - BIGGER */}
                    <div 
                      className="absolute top-0 left-0 right-0 h-64 pointer-events-none"
                      style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 10%, rgba(0,0,0,0.9) 20%, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0.05) 80%, transparent 100%)',
                        zIndex: 40
                      }}
                    />
                    
                    {/* Header Title - OVERLAY on top of fade */}
                    <div className="absolute top-0 left-0 right-0 pt-12 pb-4 pointer-events-none" style={{ zIndex: 60 }}>
                      <div className="max-w-7xl mx-auto px-8">
                        <div className="text-center">
                          <h1 className="text-6xl font-bold text-white tracking-tight" style={{ fontFamily: "'Panchang', sans-serif" }}>
                            CURSORS
                          </h1>
                        </div>
                      </div>
                    </div>
                  
                  <div className="absolute inset-x-0 bottom-0 top-[200px] overflow-y-auto p-8 pointer-events-auto" style={{ zIndex: 50 }}>
                    <div className="relative max-w-7xl mx-auto w-full group">
                      
                      {(() => {
                        const ALL_CURSORS = [
                          { id: 1, color: '#98f576', cursor1: '/netherite-frame-0.png', cursor2: null },
                          { id: 2, color: '#f576a3', cursor1: '/jujutsu-cursor.png', cursor2: '/jujutsu-pointer.png' },
                          { id: 3, color: '#76b5f5', cursor1: '/demon-slayer-cursor.png', cursor2: '/demon-slayer-pointer.png' },
                          { id: 4, color: '#ffc745', cursor1: '/fifa-cursor.png', cursor2: '/fifa-pointer.png' },
                          { id: 5, color: '#a9a3b8', cursor1: '/hollow-knight-cursor.png', cursor2: '/hollow-knight-pointer.png' },
                          { id: 6, color: '#f576e2', cursor1: '/preppy-pink-cursor.png', cursor2: '/preppy-pink-pointer.png' }
                        ];
                        const CURSORS_PER_PAGE = 4;
                        const totalPages = Math.ceil(ALL_CURSORS.length / CURSORS_PER_PAGE);
                        const paginatedCursors = ALL_CURSORS.slice(cursorPage * CURSORS_PER_PAGE, (cursorPage + 1) * CURSORS_PER_PAGE);
                        
                        return (
                          <div className="flex flex-col items-center w-full">
                            <div 
                              className="flex justify-center gap-6 overflow-x-auto snap-x hide-scrollbar px-4 py-4 w-full" 
                              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                              onWheelCapture={handleCursorWheel}
                            >
                              {paginatedCursors.map((cursor) => (
                                <div 
                                  key={cursor.id} 
                                  onClick={() => {
                                    setEquippedCursor(cursor.id);
                                    localStorage.setItem('dragon_equipped_cursor', cursor.id.toString());
                                    new Audio('/select.mp3').play();
                                  }}
                                  className={`snap-center shrink-0 rounded-[1.5rem] p-2 flex flex-col w-[280px] text-black border-2 transition-all duration-500 ease-out cursor-pointer hover:scale-105 shadow-2xl ${
                                    equippedCursor === cursor.id 
                                      ? 'bg-black border-black shadow-[0_0_30px_rgba(0,0,0,0.6)]' 
                                      : 'bg-white border-black/5'
                                  }`}
                                >
                                  {/* Top Section */}
                                  <div 
                                    className="relative p-8 flex items-center justify-center min-h-[200px]" 
                                    style={{ 
                                      backgroundColor: equippedCursor === cursor.id ? '#000000' : cursor.color, 
                                      backgroundImage: 'url(/background-1.svg)', 
                                      backgroundSize: 'cover', 
                                      backgroundPosition: 'center', 
                                      backgroundBlendMode: 'overlay', 
                                      borderRadius: '1.25rem'
                                    }}
                                  >
                                    {/* Cursor Previews Side by Side */}
                                    <div className="flex items-center justify-center gap-6">
                                      <img src={cursor.cursor1} alt="Cursor 1" className="w-24 h-24 object-contain drop-shadow-lg hover:scale-110 transition-transform duration-300" />
                                      {cursor.cursor2 && <img src={cursor.cursor2} alt="Cursor 2" className="w-24 h-24 object-contain drop-shadow-lg hover:scale-110 transition-transform duration-300" />}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Dot Pagination */}
                            {totalPages > 1 && (
                              <div className="flex items-center gap-2 mt-6">
                                {cursorPage > 0 && (
                                  <button
                                    onClick={() => setCursorPage(Math.max(0, cursorPage - 1))}
                                    className="w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full transition-all duration-300"
                                  />
                                )}
                                
                                {Array.from({ length: totalPages }).map((_, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setCursorPage(i)}
                                    className={`transition-all duration-300 ${
                                      cursorPage === i
                                        ? 'w-8 h-3 bg-white rounded-full'
                                        : 'w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full'
                                    }`}
                                  />
                                ))}
                                
                                {cursorPage < totalPages - 1 && (
                                  <button
                                    onClick={() => setCursorPage(Math.min(totalPages - 1, cursorPage + 1))}
                                    className="w-3 h-3 bg-white/40 hover:bg-white/60 rounded-full transition-all duration-300"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                )}
                {activeTab === "news" && renderNews()}
                {activeTab === "store" && renderStore()}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* Profile Panel */}
      <ProfilePanel
        isOpen={showProfilePanel}
        onClose={() => setShowProfilePanel(false)}
        activeAccount={activeAccount}
        onAccountChange={handleAccountChange}
      />

      {/* Auto-Update Dialog */}
      {UpdateDialog && <UpdateDialog />}

      {/* Crash Report Dialog */}
      <CrashReportDialog
        isOpen={showCrashReport}
        onClose={() => setShowCrashReport(false)}
        versionId={selectedVersion}
        username={username}
        uuid={activeAccount?.uuid}
      />

      {/* Auto-Repair Dialog */}
      <RepairDialog
        isOpen={showRepairDialog}
        onClose={() => setShowRepairDialog(false)}
        versionId={selectedVersion}
        issueType={repairIssueType}
        issueDetails={repairIssueDetails}
        onRepairComplete={() => {
          setShowRepairDialog(false);
          // Optionally refresh version list
        }}
      />

      {/* Account Settings Dialog */}
      <AccountDialog
        open={showAccountDialog}
        onOpenChange={setShowAccountDialog}
        account={activeAccount}
      />

      {/* Oneko - Cat follows cursor */}
      <Oneko />

      {/* Modpacks Pagination - Fixed at Bottom */}
      {(activeLoader === "modpacks" || activeLoader === "lapetus") && activeTab === "versions" ? (
        <div
          className="fixed bottom-0 left-0 right-0 py-6 z-[99999]"
          style={{
            backgroundColor: '#18181b',
            borderTop: '2px solid #3f3f46',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
            pointerEvents: 'auto'
          }}
        >
          <div className="flex items-center justify-center">
            <div className="flex min-w-[220px] flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                {getVisiblePageIndices(modpacksPage, modpacksPageCount).map((pageIndex) => (
                  <button
                    key={pageIndex}
                    onClick={() => loadModpacksData(pageIndex)}
                    disabled={isLoadingModpacks}
                    aria-label={`Go to modpack page ${pageIndex + 1}`}
                    className={`rounded-full transition-all duration-300 ${
                      modpacksPage === pageIndex
                        ? 'w-16 h-2 bg-white shadow-lg'
                        : 'w-2 h-2 bg-white/50 hover:bg-white/70 shadow-md'
                    } ${isLoadingModpacks ? 'cursor-wait' : ''}`}
                  />
                ))}
              </div>
              <div
                className="text-xs uppercase tracking-[0.32em] text-zinc-400"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                Page {modpacksPage + 1} of {modpacksPageCount}
                <span className="ml-2 normal-case tracking-normal text-zinc-500">
                  ({modpacksTotal} modpacks)
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Friend Search Spotlight */}
      <FriendSearchSpotlight
        isOpen={showAddFriendDialog}
        onClose={() => {
          setShowAddFriendDialog(false);
          setNewFriendOderId("");
          setSearchResults([]);
        }}
        onSearch={(query) => setNewFriendOderId(query)}
        searchResults={searchResults}
        xboxFriends={xboxFriends}
        isSearching={isSearching}
        isSending={isSendingRequest}
        onAddFriend={async (friend) => {
          try {
            setIsSendingRequest(true);
            
            console.log('[Friends] Adding friend:', friend.gamertag, 'XUID:', friend.xuid);
            
            const currentOderId = getCurrentOderId();
            
            if (!currentOderId) {
              alert('Error: You must be logged in to send friend requests.');
              return;
            }
            
            if (friend.xuid === currentOderId) {
              alert('🤔 You cannot send a friend request to yourself');
              return;
            }
            
            await launcher.sendXboxFriendRequest(friend.xuid);
            
            try {
              const { storePendingXboxRequest } = await import("@/lib/friendsService");
              const currentProfile = await launcher.getCurrentXboxProfile();
              
              if (currentProfile?.xuid) {
                await storePendingXboxRequest(
                  currentProfile.xuid,
                  friend.xuid,
                  currentProfile.gamertag,
                  friend.gamertag
                );
              }
            } catch (supabaseError) {
              console.warn('[Friends] xuid_store failed (non-critical):', supabaseError);
            }
            
            setShowAddFriendDialog(false);
            setNewFriendOderId("");
            setSearchResults([]);
            alert(`✅ Friend request sent to ${friend.gamertag}!`);
            
            const friendsList = await launcher.getXboxFriends();
            setFriends(friendsList);
            setXboxFriends(friendsList);
          } catch (error: any) {
            console.error('Error adding friend:', error);
            let errorMessage = 'Failed to send friend request';
            if (error?.message?.includes('already')) {
              errorMessage = '✅ You are already friends with this user on Xbox Live';
            } else if (error?.message) {
              errorMessage = error.message;
            }
            alert(errorMessage);
          } finally {
            setIsSendingRequest(false);
          }
        }}
      />

      {/* Add Friend Dialog */}
      <Dialog open={false} onOpenChange={(open) => {
        setShowAddFriendDialog(open);
        if (open) {
          // Load Xbox friends when dialog opens
          console.log('[Add Friend Dialog] Calling loadXboxFriends...');
          loadXboxFriends();
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Add Friend</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Xbox Friends Suggestions */}
            {isLoadingXboxFriends ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span className="ml-2 text-white/60">Loading Xbox friends...</span>
              </div>
            ) : xboxFriends.length > 0 ? (
              <div>
                <label className="text-white/80 text-sm mb-3 block">Xbox Friends</label>
                <div className="flex gap-4 overflow-x-auto pb-2 px-1">
                  {xboxFriends.map((xboxFriend) => (
                    <button
                      key={xboxFriend.xuid}
                      onClick={async () => {
                        try {
                          setIsSendingRequest(true);
                          
                          console.log('[Friends] Adding Xbox friend:', xboxFriend.gamertag, 'XUID:', xboxFriend.xuid);
                          
                          // Get current user's oder_id (fresh read from localStorage)
                          const currentOderId = getCurrentOderId();
                          
                          if (!currentOderId) {
                            alert('Error: You must be logged in to send friend requests.');
                            return;
                          }
                          
                          // Prevent sending friend request to yourself
                          if (xboxFriend.xuid === currentOderId) {
                            alert('🤔 You cannot send a friend request to yourself');
                            return;
                          }
                          
                          // Send friend request to Xbox Live
                          await launcher.sendXboxFriendRequest(xboxFriend.xuid);
                          
                          // Store pending request in xuid_store for receiver to see
                          try {
                            const { storePendingXboxRequest } = await import("@/lib/friendsService");
                            const currentProfile = await launcher.getCurrentXboxProfile();
                            
                            if (!currentProfile?.xuid) {
                              console.error('[Friends] Cannot store pending request: current user XUID not found');
                            } else {
                              await storePendingXboxRequest(
                                currentProfile.xuid,  // Sender XUID (use real XUID, not lap_ format)
                                xboxFriend.xuid,  // Receiver XUID
                                currentProfile.gamertag,  // Sender gamertag
                                xboxFriend.gamertag  // Receiver gamertag
                              );
                              console.log('[Friends] Pending request stored in xuid_store: sender=', currentProfile.xuid, 'receiver=', xboxFriend.xuid);
                            }
                          } catch (supabaseError) {
                            console.warn('[Friends] xuid_store failed (non-critical):', supabaseError);
                          }
                          
                          setShowAddFriendDialog(false);
                          setNewFriendOderId("");
                          alert(`✅ Friend request sent to ${xboxFriend.gamertag}!`);
                          
                          // Reload friends list
                          const friendsList = await launcher.getXboxFriends();
                          setFriends(friendsList);
                        } catch (error: any) {
                          console.error('Error adding Xbox friend:', error);
                          alert(error?.message || 'Failed to send friend request');
                        } finally {
                          setIsSendingRequest(false);
                        }
                      }}
                      disabled={isSendingRequest}
                      className="relative flex flex-col items-center gap-2 group cursor-pointer flex-shrink-0"
                    >
                      <div className="relative w-[72px] h-[72px]">
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray="8 4" className="stroke-emerald-500/30" />
                        </svg>
                        <SocialAvatar
                          name={xboxFriend.gamertag}
                          src={xboxFriend.display_pic_raw}
                          className="absolute inset-[5px]"
                          initialClassName="text-xl"
                        />
                      </div>
                      <span className="text-xs text-white/60 truncate max-w-[80px] font-medium group-hover:text-white/80 transition-colors">{xboxFriend.gamertag}</span>
                      {xboxFriend.gamerscore && (
                        <span className="text-[10px] text-white/40">{xboxFriend.gamerscore}G</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-700"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-2 text-xs text-white/40 bg-zinc-900">or add by username</span>
                  </div>
                </div>
              </div>
            ) : null}
            
            {/* Manual Username Input */}
            <div>
              <label className="text-white/80 text-sm mb-2 block">Search Xbox Gamertag</label>
              <Input
                value={newFriendOderId}
                onChange={(e) => setNewFriendOderId(e.target.value)}
                placeholder="Search for Xbox gamertag..."
                className="bg-zinc-800 border-zinc-700 text-white"
              />
              <p className="text-white/50 text-xs mt-1">Type at least 2 characters to search</p>
            </div>

            {/* Search Results */}
            {isSearching && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                <span className="ml-2 text-white/60 text-sm">Searching...</span>
              </div>
            )}

            {!isSearching && searchResults.length > 0 && (
              <div>
                <label className="text-white/80 text-sm mb-3 block">Search Results</label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.xuid}
                      onClick={async () => {
                        try {
                          setIsSendingRequest(true);
                          
                          console.log('[Friends] Adding Xbox user from search:', result.gamertag, 'XUID:', result.xuid);
                          
                          // Get current user's XUID (fresh read from localStorage)
                          const currentOderId = getCurrentOderId();
                          console.log('[Friends] Current user XUID:', currentOderId);
                          
                          if (!currentOderId) {
                            alert('Error: You must be logged in to send friend requests.');
                            return;
                          }
                          
                          // Prevent sending friend request to yourself
                          if (result.xuid === currentOderId) {
                            alert('🤔 You cannot send a friend request to yourself');
                            setIsSendingRequest(false);
                            return;
                          }
                          
                          // Send friend request on Xbox Live
                          console.log('[Friends] Sending Xbox Live friend request...');
                          await launcher.sendXboxFriendRequest(result.xuid);
                          console.log('[Friends] Xbox Live friend request sent successfully');
                          
                          // Store pending request in xuid_store for receiver to see
                          try {
                            console.log('[Friends] Storing pending request in xuid_store...');
                            
                            const { storePendingXboxRequest } = await import("@/lib/friendsService");
                            const currentProfile = await launcher.getCurrentXboxProfile();
                            
                            if (!currentProfile?.xuid) {
                              console.error('[Friends] Cannot store pending request: current user XUID not found');
                            } else {
                              console.log('[Friends] Sender XUID:', currentProfile.xuid);
                              console.log('[Friends] Receiver XUID:', result.xuid);
                              
                              await storePendingXboxRequest(
                                currentProfile.xuid,  // Sender XUID (use real XUID, not lap_ format)
                                result.xuid,  // Receiver XUID
                                currentProfile.gamertag,  // Sender gamertag
                                result.gamertag  // Receiver gamertag
                              );
                              console.log('[Friends] Pending request stored in xuid_store successfully');
                            }
                          } catch (supabaseError) {
                            console.error('[Friends] xuid_store failed:', supabaseError);
                          }
                          
                          setShowAddFriendDialog(false);
                          setNewFriendOderId("");
                          setSearchResults([]);
                          alert(`✅ Friend request sent to ${result.gamertag}!`);
                          
                          // Reload Xbox friends list automatically
                          const friendsList = await launcher.getXboxFriends();
                          setFriends(friendsList);
                          setXboxFriends(friendsList);
                        } catch (error: any) {
                          console.error('Error adding Xbox user:', error);
                          
                          // Provide helpful error message
                          let errorMessage = 'Failed to send friend request';
                          if (error?.message) {
                            if (error.message.includes('already')) {
                              errorMessage = '✅ You are already friends with this user on Xbox Live';
                            } else {
                              errorMessage = error.message;
                            }
                          }
                          
                          alert(errorMessage);
                        } finally {
                          setIsSendingRequest(false);
                        }
                      }}
                      disabled={isSendingRequest}
                      className="w-full flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-750 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <SocialAvatar
                        name={result.gamertag}
                        src={result.display_pic_raw}
                        className="w-12 h-12 flex-shrink-0"
                        initialClassName="text-lg"
                      />
                      <div className="flex-1 text-left">
                        <div className="text-white font-medium">{result.gamertag}</div>
                        {result.gamerscore && (
                          <div className="text-white/40 text-xs">{result.gamerscore}G</div>
                        )}
                      </div>
                      <UserPlus className="w-5 h-5 text-emerald-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isSearching && newFriendOderId.trim().length >= 2 && searchResults.length === 0 && (
              <div className="text-center py-4 text-white/50 text-sm">
                No Xbox users found matching "{newFriendOderId}"
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowAddFriendDialog(false);
                  setNewFriendOderId("");
                  setSearchResults([]);
                }}
                disabled={isSendingRequest}
                className="w-full bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-50"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Friend Profile Dialog - Discord Style */}
      <Dialog open={showFriendProfileDialog} onOpenChange={(open) => {
        setShowFriendProfileDialog(open);
        if (!open) setIsEditingProfile(false);
      }}>
        <DialogContent className="bg-[#232428] border-none p-0 max-w-[340px] overflow-hidden [&>button]:hidden">
          {selectedFriend && (
            <motion.div 
              className="relative"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ 
                duration: 0.2,
                ease: [0.16, 1, 0.3, 1]
              }}
            >
              {/* Banner Background with image1.png and dynamic hue based on status */}
              <div 
                className="h-[120px] relative overflow-hidden"
              >
                <div 
                  className="absolute inset-0 pointer-events-none transition-all duration-300"
                  style={{
                    backgroundImage: selectedFriend.banner_url 
                      ? `url(${selectedFriend.banner_url})` 
                      : 'url(/image1.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    // Only apply hue filter if using default image1.png (no custom banner uploaded)
                    filter: selectedFriend.banner_url
                      ? 'none'
                      : (selectedFriend.status === 'pending' 
                        ? 'hue-rotate(90deg) saturate(1.6) brightness(0.7) contrast(1.1)' 
                        : 'hue-rotate(180deg) saturate(1.8) brightness(0.7) contrast(1.2)')
                  }}
                />
                {/* Edit Profile Button - Only for current user */}
                {selectedFriend.id === 'current-user' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingProfile(!isEditingProfile);
                    }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100 z-10"
                  >
                    <Edit2 className="w-4 h-4 text-white" />
                  </button>
                )}
                {/* Gradient overlay for better contrast - only for default banner */}
                {!selectedFriend.banner_url && (
                  <div className={`absolute inset-0 pointer-events-none ${
                    selectedFriend.status === 'pending'
                      ? 'bg-gradient-to-br from-emerald-600/30 via-green-600/20 to-teal-600/30'
                      : 'bg-gradient-to-br from-purple-600/30 via-pink-600/20 to-blue-600/30'
                  }`} />
                )}
                {/* Pattern overlay */}
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                  <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIxIiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')]" />
                </div>
              </div>
              {/* Profile Content */}
              <div className="px-4 pb-4">
                {/* Avatar - Not editable, fetched from Xbox */}
                <div className="relative -mt-12 mb-4">
                  <div className="relative w-20 h-20 rounded-[30%] border-[6px] border-[#232428] bg-[#232428] p-[2px] shadow-[0_18px_36px_rgba(0,0,0,0.4)]">
                    <SocialAvatar
                      name={selectedFriend.username}
                      src={selectedFriend.avatar_url}
                      className="w-full h-full"
                      initialClassName="text-2xl"
                    />
                    {/* Status indicator */}
                    <div className={`absolute bottom-0 right-0 w-5 h-5 rounded-full border-[3px] border-[#232428] ${
                      selectedFriend.status === 'pending' ? 'bg-yellow-500' : 
                      selectedFriend.is_online ? 'bg-emerald-500' : 'bg-gray-500'
                    }`} />
                  </div>
                </div>
                {/* User Info */}
                <div className="bg-[#111214] rounded-lg p-3 mb-3 relative group">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-white font-bold text-xl">{selectedFriend.username}</h3>
                    {/* Call Button - Only show for friends (not current user) and if online */}
                    {selectedFriend.id !== 'current-user' && selectedFriend.is_online && (
                      <button
                        onClick={async () => {
                          const currentXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
                          const currentUsername = activeAccount?.username || 'You';
                          
                          console.log('[Voice Call] Current XUID:', currentXuid);
                          console.log('[Voice Call] Current Username:', currentUsername);
                          console.log('[Voice Call] Friend XUID:', selectedFriend.oder_id);
                          console.log('[Voice Call] Friend Username:', selectedFriend.username);
                          console.log('[Voice Call] Full friend object:', selectedFriend);
                          
                          if (!currentXuid) {
                            alert('Please log in to make calls');
                            return;
                          }
                          
                          if (currentXuid === selectedFriend.oder_id) {
                            alert('Cannot call yourself!');
                            return;
                          }

                          try {
                            // Create voice chat window inside Tauri
                            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                            
                            const voiceChatUrl = `/voice-chat.html?caller=${encodeURIComponent(currentXuid)}&callerName=${encodeURIComponent(currentUsername)}&receiver=${encodeURIComponent(selectedFriend.oder_id)}&receiverName=${encodeURIComponent(selectedFriend.username)}&isCaller=true`;
                            
                            const webview = new WebviewWindow('voice-chat', {
                              url: voiceChatUrl,
                              title: `Voice Call - ${selectedFriend.username}`,
                              width: 400,
                              height: 600,
                              resizable: false,
                              center: true,
                              alwaysOnTop: true,
                              decorations: true,
                              transparent: false,
                            });
                            
                            console.log('[Voice Call] Created voice chat window');
                          } catch (err) {
                            console.error('[Voice Call] Failed to create window:', err);
                            alert('Failed to open voice chat: ' + (err instanceof Error ? err.message : String(err)));
                          }
                        }}
                        className="p-2 rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors"
                        title="Voice Call"
                      >
                        <Phone className="w-5 h-5 text-white" />
                      </button>
                    )}
                  </div>
                  <p className="text-white/60 text-sm mb-2">{selectedFriend.oder_id}</p>
                  
                  {selectedFriend.status === 'pending' && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                      <span className="text-yellow-400 text-xs font-medium">Pending Friend Request</span>
                    </div>
                  )}
                  
                  {/* Bio Section - Editable for current user */}
                  {selectedFriend.id === 'current-user' && isEditingProfile ? (
                    <div className="pt-2 mt-2">
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Tell others about yourself..."
                        className="w-full bg-[#232428] border border-white/20 text-white rounded-lg p-2 text-sm min-h-[80px] resize-none"
                        maxLength={200}
                      />
                      <p className="text-white/50 text-xs mt-1">{editBio.length}/200 characters</p>
                    </div>
                  ) : selectedFriend.bio ? (
                    <p className="text-white/80 text-sm leading-relaxed pt-2 mt-2">
                      {selectedFriend.bio}
                    </p>
                  ) : selectedFriend.id === 'current-user' ? (
                    <p className="text-white/40 text-sm leading-relaxed pt-2 mt-2 italic">
                      No bio yet. Click edit to add one!
                    </p>
                  ) : null}
                </div>

                {/* Currently Playing Section */}
                {selectedFriend.game_version && selectedFriend.loader && (
                  <div 
                    key={`playing-${selectedFriend.game_version}-${selectedFriend.loader}`}
                    className="bg-[#111214] rounded-lg p-3 mb-3"
                  >
                    <h4 className="text-white/60 text-xs font-semibold uppercase mb-3">Playing</h4>
                    <div className="flex items-center gap-3">
                      {/* Loader Icon */}
                      <img
                        src={getLoaderIcon(selectedFriend.loader)}
                        alt={selectedFriend.loader}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-lg font-bold mb-1">Minecraft</p>
                        <div className="flex items-center gap-2 text-sm text-white/80 mb-1">
                          <Gamepad2 className="w-4 h-4" />
                          <span className="capitalize">{selectedFriend.loader}</span>
                          <span>•</span>
                          <span>{selectedFriend.game_version}</span>
                        </div>
                        {selectedFriend.server_ip ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                            <Server className="w-3 h-3" />
                            <span>Multiplayer</span>
                            <span>•</span>
                            <span className="font-mono">{selectedFriend.server_ip}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-blue-400">
                            <UserCircle2 className="w-3 h-3" />
                            <span>Singleplayer</span>
                            {selectedFriend.world_name && (
                              <>
                                <span>•</span>
                                <span>{selectedFriend.world_name}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {selectedFriend.server_ip && (
                      <button
                        onClick={() => {
                          // Copy server IP to clipboard
                          navigator.clipboard.writeText(selectedFriend.server_ip);
                          alert(`Server IP copied: ${selectedFriend.server_ip}`);
                        }}
                        className="w-full relative px-4 py-1.5 rounded-full text-white text-xs font-medium tracking-wider uppercase transition-all overflow-hidden mt-3"
                        style={{ 
                          fontFamily: "'Bebas Neue', sans-serif", 
                          letterSpacing: '0.1em',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)'
                        }}
                      >
                        <div
                          className="absolute inset-0 opacity-30"
                          style={{
                            backgroundImage: 'url(/bg-version-4k.png)',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                          }}
                        />
                        <span className="relative z-10">Join Server</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {selectedFriend.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          setIsAcceptingRequest(true);
                          
                          // Immediately hide the pending request from UI
                          setPendingRequests(prev => prev.filter(req => req.xuid !== selectedFriend.oder_id));
                          
                          if (selectedFriend.oder_id) {
                            console.log('[Friends] Accepting request from XUID:', selectedFriend.oder_id);
                            console.log('[Friends] Selected friend object:', selectedFriend);
                            
                            // Get current user's XUID
                            const currentUserXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
                            if (!currentUserXuid) {
                              throw new Error('Current user XUID not found');
                            }
                            
                            // Accept on Xbox Live
                            await launcher.acceptXboxFriendRequest(selectedFriend.oder_id);
                            console.log('[Friends] ✓ Accepted on Xbox Live');
                            
                            // Update dragon_users table (accept request)
                            try {
                              console.log('[Friends] Updating dragon_users: sender=', selectedFriend.oder_id, 'receiver=', currentUserXuid);
                              
                              const { updateXboxRequestStatus } = await import("@/lib/friendsService");
                              await updateXboxRequestStatus(selectedFriend.oder_id, currentUserXuid, 'accepted');
                              
                              console.log('[Friends] ✓ Updated dragon_users (accepted)');
                            } catch (supabaseError) {
                              console.error('[Friends] dragon_users update failed:', supabaseError);
                            }
                            
                            // Refresh friends and pending requests
                            const updatedFriends = await launcher.getXboxFriends();
                            setFriends(updatedFriends);
                            setXboxFriends(updatedFriends);
                            console.log('[Friends] ✓ Updated friends list with', updatedFriends.length, 'friends');
                            
                            // Reload pending requests from dragon_users
                            const { getPendingXboxRequests } = await import("@/lib/friendsService");
                            const pendingRequestsList = await getPendingXboxRequests(currentUserXuid);
                            
                            console.log('[Friends] Reloaded pending requests after accept:', pendingRequestsList);
                            
                            if (pendingRequestsList && pendingRequestsList.length > 0) {
                              const senderXuids = pendingRequestsList.map(req => req.sender_xuid);
                              
                              // Fetch profiles from dragon_users
                              const { data: senderProfiles } = await supabase
                                .from('dragon_users')
                                .select('xuid, gamertag, avatar_url, real_name, gamerscore')
                                .in('xuid', senderXuids);
                              
                              const pendingWithProfiles = pendingRequestsList.map(request => {
                                const profile = senderProfiles?.find(p => p.xuid === request.sender_xuid);
                                return profile ? {
                                  gamertag: profile.gamertag,
                                  xuid: profile.xuid,
                                  display_pic_raw: profile.avatar_url,
                                  real_name: profile.real_name,
                                  gamerscore: profile.gamerscore
                                } : {
                                  gamertag: request.sender_gamertag || `User_${request.sender_xuid.substring(0, 8)}`,
                                  xuid: request.sender_xuid,
                                  display_pic_raw: null,
                                  real_name: null,
                                  gamerscore: null,
                                };
                              });
                              
                              setPendingRequests(pendingWithProfiles);
                            } else {
                              setPendingRequests([]);
                            }
                            
                            setShowFriendProfileDialog(false);
                            alert('Friend request accepted!');
                          }
                        } catch (error) {
                          console.error('Error accepting friend request:', error);
                          alert('Failed to accept friend request');
                        } finally {
                          setIsAcceptingRequest(false);
                        }
                      }}
                      disabled={isAcceptingRequest}
                      className="flex-1 relative px-4 py-1.5 rounded-full text-white text-xs font-medium tracking-wider uppercase transition-all overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ 
                        fontFamily: "'Bebas Neue', sans-serif", 
                        letterSpacing: '0.1em',
                        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #3b82f6 75%, #60a5fa 100%)'
                      }}
                    >
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: 'url(/bg-version-4k.png)',
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}
                      />
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {isAcceptingRequest && <Loader2 className="w-3 h-3 animate-spin" />}
                        {isAcceptingRequest ? 'Accepting...' : 'Accept'}
                      </span>
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          setIsAcceptingRequest(true);
                          
                          // Immediately hide the pending request from UI
                          setPendingRequests(prev => prev.filter(req => req.xuid !== selectedFriend.oder_id));
                          
                          if (selectedFriend.oder_id) {
                            // Get current user's XUID
                            const currentUserXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
                            if (!currentUserXuid) {
                              throw new Error('Current user XUID not found');
                            }
                            
                            await launcher.declineXboxFriendRequest(selectedFriend.oder_id);
                            console.log('[Friends] ✓ Declined on Xbox Live');
                            
                            // Update dragon_users table (decline request)
                            try {
                              console.log('[Friends] Updating dragon_users: sender=', selectedFriend.oder_id, 'receiver=', currentUserXuid);
                              
                              const { updateXboxRequestStatus } = await import("@/lib/friendsService");
                              await updateXboxRequestStatus(selectedFriend.oder_id, currentUserXuid, 'declined');
                              
                              console.log('[Friends] ✓ Updated dragon_users (declined)');
                            } catch (supabaseError) {
                              console.error('[Friends] dragon_users update failed:', supabaseError);
                            }
                            
                            // Reload pending requests from dragon_users
                            const { getPendingXboxRequests } = await import("@/lib/friendsService");
                            const pendingRequestsList = await getPendingXboxRequests(currentUserXuid);
                            
                            if (pendingRequestsList && pendingRequestsList.length > 0) {
                              const senderXuids = pendingRequestsList.map(req => req.sender_xuid);
                              
                              // Fetch profiles from dragon_users
                              const { data: senderProfiles } = await supabase
                                .from('dragon_users')
                                .select('xuid, gamertag, avatar_url, real_name, gamerscore')
                                .in('xuid', senderXuids);
                              
                              const pendingWithProfiles = pendingRequestsList.map(request => {
                                const profile = senderProfiles?.find(p => p.xuid === request.sender_xuid);
                                return profile ? {
                                  gamertag: profile.gamertag,
                                  xuid: profile.xuid,
                                  display_pic_raw: profile.avatar_url,
                                  real_name: profile.real_name,
                                  gamerscore: profile.gamerscore
                                } : {
                                  gamertag: request.sender_gamertag || `User_${request.sender_xuid.substring(0, 8)}`,
                                  xuid: request.sender_xuid,
                                  display_pic_raw: null,
                                  real_name: null,
                                  gamerscore: null,
                                };
                              });
                              
                              setPendingRequests(pendingWithProfiles);
                            } else {
                              setPendingRequests([]);
                            }
                            
                            setShowFriendProfileDialog(false);
                            alert('Friend request declined');
                          }
                        } catch (error) {
                          console.error('Error declining friend request:', error);
                          alert('Failed to decline friend request');
                        } finally {
                          setIsAcceptingRequest(false);
                        }
                      }}
                      disabled={isAcceptingRequest}
                      className="flex-1 relative px-4 py-1.5 rounded-full text-white text-xs font-medium tracking-wider uppercase transition-all overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ 
                        fontFamily: "'Bebas Neue', sans-serif", 
                        letterSpacing: '0.1em',
                        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #3b82f6 75%, #60a5fa 100%)'
                      }}
                    >
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: 'url(/bg-version-4k.png)',
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}
                      />
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {isAcceptingRequest && <Loader2 className="w-3 h-3 animate-spin" />}
                        {isAcceptingRequest ? 'Declining...' : 'Decline'}
                      </span>
                    </button>
                  </div>
                ) : selectedFriend.id === 'current-user' ? (
                  isEditingProfile ? (
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          try {
                            setIsSavingProfile(true);
                            const currentOderId = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
                            if (currentOderId) {
                              // Only save bio - avatar and banner come from Xbox
                              const updatedProfile = await updateUserProfile(currentOderId, {
                                bio: editBio
                              });
                              setIsEditingProfile(false);
                              // Update the selected friend data
                              setSelectedFriend({
                                ...selectedFriend,
                                bio: editBio
                              });
                              alert('Bio updated successfully!');
                            }
                          } catch (error) {
                            console.error('Error updating profile:', error);
                            alert('Failed to update profile');
                          } finally {
                            setIsSavingProfile(false);
                          }
                        }}
                        disabled={isSavingProfile}
                        className="flex-1 relative px-4 py-1.5 rounded-full text-white text-xs font-medium tracking-wider uppercase transition-all overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ 
                          fontFamily: "'Bebas Neue', sans-serif", 
                          letterSpacing: '0.1em',
                          background: 'linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #ffffff 100%)'
                        }}
                      >
                        <div
                          className="absolute inset-0 opacity-30"
                          style={{
                            backgroundImage: 'url(/bg-version-4k.png)',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                          }}
                        />
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {isSavingProfile && <Loader2 className="w-3 h-3 animate-spin" />}
                          {isSavingProfile ? 'Saving...' : 'Save Changes'}
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingProfile(false);
                          setEditBio(selectedFriend.bio || '');
                        }}
                        className="flex-1 relative px-4 py-1.5 rounded-full text-white text-xs font-medium tracking-wider uppercase transition-all overflow-hidden"
                        style={{ 
                          fontFamily: "'Bebas Neue', sans-serif", 
                          letterSpacing: '0.1em',
                          background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #3b82f6 75%, #60a5fa 100%)'
                        }}
                      >
                        <div
                          className="absolute inset-0 opacity-30"
                          style={{
                            backgroundImage: 'url(/bg-version-4k.png)',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                          }}
                        />
                        <span className="relative z-10">Cancel</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditBio(selectedFriend.bio || '');
                        setIsEditingProfile(true);
                      }}
                      className="w-full relative px-4 py-1.5 rounded-full text-white text-xs font-medium tracking-wider uppercase transition-all overflow-hidden"
                      style={{ 
                        fontFamily: "'Bebas Neue', sans-serif", 
                        letterSpacing: '0.1em',
                        background: 'linear-gradient(135deg, #ec4899 0%, #f472b6 50%, #ffffff 100%)'
                      }}
                    >
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: 'url(/bg-version-4k.png)',
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}
                      />
                      <span className="relative z-10">Edit Profile</span>
                    </button>
                  )
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        setIsRemovingFriend(true);
                        if (selectedFriend.oder_id) {
                          await launcher.declineXboxFriendRequest(selectedFriend.oder_id);
                          // Refresh friends list
                          const updatedFriends = await launcher.getXboxFriends();
                          setFriends(updatedFriends);
                          setXboxFriends(updatedFriends);
                          console.log('[Friends] ✓ Updated friends list after removal');
                          setShowFriendProfileDialog(false);
                          alert('Friend removed successfully!');
                        }
                      } catch (error) {
                        console.error('Error removing friend:', error);
                        alert('Failed to remove friend');
                      } finally {
                        setIsRemovingFriend(false);
                      }
                    }}
                    disabled={isRemovingFriend}
                    className="w-full relative px-4 py-1.5 rounded-full text-white text-xs font-medium tracking-wider uppercase transition-all overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ 
                      fontFamily: "'Bebas Neue', sans-serif", 
                      letterSpacing: '0.1em',
                      background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #3b82f6 75%, #60a5fa 100%)'
                    }}
                  >
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage: 'url(/bg-version-4k.png)',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isRemovingFriend && <Loader2 className="w-3 h-3 animate-spin" />}
                      {isRemovingFriend ? 'Removing...' : 'Remove Friend'}
                    </span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>

      {/* Version Players Dialog */}
      <Dialog open={showVersionPlayersDialog} onOpenChange={setShowVersionPlayersDialog}>
        <DialogContent className="bg-[#232428] border-none p-0 max-w-[500px] overflow-hidden">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-white mb-2">
              Minecraft {selectedVersionPlayers.version}
            </h2>
            <p className="text-white/60 text-sm mb-6">
              {selectedVersionPlayers.players.length} {selectedVersionPlayers.players.length === 1 ? 'player' : 'players'} currently playing
            </p>

            {/* Players List */}
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {selectedVersionPlayers.players.map((player) => (
                <div
                  key={player.xuid}
                  className="bg-[#111214] rounded-lg p-3 flex items-center gap-3 hover:bg-[#1a1c1f] transition-colors"
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <SocialAvatar
                      name={player.gamertag}
                      src={player.avatar_url}
                      className="w-12 h-12"
                      initialClassName="text-lg"
                    />
                    {/* Online indicator */}
                    {player.is_online && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#111214]" />
                    )}
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-sm truncate">{player.gamertag}</h3>
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <span className="capitalize">{player.loader || 'Vanilla'}</span>
                      <span>•</span>
                      <span>{player.game_version}</span>
                    </div>
                    {player.server_ip && (
                      <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
                        <Server className="w-3 h-3" />
                        <span className="font-mono truncate">{player.server_ip}</span>
                      </div>
                    )}
                    {player.world_name && !player.server_ip && (
                      <div className="flex items-center gap-1 text-xs text-blue-400 mt-1">
                        <UserCircle2 className="w-3 h-3" />
                        <span className="truncate">{player.world_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Incoming Call Dialog */}
      <Dialog open={showIncomingCallDialog} onOpenChange={setShowIncomingCallDialog}>
        <DialogContent className="bg-[#232428] border-none p-6 max-w-[400px]">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <PhoneCall className="w-10 h-10 text-emerald-500 animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Incoming Call
            </h2>
            <p className="text-white/60 mb-6">
              {incomingCall?.callerName} is calling you
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (incomingCall) {
                    try {
                      // Open voice chat window to answer
                      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                      
                      const currentXuid = localStorage.getItem('lapetus_oder_id') || localStorage.getItem('dragon_oder_id');
                      const currentUsername = activeAccount?.username || 'You';
                      
                      const voiceChatUrl = `/voice-chat.html?caller=${encodeURIComponent(incomingCall.callerId)}&callerName=${encodeURIComponent(incomingCall.callerName)}&receiver=${encodeURIComponent(currentXuid || '')}&receiverName=${encodeURIComponent(currentUsername)}&isCaller=false`;
                      
                      const webview = new WebviewWindow('voice-chat', {
                        url: voiceChatUrl,
                        title: `Voice Call - ${incomingCall.callerName}`,
                        width: 400,
                        height: 600,
                        resizable: false,
                        center: true,
                        alwaysOnTop: true,
                        decorations: true,
                        transparent: false,
                      });
                      
                      setShowIncomingCallDialog(false);
                      setIncomingCall(null);
                    } catch (err) {
                      console.error('[Voice Chat] Failed to answer:', err);
                      alert('Failed to answer call');
                    }
                  }
                }}
                className="flex-1 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors"
              >
                Answer
              </button>
              <button
                onClick={async () => {
                  if (incomingCall) {
                    // Send reject signal
                    await supabase.channel(`voice_call_${incomingCall.callerId}`)
                      .send({ type: 'broadcast', event: 'call_signal', payload: { type: 'call_rejected', callId: incomingCall.callId } });
                    
                    setShowIncomingCallDialog(false);
                    setIncomingCall(null);
                  }
                }}
                className="flex-1 py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay />
    </TooltipProvider>
  );
}
