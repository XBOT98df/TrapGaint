import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";

// Player cosmetics data
export interface PlayerCosmetics {
  uuid: string;
  username: string;
  capeId?: string;
  customSkin?: string;
  capeTexture?: string;
  tier?: 'default' | 'red' | 'blue' | 'purple' | 'gold';
  timestamp: number;
}

// Real-time cosmetics update event
export interface CosmeticsUpdateEvent {
  type: 'cape_change' | 'skin_change' | 'tier_change';
  uuid: string;
  username: string;
  capeId?: string;
  tier?: string;
  timestamp: number;
}

// Crash report data
export interface CrashReport {
  reportId: string;
  username: string;
  uuid: string | null;
  versionId: string;
  timestamp: number;
  os: string;
  javaVersion: string | null;
  memoryMax: number;
  crashLog: string;
  gameLog: string;
  systemInfo: Record<string, any>;
  userDescription: string;
  status: string;
  createdAt: string;
}

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Cosmetics methods
  getPlayerCosmetics(uuid: string): Promise<PlayerCosmetics | undefined>;
  setPlayerCosmetics(cosmetics: PlayerCosmetics): Promise<void>;
  getAllPlayerCosmetics(): Promise<PlayerCosmetics[]>;
  
  // Cosmetics update listeners
  onCosmeticsUpdate(callback: (event: CosmeticsUpdateEvent) => void): void;
  
  // Crash report methods
  saveCrashReport(report: CrashReport): Promise<void>;
  getCrashReport(reportId: string): Promise<CrashReport | undefined>;
  getAllCrashReports(): Promise<CrashReport[]>;
  getCrashReportsByUser(username: string): Promise<CrashReport[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private cosmetics: Map<string, PlayerCosmetics>;
  private crashReports: Map<string, CrashReport>;
  private cosmeticsUpdateListeners: Array<(event: CosmeticsUpdateEvent) => void> = [];

  constructor() {
    this.users = new Map();
    this.cosmetics = new Map();
    this.crashReports = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Cosmetics methods
  async getPlayerCosmetics(uuid: string): Promise<PlayerCosmetics | undefined> {
    return this.cosmetics.get(uuid);
  }

  async setPlayerCosmetics(cosmetics: PlayerCosmetics): Promise<void> {
    const oldCosmetics = this.cosmetics.get(cosmetics.uuid);
    this.cosmetics.set(cosmetics.uuid, cosmetics);
    
    // Emit update events for real-time sync
    if (oldCosmetics) {
      if (oldCosmetics.capeId !== cosmetics.capeId) {
        this.emitCosmeticsUpdate({
          type: 'cape_change',
          uuid: cosmetics.uuid,
          username: cosmetics.username,
          capeId: cosmetics.capeId,
          timestamp: Date.now()
        });
      }
      if (oldCosmetics.tier !== cosmetics.tier) {
        this.emitCosmeticsUpdate({
          type: 'tier_change',
          uuid: cosmetics.uuid,
          username: cosmetics.username,
          tier: cosmetics.tier,
          timestamp: Date.now()
        });
      }
    }
  }

  async getAllPlayerCosmetics(): Promise<PlayerCosmetics[]> {
    return Array.from(this.cosmetics.values());
  }
  
  // Cosmetics update listeners
  onCosmeticsUpdate(callback: (event: CosmeticsUpdateEvent) => void): void {
    this.cosmeticsUpdateListeners.push(callback);
  }
  
  private emitCosmeticsUpdate(event: CosmeticsUpdateEvent): void {
    this.cosmeticsUpdateListeners.forEach(listener => {
      try {
        listener(event);
      } catch (e) {
        console.error('[Storage] Error in cosmetics update listener:', e);
      }
    });
  }
  
  // Crash report methods - with file persistence
  private crashReportsDir = './data/crash-reports';
  
  private ensureCrashDir(): void {
    const fs = require('fs');
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }
    if (!fs.existsSync(this.crashReportsDir)) {
      fs.mkdirSync(this.crashReportsDir, { recursive: true });
    }
  }
  
  async saveCrashReport(report: CrashReport): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    
    this.ensureCrashDir();
    
    // Save to memory
    this.crashReports.set(report.reportId, report);
    
    // Save to file for persistence
    const filePath = path.join(this.crashReportsDir, `${report.reportId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    
    // Keep only last 1000 reports in memory
    if (this.crashReports.size > 1000) {
      const oldest = Array.from(this.crashReports.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, this.crashReports.size - 1000);
      oldest.forEach(([key]) => this.crashReports.delete(key));
    }
    
    console.log(`[Storage] Crash report saved: ${filePath}`);
  }
  
  async getCrashReport(reportId: string): Promise<CrashReport | undefined> {
    // Check memory first
    if (this.crashReports.has(reportId)) {
      return this.crashReports.get(reportId);
    }
    
    // Try loading from file
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(this.crashReportsDir, `${reportId}.json`);
    
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const report = JSON.parse(content) as CrashReport;
        this.crashReports.set(reportId, report);
        return report;
      } catch (e) {
        console.error(`[Storage] Failed to load crash report: ${e}`);
      }
    }
    
    return undefined;
  }
  
  async getAllCrashReports(): Promise<CrashReport[]> {
    const fs = require('fs');
    const path = require('path');
    
    this.ensureCrashDir();
    
    // Load all from files
    const files = fs.readdirSync(this.crashReportsDir);
    const reports: CrashReport[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(this.crashReportsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          reports.push(JSON.parse(content) as CrashReport);
        } catch (e) {
          console.error(`[Storage] Failed to load ${file}: ${e}`);
        }
      }
    }
    
    return reports.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  async getCrashReportsByUser(username: string): Promise<CrashReport[]> {
    const allReports = await this.getAllCrashReports();
    return allReports
      .filter(r => r.username.toLowerCase() === username.toLowerCase())
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}

export const storage = new MemStorage();
