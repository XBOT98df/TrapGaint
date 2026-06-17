/**
 * Real-time Presence & Session Tracking System
 * Tracks player activity, game sessions, and playtime
 */

export interface PlayerSession {
  oderId: string;
  username: string;
  minecraftUuid?: string;
  gameVersion: string;
  loader: 'vanilla' | 'fabric' | 'forge' | 'quilt' | 'lapetus';
  sessionId: string;
  startTime: number;
  lastHeartbeat: number;
  serverIp?: string;
  serverPort?: number;
  worldName?: string;
  isOnline: boolean;
  tier?: 'default' | 'red' | 'blue' | 'purple' | 'gold';
  capeId?: string;
}

export interface PlayerStats {
  oderId: string;
  username: string;
  totalPlaytime: number; // in seconds
  lastSeen: number;
  favoriteVersion?: string;
  favoriteLoader?: string;
  sessionsCount: number;
  averageSessionLength: number; // in seconds
}

export interface FriendSuggestion {
  oderId: string;
  username: string;
  minecraftUuid?: string;
  reason: 'similar_version' | 'similar_playtime' | 'recently_active' | 'mutual_friends';
  score: number;
  commonVersion?: string;
  isOnline: boolean;
  lastSeen: number;
}

class PresenceManager {
  private sessions: Map<string, PlayerSession> = new Map();
  private stats: Map<string, PlayerStats> = new Map();
  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute

  constructor() {
    // Periodically clean up stale sessions
    setInterval(() => this.cleanupStaleSessions(), this.CLEANUP_INTERVAL);
  }

  /**
   * Start or update a player session
   */
  updateSession(session: Omit<PlayerSession, 'lastHeartbeat' | 'isOnline'>): PlayerSession {
    const existingSession = this.sessions.get(session.oderId);
    
    const updatedSession: PlayerSession = {
      ...session,
      lastHeartbeat: Date.now(),
      isOnline: true,
      startTime: existingSession?.startTime || session.startTime || Date.now(),
    };

    this.sessions.set(session.oderId, updatedSession);
    this.updateStats(session.oderId, session.username);
    
    return updatedSession;
  }

  /**
   * Send heartbeat to keep session alive
   */
  heartbeat(oderId: string): boolean {
    const session = this.sessions.get(oderId);
    if (!session) return false;

    session.lastHeartbeat = Date.now();
    session.isOnline = true;
    this.sessions.set(oderId, session);
    
    return true;
  }

  /**
   * End a player session
   */
  endSession(oderId: string): void {
    const session = this.sessions.get(oderId);
    if (!session) return;

    // Calculate session duration and update stats
    const duration = Math.floor((Date.now() - session.startTime) / 1000);
    this.updatePlaytime(oderId, duration);

    session.isOnline = false;
    this.sessions.set(oderId, session);
  }

  /**
   * Get current session for a player
   */
  getSession(oderId: string): PlayerSession | null {
    return this.sessions.get(oderId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): PlayerSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isOnline);
  }

  /**
   * Get sessions by game version
   */
  getSessionsByVersion(version: string): PlayerSession[] {
    return this.getActiveSessions().filter(s => s.gameVersion === version);
  }

  /**
   * Get sessions by loader type
   */
  getSessionsByLoader(loader: string): PlayerSession[] {
    return this.getActiveSessions().filter(s => s.loader === loader);
  }

  /**
   * Update player statistics
   */
  private updateStats(oderId: string, username: string): void {
    const stats = this.stats.get(oderId) || {
      oderId,
      username,
      totalPlaytime: 0,
      lastSeen: Date.now(),
      sessionsCount: 0,
      averageSessionLength: 0,
    };

    stats.lastSeen = Date.now();
    this.stats.set(oderId, stats);
  }

  /**
   * Update playtime statistics
   */
  private updatePlaytime(oderId: string, sessionDuration: number): void {
    const stats = this.stats.get(oderId);
    if (!stats) return;

    stats.totalPlaytime += sessionDuration;
    stats.sessionsCount += 1;
    stats.averageSessionLength = Math.floor(stats.totalPlaytime / stats.sessionsCount);
    stats.lastSeen = Date.now();

    this.stats.set(oderId, stats);
  }

  /**
   * Get player statistics
   */
  getStats(oderId: string): PlayerStats | null {
    return this.stats.get(oderId) || null;
  }

  /**
   * Get all player statistics
   */
  getAllStats(): PlayerStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Clean up stale sessions (no heartbeat for > 30 seconds)
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    
    for (const [oderId, session] of this.sessions.entries()) {
      if (session.isOnline && now - session.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
        console.log(`[Presence] Session timeout for ${session.username}`);
        this.endSession(oderId);
      }
    }
  }

  /**
   * Generate friend suggestions based on activity patterns
   */
  async getFriendSuggestions(
    oderId: string,
    currentFriendIds: string[],
    limit: number = 10
  ): Promise<FriendSuggestion[]> {
    const currentSession = this.sessions.get(oderId);
    const currentStats = this.stats.get(oderId);
    
    const suggestions: FriendSuggestion[] = [];
    const excludeIds = new Set([oderId, ...currentFriendIds]);

    // Get all other players
    for (const [otherOderId, otherSession] of this.sessions.entries()) {
      if (excludeIds.has(otherOderId)) continue;

      const otherStats = this.stats.get(otherOderId);
      let score = 0;
      let reason: FriendSuggestion['reason'] = 'recently_active';
      let commonVersion: string | undefined;

      // Score based on same game version
      if (currentSession && otherSession.gameVersion === currentSession.gameVersion) {
        score += 50;
        reason = 'similar_version';
        commonVersion = otherSession.gameVersion;
      }

      // Score based on same loader
      if (currentSession && otherSession.loader === currentSession.loader) {
        score += 30;
      }

      // Score based on similar playtime
      if (currentStats && otherStats) {
        const playtimeDiff = Math.abs(currentStats.totalPlaytime - otherStats.totalPlaytime);
        const maxPlaytime = Math.max(currentStats.totalPlaytime, otherStats.totalPlaytime);
        
        if (maxPlaytime > 0) {
          const similarity = 1 - (playtimeDiff / maxPlaytime);
          score += similarity * 20;
          
          if (similarity > 0.7) {
            reason = 'similar_playtime';
          }
        }
      }

      // Boost score for currently online players
      if (otherSession.isOnline) {
        score += 40;
      }

      // Boost score for recently active players
      if (otherStats) {
        const hoursSinceLastSeen = (Date.now() - otherStats.lastSeen) / (1000 * 60 * 60);
        if (hoursSinceLastSeen < 24) {
          score += 20 * (1 - hoursSinceLastSeen / 24);
          reason = 'recently_active';
        }
      }

      if (score > 0) {
        suggestions.push({
          oderId: otherOderId,
          username: otherSession.username,
          minecraftUuid: otherSession.minecraftUuid,
          reason,
          score,
          commonVersion,
          isOnline: otherSession.isOnline,
          lastSeen: otherStats?.lastSeen || Date.now(),
        });
      }
    }

    // Sort by score and return top suggestions
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Format playtime for display
   */
  formatPlaytime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get current session duration
   */
  getCurrentSessionDuration(oderId: string): number {
    const session = this.sessions.get(oderId);
    if (!session || !session.isOnline) return 0;
    
    return Math.floor((Date.now() - session.startTime) / 1000);
  }
}

// Singleton instance
export const presenceManager = new PresenceManager();
