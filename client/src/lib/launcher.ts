// Tauri API wrapper for Minecraft launcher functionality

interface VersionInfo {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
}

interface ForgeVersionInfo {
  id: string;
  mc_version: string;
  forge_version: string;
  installer_url: string;
  is_recommended: boolean;
}

interface FabricVersionInfo {
  id: string;
  mc_version: string;
  loader_version: string;
  stable: boolean;
}

interface QuiltVersionInfo {
  id: string;
  mc_version: string;
  loader_version: string;
  stable: boolean;
}

interface DragonVersionInfo {
  id: string;
  mc_version: string;
  loader_version: string;
  stable: boolean;
}

interface LapetusVersionInfo {
  id: string;
  mc_version: string;
  pack_version: string;
  loader_version: string;
  version_type: string;
  download_url: string;
  file_name: string;
  file_size: number;
}

interface BedrockVersionInfo {
  id: string;
  version: string;
  download_url: string;
  file_size: number;
  is_installed: boolean;
}

interface AuthAccount {
  uuid: string;
  username: string;
  access_token: string;
  refresh_token?: string;
  token_expires?: string;
  is_offline: boolean;
  skin_url?: string;
  skin_username?: string;
}

interface XboxFriend {
  gamertag: string;
  xuid: string;
  display_pic_raw?: string;
  real_name?: string;
  gamerscore?: string;
}

interface InstallProgress {
  progress: number;
  status: string;
}

// Check if running in Tauri - check multiple possible indicators
const checkTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  // @ts-ignore
  return !!(window.__TAURI__ || window.__TAURI_INTERNALS__ || window.__TAURI_IPC__);
};

let _isTauri: boolean | null = null;
const isTauri = () => {
  if (_isTauri === null) {
    _isTauri = checkTauri();
    console.log('Tauri detection:', _isTauri);
  }
  return _isTauri;
};

export const launcherApi = {
  isAvailable: () => true, // Always return true since we'll handle errors gracefully

  async getVersions(): Promise<VersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_versions');
    } catch (e) {
      console.log('Tauri invoke failed, using fetch fallback:', e);
      // Fallback to direct fetch
      const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
      const data = await response.json();
      return data.versions;
    }
  },

  async getInstalledVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_versions');
    } catch (e) {
      console.log('getInstalledVersions failed:', e);
      return [];
    }
  },

  async installVersion(
    versionId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<InstallProgress>('install-progress', (event) => {
          console.log('Install progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        await invoke('install_version', { versionId });
        // Ensure we show 100% completion
        onProgress?.(1.0, 'Installation complete!');
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Install failed:', e);
      throw e;
    }
  },

  async launchGame(
    versionId: string,
    username: string,
    uuid?: string,
    accessToken?: string,
    onLog?: (line: string) => void,
    dragonModSource: 'github' | 'local' = 'github'
  ): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Get oder_id from localStorage for friends system
      const oderId = localStorage.getItem('lapetus_oder_id') || '';

      // Get tier from storage - only for Lapetus/Resonance versions
      // Modpacks don't use tiers
      let tier = null;
      if (versionId.startsWith('lapetus-')) {
        const { getTierFromStorage } = await import('./membership');
        tier = getTierFromStorage(oderId || undefined);
        console.log('[Launch] Using tier:', tier, 'for Resonance');
      } else {
        console.log('[Launch] Modpack launch - no tier needed');
      }

      // Set up log listener
      let unlisten: (() => void) | undefined;
      if (onLog) {
        unlisten = await listen<{ line: string }>('game-log', (event) => {
          onLog(event.payload.line);
        });
      }

      try {
        await invoke('launch_game', { versionId, username, uuid, accessToken, oderId, tier, dragonModSource });
      } finally {
        // Don't unlisten immediately - keep listening for logs while game runs
        // The listener will be cleaned up when the component unmounts
      }

      // Return the unlisten function so caller can clean up
      return unlisten as any;
    } catch (e) {
      console.error('Launch failed:', e);
      throw e;
    }
  },

  async getMinecraftDir(): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_minecraft_dir');
    } catch (e) {
      return '~/Library/Application Support/trapgaint';
    }
  },

  async quickVerify(versionId: string): Promise<boolean> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('quick_verify', { versionId });
    } catch (e) {
      console.error('Quick verify failed:', e);
      return false;
    }
  },

  async isGameRunning(): Promise<boolean> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('is_game_running');
    } catch (e) {
      return false;
    }
  },

  async stopGame(): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_game');
    } catch (e) {
      console.error('Stop game failed:', e);
      throw e;
    }
  },

  async repairVersion(
    versionId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<number> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<InstallProgress>('install-progress', (event) => {
          console.log('Repair progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        const repaired = await invoke('repair_version', { versionId });
        onProgress?.(1.0, `Repair complete! Fixed ${repaired} files.`);
        return repaired as number;
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Repair failed:', e);
      throw e;
    }
  },

  // Forge API methods
  async getForgeVersions(): Promise<ForgeVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_forge_versions');
    } catch (e) {
      console.error('Failed to get Forge versions:', e);
      return [];
    }
  },

  async getInstalledForgeVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_forge_versions');
    } catch (e) {
      console.log('getInstalledForgeVersions failed:', e);
      return [];
    }
  },

  async getForgeVersionsForMc(mcVersion: string): Promise<ForgeVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_forge_versions_for_mc', { mcVersion });
    } catch (e) {
      console.error('Failed to get Forge versions for MC:', e);
      return [];
    }
  },

  async installForge(
    forgeVersion: ForgeVersionInfo,
    onProgress?: (progress: number, status: string) => void
  ): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<InstallProgress>('install-progress', (event) => {
          console.log('Forge install progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        const result = await invoke('install_forge', { forgeVersion });
        onProgress?.(1.0, 'Forge installation complete!');
        return result as string;
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Forge install failed:', e);
      throw e;
    }
  },

  // Fabric API methods
  async getFabricVersions(): Promise<FabricVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_fabric_versions');
    } catch (e) {
      console.error('Failed to get Fabric versions:', e);
      return [];
    }
  },

  async getInstalledFabricVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_fabric_versions');
    } catch (e) {
      console.log('getInstalledFabricVersions failed:', e);
      return [];
    }
  },

  async isVersionInstalled(versionId: string): Promise<boolean> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('is_version_installed', { versionId });
    } catch (e) {
      console.log('isVersionInstalled failed:', e);
      return false;
    }
  },

  async getInstalledGameVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_game_versions');
    } catch (e) {
      console.log('getInstalledGameVersions failed:', e);
      return [];
    }
  },

  async getFabricVersionsForMc(mcVersion: string): Promise<FabricVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_fabric_versions_for_mc', { mcVersion });
    } catch (e) {
      console.error('Failed to get Fabric versions for MC:', e);
      return [];
    }
  },

  async installFabric(
    fabricVersion: FabricVersionInfo,
    onProgress?: (progress: number, status: string) => void
  ): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<InstallProgress>('install-progress', (event) => {
          console.log('Fabric install progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        const result = await invoke('install_fabric', { fabricVersion });
        onProgress?.(1.0, 'Fabric installation complete!');
        return result as string;
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Fabric install failed:', e);
      throw e;
    }
  },

  // Quilt API methods
  async getQuiltVersions(): Promise<QuiltVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_quilt_versions');
    } catch (e) {
      console.error('Failed to get Quilt versions:', e);
      return [];
    }
  },

  async getInstalledQuiltVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_quilt_versions');
    } catch (e) {
      console.log('getInstalledQuiltVersions failed:', e);
      return [];
    }
  },

  async getQuiltVersionsForMc(mcVersion: string): Promise<QuiltVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_quilt_versions_for_mc', { mcVersion });
    } catch (e) {
      console.error('Failed to get Quilt versions for MC:', e);
      return [];
    }
  },

  async installQuilt(
    quiltVersion: QuiltVersionInfo,
    onProgress?: (progress: number, status: string) => void
  ): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<InstallProgress>('install-progress', (event) => {
          console.log('Quilt install progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        const result = await invoke('install_quilt', { quiltVersion });
        onProgress?.(1.0, 'Quilt installation complete!');
        return result as string;
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Quilt install failed:', e);
      throw e;
    }
  },

  // Dragon API methods
  async getDragonVersions(): Promise<FabricVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_dragon_versions');
    } catch (e) {
      console.error('Failed to get Dragon versions:', e);
      return [];
    }
  },

  async getInstalledDragonVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_dragon_versions');
    } catch (e) {
      console.log('getInstalledDragonVersions failed:', e);
      return [];
    }
  },

  async installDragon(
    dragonVersion: FabricVersionInfo,
    onProgress?: (progress: number, status: string) => void
  ): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<InstallProgress>('install-progress', (event) => {
          console.log('Dragon install progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        const result = await invoke('install_dragon', { dragonVersion });
        onProgress?.(1.0, 'Dragon installation complete!');
        return result as string;
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Dragon install failed:', e);
      throw e;
    }
  },

  async uninstallDragon(versionId: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('uninstall_dragon', { versionId });
    } catch (e) {
      console.error('Dragon uninstall failed:', e);
      throw e;
    }
  },

  // Dragon (Fabulously Optimized) API methods
  async getLapetusVersions(): Promise<LapetusVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_lapetus_versions');
    } catch (e) {
      console.error('Failed to get Lapetus versions:', e);
      return [];
    }
  },

  async getInstalledLapetusVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_lapetus_versions');
    } catch (e) {
      console.log('getInstalledLapetusVersions failed:', e);
      return [];
    }
  },

  async cleanupLapetus(): Promise<number> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      const cleaned: number = await invoke('cleanup_lapetus');
      if (cleaned > 0) {
        console.log(`[Lapetus] Cleaned up ${cleaned} old files`);
      }
      return cleaned;
    } catch (e) {
      console.log('cleanupLapetus failed:', e);
      return 0;
    }
  },

  async installLapetus(
    lapetusVersion: LapetusVersionInfo,
    onProgress?: (progress: number, status: string) => void
  ): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<InstallProgress>('install-progress', (event) => {
          console.log('Lapetus install progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        const result = await invoke('install_lapetus', { lapetusVersion });
        onProgress?.(1.0, 'Dragon installation complete!');
        return result as string;
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Lapetus install failed:', e);
      throw e;
    }
  },

  async uninstallLapetus(versionId: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('uninstall_lapetus', { versionId });
    } catch (e) {
      console.error('Lapetus uninstall failed:', e);
      throw e;
    }
  },

  async verifyLapetusMods(versionId: string): Promise<{
    is_valid: boolean;
    missing_count: number;
    total_count: number;
    missing_mods: string[];
    needs_repair: boolean;
  }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('verify_lapetus_mods', { versionId });
    } catch (e) {
      console.error('Verify Lapetus mods failed:', e);
      return { is_valid: false, missing_count: 0, total_count: 0, missing_mods: [], needs_repair: true };
    }
  },

  async checkLapetusModUpdate(): Promise<{ has_update: boolean; version?: string }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('check_lapetus_mod_update');
    } catch (e) {
      console.error('Check Lapetus mod update failed:', e);
      return { has_update: false };
    }
  },

  async updateLapetusMod(onProgress?: (progress: number, status: string) => void): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<{ progress: number; status: string }>('install-progress', (event) => {
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        await invoke('update_lapetus_mod');
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Update Lapetus mod failed:', e);
      throw e;
    }
  },

  // Bedrock Edition API methods
  async getBedrockVersions(): Promise<BedrockVersionInfo[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_bedrock_versions');
    } catch (e) {
      console.error('Failed to get Bedrock versions:', e);
      return [];
    }
  },

  async getInstalledBedrockVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_bedrock_versions');
    } catch (e) {
      console.log('getInstalledBedrockVersions failed:', e);
      return [];
    }
  },

  async installBedrock(
    versionId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<InstallProgress>('install-progress', (event) => {
          console.log('Bedrock install progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        await invoke('install_bedrock', { versionId });
        onProgress?.(1.0, 'Bedrock Edition installation complete!');
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Bedrock install failed:', e);
      throw e;
    }
  },

  async launchBedrock(versionId: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('launch_bedrock', { versionId });
    } catch (e) {
      console.error('Bedrock launch failed:', e);
      throw e;
    }
  },

  // Modpack API methods
  async getModpacks(): Promise<any[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_modpacks');
    } catch (e) {
      console.error('Failed to get modpacks:', e);
      return [];
    }
  },

  async getModpacksPaginated(page: number, perPage: number, query?: string, gameVersion?: string, loader?: string): Promise<{ modpacks: any[]; total: number }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      const params: Record<string, unknown> = { page, per_page: perPage };
      if (query?.trim()) {
        params.query = query.trim();
      }
      if (gameVersion) {
        params.game_version = gameVersion;
      }
      if (loader) {
        params.loader = loader;
      }
      console.log('[Launcher] Calling get_modpacks_paginated with params:', params);
      const result = await invoke('get_modpacks_paginated', params) as [any[], number];
      const [modpacks, total] = result;
      console.log('[Launcher] get_modpacks_paginated returned:', { modpacks: modpacks.length, total });
      return { modpacks, total };
    } catch (e) {
      console.error('[Launcher] Failed to get paginated modpacks from Modrinth:', e);
      console.log('[Launcher] Falling back to static modpacks.json...');
      
      // Fallback to static modpacks.json
      try {
        const response = await fetch('/modpacks.json');
        const data = await response.json();
        const staticModpacks = data.modpacks || [];
        console.log('[Launcher] Loaded', staticModpacks.length, 'modpacks from static file');
        
        // Apply pagination to static modpacks
        const start = page * perPage;
        const end = start + perPage;
        const paginatedModpacks = staticModpacks.slice(start, end);
        
        return { modpacks: paginatedModpacks, total: staticModpacks.length };
      } catch (fallbackError) {
        console.error('[Launcher] Failed to load static modpacks.json:', fallbackError);
        return { modpacks: [], total: 0 };
      }
    }
  },

  async getModpackVersions(projectId: string): Promise<any[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_modpack_versions', { projectId });
    } catch (e) {
      console.error('Failed to get modpack versions:', e);
      return [];
    }
  },

  async getInstalledModpackVersions(): Promise<string[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_installed_modpack_versions');
    } catch (e) {
      console.error('Failed to get installed modpack versions:', e);
      return [];
    }
  },

  async searchModpacks(
    query: string,
    gameVersion?: string,
    loader?: string,
    limit?: number,
    offset?: number
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
      source?: 'modrinth' | 'curseforge';
    }>;
    total_hits: number;
  }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('search_modpacks', {
        query,
        game_version: gameVersion,
        loader,
        limit,
        offset,
      });
    } catch (e) {
      console.error('Failed to search modpacks:', e);
      return { hits: [], total_hits: 0 };
    }
  },

  async installModpack(
    versionId: string,
    modpackName: string,
    gameVersion: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<{ progress: number; status: string }>('modpack-install-progress', (event) => {
          console.log('Modpack install progress:', event.payload);
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        const result = await invoke('install_modpack', { versionId, modpackName, gameVersion });
        onProgress?.(1.0, 'Modpack installation complete!');
        return result as string;
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Modpack install failed:', e);
      throw e;
    }
  },

  async isModpackInstalled(modpackId: string, mcVersion: string): Promise<boolean> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('is_modpack_installed', { modpackId, mcVersion });
    } catch (e) {
      console.error('Check modpack installed failed:', e);
      return false;
    }
  },

  async uninstallModpack(modpackId: string, mcVersion: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('uninstall_modpack', { modpackId, mcVersion });
    } catch (e) {
      console.error('Modpack uninstall failed:', e);
      throw e;
    }
  },

  async getModpackMods(versionId: string): Promise<Array<{
    filename: string;
    display_name: string;
    enabled: boolean;
    size: number;
    path: string;
  }>> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_modpack_mods', { versionId });
    } catch (e) {
      console.error('Get modpack mods failed:', e);
      return [];
    }
  },

  async toggleModpackMod(versionId: string, filename: string): Promise<boolean> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('toggle_modpack_mod', { versionId, filename });
    } catch (e) {
      console.error('Toggle modpack mod failed:', e);
      throw e;
    }
  },

  async openFolder(path: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_folder', { path });
    } catch (e) {
      console.error('Open folder failed:', e);
      throw e;
    }
  },

  async getVersionInfo(versionId: string): Promise<{
    version_id: string;
    base_version: string;
    loader: string;
    is_modded: boolean;
    version_dir: string;
    mods_dir: string;
    saves_dir: string;
    game_dir: string;
    mods: Array<{ name: string; path: string; size: number }>;
    worlds: Array<{ name: string; path: string }>;
  }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_version_info', { versionId });
    } catch (e) {
      console.error('Get version info failed:', e);
      throw e;
    }
  },

  async getAllMods(versionId?: string): Promise<Array<{
    name: string;
    display_name: string;
    mod_id?: string;
    version?: string;
    author?: string;
    path: string;
    size: number;
    enabled: boolean;
    icon_path?: string;
  }>> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_all_mods', { versionId });
    } catch (e) {
      console.error('Get all mods failed:', e);
      return [];
    }
  },

  async ensureModsInstalled(
    versionId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<{ installed: number; total: number }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      // Set up progress listener
      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<{ progress: number; status: string }>('install-progress', (event) => {
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        const result = await invoke('ensure_mods_installed', { versionId });
        return result as { installed: number; total: number };
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Ensure mods installed failed:', e);
      throw e;
    }
  },

  async searchMods(query: string, gameVersion?: string, loader?: string, limit?: number, offset?: number): Promise<{
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
      source?: 'modrinth' | 'curseforge';
      date_modified?: string;
    }>;
    total_hits: number;
  }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('search_mods', { query, gameVersion, loader, limit, offset });
    } catch (e) {
      console.error('Search mods failed:', e);
      throw e;
    }
  },

  async getModDetails(projectId: string, source?: 'modrinth' | 'curseforge'): Promise<{
    id: string;
    slug: string;
    title: string;
    description: string;
    body: string;
    categories: string[];
    downloads: number;
    icon_url: string;
    license?: { id: string; name: string };
    source_url?: string;
    wiki_url?: string;
    discord_url?: string;
    gallery?: Array<{ url: string }>;
    website_url?: string;
    source?: 'modrinth' | 'curseforge';
  }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_mod_details', { projectId, source });
    } catch (e) {
      console.error('Get mod details failed:', e);
      throw e;
    }
  },

  async getModVersions(projectId: string, source?: 'modrinth' | 'curseforge'): Promise<Array<{
    id: string;
    project_id: string;
    name: string;
    version_number: string;
    game_versions: string[];
    loaders: string[];
    files: Array<{
      url: string;
      filename: string;
      size: number;
    }>;
  }>> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_mod_versions', { projectId, source });
    } catch (e) {
      console.error('Get mod versions failed:', e);
      throw e;
    }
  },

  async downloadMod(projectId: string, versionId: string, filename: string, downloadUrl: string, gameVersion: string): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('download_mod', { projectId, versionId, filename, downloadUrl, gameVersion });
    } catch (e) {
      console.error('Download mod failed:', e);
      throw e;
    }
  },

  async toggleMod(modPath: string): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // Determine if mod is currently enabled (doesn't end with .disabled)
      const isCurrentlyEnabled = !modPath.toLowerCase().endsWith('.disabled');
      // Toggle to opposite state
      return await invoke('toggle_mod', { modPath, enabled: !isCurrentlyEnabled });
    } catch (e) {
      console.error('Toggle mod failed:', e);
      throw e;
    }
  },

  async getFeaturedMods(limit?: number, loader?: string, gameVersion?: string, offset?: number): Promise<{
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
      source?: 'modrinth' | 'curseforge';
      date_modified?: string;
    }>;
    total_hits: number;
  }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_featured_mods', { limit: limit || 12, loader, gameVersion, offset });
    } catch (e) {
      console.error('Get featured mods failed:', e);
      return { hits: [], total_hits: 0 };
    }
  },

  async getModIconsBatch(modIds: string[]): Promise<Record<string, string>> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_mod_icons_batch', { modIds });
    } catch (e) {
      console.error('Get mod icons batch failed:', e);
      return {};
    }
  },

  // Authentication API methods
  async getLoginUrl(): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_login_url');
    } catch (e) {
      console.error('Get login URL failed:', e);
      throw e;
    }
  },

  async openLoginWindow(): Promise<void> {
    // Not used anymore - we use system browser
  },

  async startMsLogin(): Promise<AuthAccount> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('start_ms_login');
    } catch (e) {
      console.error('MS login failed:', e);
      throw e;
    }
  },

  async checkLoginRedirect(): Promise<string | null> {
    return null; // Not used anymore
  },

  async closeLoginWindow(): Promise<void> {
    // Not used anymore
  },

  async completeMsLogin(authCode: string): Promise<AuthAccount> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('complete_ms_login', { authCode });
    } catch (e) {
      console.error('MS auth failed:', e);
      throw e;
    }
  },

  async createOfflineAccount(username: string, skinUsername?: string): Promise<AuthAccount> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('create_offline_account', { username, skinUsername });
    } catch (e) {
      console.error('Create offline account failed:', e);
      throw e;
    }
  },

  async dragonLogin(username: string): Promise<{ token: string; uuid: string; access_token: string }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('dragon_login', { username });
    } catch (e) {
      console.error('Dragon login failed:', e);
      throw e;
    }
  },

  async getAccounts(): Promise<AuthAccount[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_accounts');
    } catch (e) {
      console.error('Get accounts failed:', e);
      return [];
    }
  },

  async getActiveAccount(): Promise<AuthAccount | null> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_active_account');
    } catch (e) {
      console.error('Get active account failed:', e);
      return null;
    }
  },

  async setActiveAccount(uuid: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_active_account', { uuid });
    } catch (e) {
      console.error('Set active account failed:', e);
      throw e;
    }
  },

  async removeAccount(uuid: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('remove_account', { uuid });
    } catch (e) {
      console.error('Remove account failed:', e);
      throw e;
    }
  },

  async refreshAccount(uuid: string): Promise<AuthAccount> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('refresh_account', { uuid });
    } catch (e) {
      console.error('Refresh account failed:', e);
      throw e;
    }
  },

  async updateAccountSkin(uuid: string, skinUsername: string | null): Promise<AuthAccount> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // Tauri command args use camelCase mapping from Rust snake_case names.
      return await invoke('update_account_skin', { uuid, skinUsername });
    } catch (e) {
      console.error('Update account skin failed:', e);
      throw e;
    }
  },

  async getXboxFriends(): Promise<XboxFriend[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_xbox_friends');
    } catch (e) {
      console.error('Get Xbox friends failed:', e);
      return [];
    }
  },

  async getCurrentXboxProfile(): Promise<XboxFriend | null> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_current_xbox_profile');
    } catch (e) {
      console.error('Get current Xbox profile failed:', e);
      return null;
    }
  },

  async searchXboxUsers(searchQuery: string): Promise<XboxFriend[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('search_xbox_users', { searchQuery });
    } catch (e) {
      console.error('Search Xbox users failed:', e);
      return [];
    }
  },

  async sendXboxFriendRequest(targetXuid: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('send_xbox_friend_request', { targetXuid });
    } catch (e) {
      console.error('Send Xbox friend request failed:', e);
      throw e;
    }
  },

  async getXboxFriendRequests(): Promise<XboxFriend[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_xbox_friend_requests');
    } catch (e) {
      console.error('Get Xbox friend requests failed:', e);
      return [];
    }
  },
  async syncXboxFriendRequestsToSupabase(supabaseUrl: string, supabaseKey: string): Promise<XboxFriend[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('sync_xbox_friend_requests_to_supabase', {
        supabaseUrl,
        supabaseKey
      });
    } catch (e) {
      console.error('Sync Xbox friend requests to Supabase failed:', e);
      return [];
    }
  },


  async acceptXboxFriendRequest(targetXuid: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('accept_xbox_friend_request', { targetXuid });
    } catch (e) {
      console.error('Accept Xbox friend request failed:', e);
      throw e;
    }
  },

  async declineXboxFriendRequest(targetXuid: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('decline_xbox_friend_request', { targetXuid });
    } catch (e) {
      console.error('Decline Xbox friend request failed:', e);
      throw e;
    }
  },

  async getXboxProfilesByXuids(xuids: string[]): Promise<XboxFriend[]> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_xbox_profiles_by_xuids', { xuids });
    } catch (e) {
      console.error('Get Xbox profiles by XUIDs failed:', e);
      return [];
    }
  },

  async openExternalUrl(url: string): Promise<void> {
    try {
      // @ts-ignore - Use Tauri's shell command to open URL
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_folder', { path: url });
    } catch (e) {
      // Fallback to window.open
      window.open(url, '_blank');
    }
  },

  // Auto-updater functions
  async checkForUpdates(): Promise<{
    available: boolean;
    version?: string;
    notes?: string;
    date?: string;
  }> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { getVersion } = await import('@tauri-apps/api/app');

      const currentVersion = await getVersion();
      console.log('[Updater] Current app version:', currentVersion);

      // Use custom check_app_update command instead of Tauri plugin
      console.log('[Updater] Calling check_app_update command...');
      const result = await invoke<{
        available: boolean;
        current_version?: string;
        latest_version?: string;
      }>('check_app_update');
      console.log('[Updater] check_app_update returned:', result);

      if (result && result.available) {
        const latestVersion = result.latest_version || currentVersion;
        console.log('[Updater] Update available:', result.current_version, '->', latestVersion);
        return {
          available: true,
          version: latestVersion,
          notes: `Dragon Client v${latestVersion}`,
          date: new Date().toISOString(),
        };
      }

      console.log('[Updater] No update available');
      return { available: false };
    } catch (e) {
      console.error('[Updater] Check for updates failed:', e);
      return { available: false };
    }
  },

  async downloadAndInstallUpdate(
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');

      console.log('[Updater] Starting update download and install...');
      
      // Use custom perform_app_update command
      await invoke('perform_app_update');
      
      console.log('[Updater] Update complete, app will restart');
    } catch (e) {
      console.error('Download and install update failed:', e);
      throw e;
    }
  },

  async getAppVersion(): Promise<string> {
    try {
      // @ts-ignore
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch (e) {
      console.error('Get app version failed:', e);
      return '1.0.0';
    }
  },

  // Crash report API methods
  async getCrashReports(): Promise<Array<{
    filename: string;
    path: string;
    modified: number;
  }>> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_crash_reports');
    } catch (e) {
      console.error('Get crash reports failed:', e);
      return [];
    }
  },

  async readCrashReport(path: string): Promise<string> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('read_crash_report', { path });
    } catch (e) {
      console.error('Read crash report failed:', e);
      throw e;
    }
  },

  async getLatestCrash(): Promise<{
    filename: string;
    path: string;
    modified: number;
    content: string;
  } | null> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_latest_crash');
    } catch (e) {
      console.error('Get latest crash failed:', e);
      return null;
    }
  },

  async getLatestLog(): Promise<{
    path: string;
    modified: number;
    content: string;
    error_summary: string;
    has_errors: boolean;
  } | null> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_latest_log');
    } catch (e) {
      console.error('Get latest log failed:', e);
      return null;
    }
  },

  async openCrashFolder(): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_crash_folder');
    } catch (e) {
      console.error('Open crash folder failed:', e);
      throw e;
    }
  },

  async openCrashViewer(crashPath?: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_crash_viewer', { crashPath });
    } catch (e) {
      console.error('Open crash viewer failed:', e);
      throw e;
    }
  },

  // CustomSkinLoader functions
  async installCustomSkinLoader(
    versionId: string,
    mcVersion: string,
    loaderType: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      // @ts-ignore
      const { listen } = await import('@tauri-apps/api/event');

      let unlisten: (() => void) | undefined;
      if (onProgress) {
        unlisten = await listen<{ progress: number; status: string }>('csl-install-progress', (event) => {
          onProgress(event.payload.progress, event.payload.status);
        });
      }

      try {
        await invoke('install_customskinloader', { versionId, mcVersion, loaderType });
        onProgress?.(1.0, 'CustomSkinLoader installed!');
      } finally {
        if (unlisten) {
          unlisten();
        }
      }
    } catch (e) {
      console.error('Install CustomSkinLoader failed:', e);
      throw e;
    }
  },

  async isCustomSkinLoaderInstalled(versionId: string): Promise<boolean> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('is_customskinloader_installed', { versionId });
    } catch (e) {
      console.error('Check CustomSkinLoader installed failed:', e);
      return false;
    }
  },

  async uninstallCustomSkinLoader(versionId: string): Promise<void> {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('uninstall_customskinloader', { versionId });
    } catch (e) {
      console.error('Uninstall CustomSkinLoader failed:', e);
      throw e;
    }
  },
};

// Export the API directly - we handle fallbacks inside each method
export const launcher = launcherApi;

// Export types
export type { AuthAccount, XboxFriend };
