/**
 * WebSocket Server for Real-time Updates
 * Handles real-time cosmetics changes, online users, and tier updates
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { storage, type CosmeticsUpdateEvent } from './storage';
import { presenceManager } from './presence';

interface WSClient {
  ws: WebSocket;
  uuid?: string;
  username?: string;
  subscriptions: Set<string>;
}

class RealtimeServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, WSClient> = new Map();
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  initialize(httpServer: Server): void {
    this.wss = new WebSocketServer({ 
      server: httpServer,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket] New client connected');
      
      const client: WSClient = {
        ws,
        subscriptions: new Set()
      };
      
      this.clients.set(ws, client);

      // Send welcome message
      this.send(ws, {
        type: 'connected',
        timestamp: Date.now()
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (e) {
          console.error('[WebSocket] Invalid message:', e);
        }
      });

      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Client error:', error);
        this.clients.delete(ws);
      });
    });

    // Setup cosmetics update listener
    storage.onCosmeticsUpdate((event) => {
      this.broadcastCosmeticsUpdate(event);
    });

    // Periodic online users broadcast
    setInterval(() => {
      this.broadcastOnlineUsers();
    }, 5000); // Every 5 seconds

    // Heartbeat to keep connections alive
    setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);

    console.log('[WebSocket] Server initialized on /ws');
  }

  private handleMessage(ws: WebSocket, message: any): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'identify':
        client.uuid = message.uuid;
        client.username = message.username;
        console.log(`[WebSocket] Client identified: ${message.username} (${message.uuid})`);
        break;

      case 'subscribe':
        if (Array.isArray(message.channels)) {
          message.channels.forEach((channel: string) => {
            client.subscriptions.add(channel);
          });
          console.log(`[WebSocket] Client subscribed to: ${message.channels.join(', ')}`);
        }
        break;

      case 'unsubscribe':
        if (Array.isArray(message.channels)) {
          message.channels.forEach((channel: string) => {
            client.subscriptions.delete(channel);
          });
        }
        break;

      case 'ping':
        this.send(ws, { type: 'pong', timestamp: Date.now() });
        break;

      case 'request_online_users':
        this.sendOnlineUsers(ws);
        break;

      default:
        console.warn('[WebSocket] Unknown message type:', message.type);
    }
  }

  private send(ws: WebSocket, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private broadcast(data: any, channel?: string): void {
    const message = JSON.stringify(data);
    
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        // If channel specified, only send to subscribed clients
        if (!channel || client.subscriptions.has(channel)) {
          client.ws.send(message);
        }
      }
    });
  }

  private broadcastCosmeticsUpdate(event: CosmeticsUpdateEvent): void {
    console.log(`[WebSocket] Broadcasting cosmetics update: ${event.type} for ${event.username}`);
    
    this.broadcast({
      type: 'cosmetics_update',
      event
    }, 'cosmetics');
  }

  private async broadcastOnlineUsers(): Promise<void> {
    const sessions = presenceManager.getActiveSessions();
    
    // Enhance with cosmetics data
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
          tier: cosmetics?.tier || session.tier || 'default',
          capeId: cosmetics?.capeId || session.capeId,
          worldName: session.worldName,
          isOnline: session.isOnline
        };
      })
    );

    this.broadcast({
      type: 'online_users',
      count: sessions.length,
      users,
      timestamp: Date.now()
    }, 'presence');
  }

  private async sendOnlineUsers(ws: WebSocket): Promise<void> {
    const sessions = presenceManager.getActiveSessions();
    
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
          tier: cosmetics?.tier || session.tier || 'default',
          capeId: cosmetics?.capeId || session.capeId,
          worldName: session.worldName,
          isOnline: session.isOnline
        };
      })
    );

    this.send(ws, {
      type: 'online_users',
      count: sessions.length,
      users,
      timestamp: Date.now()
    });
  }

  private sendHeartbeat(): void {
    this.broadcast({
      type: 'heartbeat',
      timestamp: Date.now()
    });
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

export const realtimeServer = new RealtimeServer();
