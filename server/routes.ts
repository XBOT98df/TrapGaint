import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type PlayerCosmetics } from "./storage";
import { presenceManager, type PlayerSession } from "./presence";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ==================== COSMETICS API ====================
  
  /**
   * Upload player cosmetics
   * POST /api/cosmetics/upload
   * Body: { uuid, username, capeId?, customSkin?, tier?, timestamp }
   */
  app.post("/api/cosmetics/upload", async (req, res) => {
    try {
      const { uuid, username, capeId, customSkin, tier, timestamp } = req.body;
      
      if (!uuid || !username) {
        return res.status(400).json({ error: "Missing uuid or username" });
      }
      
      const cosmetics: PlayerCosmetics = {
        uuid,
        username,
        capeId: capeId || undefined,
        customSkin: customSkin || undefined,
        tier: tier || 'default',
        timestamp: timestamp || Date.now(),
      };
      
      await storage.setPlayerCosmetics(cosmetics);
      
      console.log(`[Cosmetics] Uploaded cosmetics for ${username} (${uuid}) - Cape: ${capeId || 'none'}, Tier: ${tier || 'default'}`);
      
      return res.json({ success: true, message: "Cosmetics uploaded" });
    } catch (error) {
      console.error("[Cosmetics] Upload error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get player cosmetics by UUID
   * GET /api/cosmetics/player/:uuid
   */
  app.get("/api/cosmetics/player/:uuid", async (req, res) => {
    try {
      const { uuid } = req.params;
      
      const cosmetics = await storage.getPlayerCosmetics(uuid);
      
      if (!cosmetics) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      return res.json(cosmetics);
    } catch (error) {
      console.error("[Cosmetics] Get player error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get all players with cosmetics (for debugging/admin)
   * GET /api/cosmetics/players
   */
  app.get("/api/cosmetics/players", async (req, res) => {
    try {
      const allCosmetics = await storage.getAllPlayerCosmetics();
      return res.json({ players: allCosmetics, count: allCosmetics.length });
    } catch (error) {
      console.error("[Cosmetics] Get all players error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Batch get multiple players' cosmetics
   * POST /api/cosmetics/batch
   * Body: { uuids: string[] }
   */
  app.post("/api/cosmetics/batch", async (req, res) => {
    try {
      const { uuids } = req.body;
      
      if (!Array.isArray(uuids)) {
        return res.status(400).json({ error: "uuids must be an array" });
      }
      
      const results: Record<string, PlayerCosmetics | null> = {};
      
      for (const uuid of uuids) {
        const cosmetics = await storage.getPlayerCosmetics(uuid);
        results[uuid] = cosmetics || null;
      }
      
      return res.json({ players: results });
    } catch (error) {
      console.error("[Cosmetics] Batch get error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Health check endpoint
   * GET /api/cosmetics/health
   */
  app.get("/api/cosmetics/health", (req, res) => {
    return res.json({ status: "ok", timestamp: Date.now() });
  });

  // ==================== PRESENCE & SESSION API ====================
  
  /**
   * Start or update a player session
   * POST /api/presence/session
   * Body: { oderId, username, minecraftUuid?, gameVersion, loader, sessionId, serverIp?, serverPort?, worldName?, tier?, capeId? }
   */
  app.post("/api/presence/session", async (req, res) => {
    try {
      const { oderId, username, minecraftUuid, gameVersion, loader, sessionId, serverIp, serverPort, worldName, tier, capeId } = req.body;
      
      if (!oderId || !username || !gameVersion || !loader || !sessionId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const session = presenceManager.updateSession({
        oderId,
        username,
        minecraftUuid,
        gameVersion,
        loader,
        sessionId,
        startTime: Date.now(),
        serverIp,
        serverPort,
        worldName,
        tier: tier || 'default',
        capeId
      });
      
      console.log(`[Presence] Session started/updated for ${username} - ${gameVersion} (${loader}) - Tier: ${tier || 'default'}`);
      
      return res.json({ success: true, session });
    } catch (error) {
      console.error("[Presence] Session update error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Send heartbeat to keep session alive
   * POST /api/presence/heartbeat
   * Body: { oderId }
   */
  app.post("/api/presence/heartbeat", async (req, res) => {
    try {
      const { oderId } = req.body;
      
      if (!oderId) {
        return res.status(400).json({ error: "Missing oderId" });
      }
      
      const success = presenceManager.heartbeat(oderId);
      
      if (!success) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      return res.json({ success: true });
    } catch (error) {
      console.error("[Presence] Heartbeat error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * End a player session
   * POST /api/presence/end
   * Body: { oderId }
   */
  app.post("/api/presence/end", async (req, res) => {
    try {
      const { oderId } = req.body;
      
      if (!oderId) {
        return res.status(400).json({ error: "Missing oderId" });
      }
      
      presenceManager.endSession(oderId);
      
      console.log(`[Presence] Session ended for ${oderId}`);
      
      return res.json({ success: true });
    } catch (error) {
      console.error("[Presence] End session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get current session for a player
   * GET /api/presence/session/:oderId
   */
  app.get("/api/presence/session/:oderId", async (req, res) => {
    try {
      const { oderId } = req.params;
      const session = presenceManager.getSession(oderId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      const duration = presenceManager.getCurrentSessionDuration(oderId);
      
      return res.json({ 
        session,
        currentDuration: duration,
        formattedDuration: presenceManager.formatPlaytime(duration)
      });
    } catch (error) {
      console.error("[Presence] Get session error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get all active sessions
   * GET /api/presence/active
   */
  app.get("/api/presence/active", async (req, res) => {
    try {
      const sessions = presenceManager.getActiveSessions();
      
      // Enhance with cosmetics data
      const enhancedSessions = await Promise.all(
        sessions.map(async (session) => {
          if (session.minecraftUuid) {
            const cosmetics = await storage.getPlayerCosmetics(session.minecraftUuid);
            return {
              ...session,
              tier: cosmetics?.tier || 'default',
              capeId: cosmetics?.capeId
            };
          }
          return session;
        })
      );
      
      return res.json({ sessions: enhancedSessions, count: enhancedSessions.length });
    } catch (error) {
      console.error("[Presence] Get active sessions error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get real-time online users count and list
   * GET /api/presence/online
   */
  app.get("/api/presence/online", async (req, res) => {
    try {
      const sessions = presenceManager.getActiveSessions();
      
      // Group by version and loader
      const byVersion: Record<string, number> = {};
      const byLoader: Record<string, number> = {};
      
      sessions.forEach(session => {
        byVersion[session.gameVersion] = (byVersion[session.gameVersion] || 0) + 1;
        byLoader[session.loader] = (byLoader[session.loader] || 0) + 1;
      });
      
      // Get enhanced user list with cosmetics
      const users = await Promise.all(
        sessions.map(async (session) => {
          let cosmetics = null;
          if (session.minecraftUuid) {
            cosmetics = await storage.getPlayerCosmetics(session.minecraftUuid);
          }
          
          return {
            username: session.username,
            uuid: session.minecraftUuid,
            gameVersion: session.gameVersion,
            loader: session.loader,
            tier: cosmetics?.tier || 'default',
            capeId: cosmetics?.capeId,
            worldName: session.worldName,
            isOnline: session.isOnline
          };
        })
      );
      
      return res.json({ 
        count: sessions.length,
        users,
        byVersion,
        byLoader,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("[Presence] Get online users error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get player statistics
   * GET /api/presence/stats/:oderId
   */
  app.get("/api/presence/stats/:oderId", async (req, res) => {
    try {
      const { oderId } = req.params;
      const stats = presenceManager.getStats(oderId);
      
      if (!stats) {
        return res.status(404).json({ error: "Stats not found" });
      }
      
      return res.json({ 
        stats,
        formattedPlaytime: presenceManager.formatPlaytime(stats.totalPlaytime),
        formattedAvgSession: presenceManager.formatPlaytime(stats.averageSessionLength)
      });
    } catch (error) {
      console.error("[Presence] Get stats error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get friend suggestions
   * GET /api/presence/suggestions/:oderId
   * Query: ?friendIds=id1,id2,id3&limit=10
   */
  app.get("/api/presence/suggestions/:oderId", async (req, res) => {
    try {
      const { oderId } = req.params;
      const friendIds = req.query.friendIds ? String(req.query.friendIds).split(',') : [];
      const limit = req.query.limit ? parseInt(String(req.query.limit)) : 10;
      
      const suggestions = await presenceManager.getFriendSuggestions(oderId, friendIds, limit);
      
      return res.json({ suggestions, count: suggestions.length });
    } catch (error) {
      console.error("[Presence] Get suggestions error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get sessions by game version
   * GET /api/presence/version/:version
   */
  app.get("/api/presence/version/:version", async (req, res) => {
    try {
      const { version } = req.params;
      const sessions = presenceManager.getSessionsByVersion(version);
      return res.json({ sessions, count: sessions.length });
    } catch (error) {
      console.error("[Presence] Get sessions by version error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get sessions by loader type
   * GET /api/presence/loader/:loader
   */
  app.get("/api/presence/loader/:loader", async (req, res) => {
    try {
      const { loader } = req.params;
      const sessions = presenceManager.getSessionsByLoader(loader);
      return res.json({ sessions, count: sessions.length });
    } catch (error) {
      console.error("[Presence] Get sessions by loader error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== CRASH REPORTS API ====================
  
  /**
   * Submit a crash report
   * POST /api/crash-reports/submit
   * Body: { 
   *   reportId: string,
   *   username: string,
   *   uuid?: string,
   *   versionId: string,
   *   timestamp: number,
   *   os: string,
   *   javaVersion?: string,
   *   memoryMax: number,
   *   crashLog: string,
   *   gameLog: string,
   *   systemInfo?: object,
   *   userDescription?: string
   * }
   */
  app.post("/api/crash-reports/submit", async (req, res) => {
    try {
      const { 
        reportId, 
        username, 
        uuid, 
        versionId, 
        timestamp, 
        os, 
        javaVersion,
        memoryMax,
        crashLog, 
        gameLog,
        systemInfo,
        userDescription
      } = req.body;
      
      if (!reportId || !versionId || !crashLog) {
        return res.status(400).json({ error: "Missing required fields: reportId, versionId, crashLog" });
      }
      
      const report = {
        reportId,
        username: username || "Unknown",
        uuid: uuid || null,
        versionId,
        timestamp: timestamp || Date.now(),
        os: os || "Unknown",
        javaVersion: javaVersion || null,
        memoryMax: memoryMax || 0,
        crashLog,
        gameLog: gameLog || "",
        systemInfo: systemInfo || {},
        userDescription: userDescription || "",
        status: "new",
        createdAt: new Date().toISOString()
      };
      
      // Store crash report
      await storage.saveCrashReport(report);
      
      console.log(`[CrashReport] Received crash report ${reportId} from ${username} (${versionId})`);
      console.log(`[CrashReport] Crash log length: ${crashLog.length} chars, Game log length: ${(gameLog || "").length} chars`);
      
      return res.json({ 
        success: true, 
        message: "Crash report submitted successfully",
        reportId 
      });
    } catch (error) {
      console.error("[CrashReport] Submit error:", error);
      return res.status(500).json({ error: "Failed to submit crash report" });
    }
  });
  
  /**
   * Get all crash reports (admin)
   * GET /api/crash-reports
   */
  app.get("/api/crash-reports", async (req, res) => {
    try {
      const reports = await storage.getAllCrashReports();
      return res.json({ reports, count: reports.length });
    } catch (error) {
      console.error("[CrashReport] Get all error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get a specific crash report
   * GET /api/crash-reports/:reportId
   */
  app.get("/api/crash-reports/:reportId", async (req, res) => {
    try {
      const { reportId } = req.params;
      const report = await storage.getCrashReport(reportId);
      
      if (!report) {
        return res.status(404).json({ error: "Crash report not found" });
      }
      
      return res.json(report);
    } catch (error) {
      console.error("[CrashReport] Get report error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  /**
   * Get recent crash reports for a user
   * GET /api/crash-reports/user/:username
   */
  app.get("/api/crash-reports/user/:username", async (req, res) => {
    try {
      const { username } = req.params;
      const reports = await storage.getCrashReportsByUser(username);
      return res.json({ reports, count: reports.length });
    } catch (error) {
      console.error("[CrashReport] Get user reports error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
