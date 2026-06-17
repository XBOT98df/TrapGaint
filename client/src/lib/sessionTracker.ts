/**
 * Session Tracker - Automatically tracks game sessions and updates Supabase presence
 */

import { updateUserStatus } from './friendsService';
import {
  endPlaytimeSession,
  startPlaytimeSession,
  touchPlaytimeSession,
} from './playtimeTracker';

class SessionTracker {
  private sessionId: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 15000; // 15 seconds
  private playtimeAccountId: string | null = null;
  private currentSessionData: {
    oderId: string;
    username: string;
    gameVersion: string;
    loader: string;
    serverIp: string | null;
    serverPort: number | null;
    worldName: string | null;
  } | null = null;

  /**
   * Start tracking a game session
   */
  async startSession(params: {
    versionId: string;
    username: string;
    uuid?: string;
    oderId?: string;
  }): Promise<void> {
    try {
      const { versionId, username, uuid, oderId } = params;
      
      // Generate session ID
      this.sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      this.playtimeAccountId = uuid || username;
      startPlaytimeSession(this.playtimeAccountId);
      
      // Determine loader type from version ID
      let loader = 'vanilla';
      let gameVersion = versionId;
      
      if (versionId.startsWith('lapetus-')) {
        loader = 'lapetus';
        gameVersion = versionId.replace('lapetus-', '');
      } else if (versionId.includes('fabric')) {
        loader = 'fabric';
        gameVersion = versionId.split('-fabric')[0];
      } else if (versionId.includes('forge')) {
        loader = 'forge';
        gameVersion = versionId.split('-forge')[0];
      } else if (versionId.includes('quilt')) {
        loader = 'quilt';
        gameVersion = versionId.split('-quilt')[0];
      }
      
      const currentOderId = oderId || localStorage.getItem('lapetus_oder_id');
      
      if (!currentOderId) {
        console.warn('[SessionTracker] No oder_id found, skipping presence updates');
        this.currentSessionData = null;
      } else {
        // Store session data for heartbeats
        this.currentSessionData = {
          oderId: currentOderId,
          username,
          gameVersion,
          loader,
          serverIp: null,
          serverPort: null,
          worldName: null,
        };
      }

      // Send initial update immediately
      await this.sendHeartbeat();
      
      console.log('[SessionTracker] Session started:', this.sessionId, 'Playing:', loader, gameVersion);
      
      // Start heartbeat
      this.startHeartbeat();
    } catch (error) {
      console.error('[SessionTracker] Failed to start session:', error);
    }
  }

  /**
   * End the current session
   */
  async endSession(): Promise<void> {
    if (!this.sessionId && !this.playtimeAccountId) return;

    try {
      console.log('[SessionTracker] Ending session:', this.sessionId);
      
      // CRITICAL: Stop heartbeat FIRST to prevent race conditions
      this.stopHeartbeat();
      
      // Wait a moment to ensure any in-flight heartbeat completes
      await new Promise(resolve => setTimeout(resolve, 100));

      if (this.playtimeAccountId) {
        endPlaytimeSession(this.playtimeAccountId);
      }
      
      if (this.currentSessionData) {
        // Now clear activity - this will be the final update
        await updateUserStatus(
          this.currentSessionData.oderId,
          this.currentSessionData.username,
          true,
          null, // current_game
          null, // server_ip
          null, // game_version
          null, // loader
          null, // server_port
          null  // world_name
        );
      }
      
      console.log('[SessionTracker] ✓ Session ended and activity cleared:', this.sessionId);
    } catch (error) {
      console.error('[SessionTracker] Failed to end session:', error);
    } finally {
      this.sessionId = null;
      this.playtimeAccountId = null;
      this.currentSessionData = null;
      this.stopHeartbeat();
    }
  }

  /**
   * Send heartbeat to Supabase
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    if (this.playtimeAccountId) {
      touchPlaytimeSession(this.playtimeAccountId);
    }

    if (!this.currentSessionData) {
      return;
    }
    
    try {
      const { oderId, username, gameVersion, loader, serverIp, serverPort, worldName } = this.currentSessionData;
      
      // Build current_game string for display
      const currentGame = `${loader} ${gameVersion}`;
      
      await updateUserStatus(
        oderId,
        username,
        true, // is_online
        currentGame,
        serverIp,
        gameVersion,
        loader,
        serverPort,
        worldName
      );
      
      console.log('[SessionTracker] Heartbeat sent:', currentGame);
    } catch (error) {
      console.error('[SessionTracker] Heartbeat failed:', error);
    }
  }

  /**
   * Start sending heartbeats
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing interval
    
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop sending heartbeats
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Check if a session is active
   */
  isActive(): boolean {
    return this.sessionId !== null;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}

// Singleton instance
export const sessionTracker = new SessionTracker();
