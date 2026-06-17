// Real-time Authentication & Session Management

const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";

export interface AuthSession {
  oderId: string;
  username: string;
  minecraftUuid: string;
  isOffline: boolean;
  loginTime: number;
  lastActivity: number;
}

class AuthManager {
  private currentSession: AuthSession | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 15000; // 15 seconds

  /**
   * Login with username and password (for offline accounts)
   */
  async loginOffline(username: string, password: string): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
    try {
      // Hash password
      const passwordHash = await this.hashPassword(password);

      // Verify credentials in Supabase
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/cracked_accounts?username=eq.${username}&password_hash=eq.${passwordHash}&is_active=eq.true`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          }
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Failed to verify credentials' };
      }

      const accounts = await response.json();
      
      if (accounts.length === 0) {
        return { success: false, error: 'Invalid username or password' };
      }

      const account = accounts[0];

      // Create session
      const session: AuthSession = {
        oderId: account.oder_id,
        username: account.username,
        minecraftUuid: account.minecraft_uuid,
        isOffline: true,
        loginTime: Date.now(),
        lastActivity: Date.now(),
      };

      // Store session
      this.currentSession = session;
      this.saveSessionToStorage(session);

      // Update last_login in Supabase
      await fetch(`${SUPABASE_URL}/rest/v1/cracked_accounts?id=eq.${account.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last_login: new Date().toISOString()
        })
      });

      // Update user's last_seen in users table
      await fetch(`${SUPABASE_URL}/rest/v1/users?oder_id=eq.${account.oder_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last_seen: new Date().toISOString()
        })
      });

      // Start heartbeat
      this.startHeartbeat();

      return { success: true, session };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login' };
    }
  }

  /**
   * Login with Microsoft account (online mode)
   */
  async loginOnline(username: string, uuid: string, oderId: string): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
    try {
      const session: AuthSession = {
        oderId,
        username,
        minecraftUuid: uuid,
        isOffline: false,
        loginTime: Date.now(),
        lastActivity: Date.now(),
      };

      this.currentSession = session;
      this.saveSessionToStorage(session);

      // Update user's last_seen in users table
      await fetch(`${SUPABASE_URL}/rest/v1/users?oder_id=eq.${oderId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last_seen: new Date().toISOString()
        })
      });

      // Start heartbeat
      this.startHeartbeat();

      return { success: true, session };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login' };
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    if (!this.currentSession) return;

    // Stop heartbeat
    this.stopHeartbeat();

    // Update last_seen in Supabase
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/users?oder_id=eq.${this.currentSession.oderId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last_seen: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Error updating last_seen:', error);
    }

    // Clear session
    this.currentSession = null;
    this.clearSessionFromStorage();
  }

  /**
   * Get current session
   */
  getCurrentSession(): AuthSession | null {
    if (!this.currentSession) {
      // Try to restore from storage
      this.currentSession = this.loadSessionFromStorage();
    }
    return this.currentSession;
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    return this.getCurrentSession() !== null;
  }

  /**
   * Start sending heartbeats to keep session alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      if (!this.currentSession) {
        this.stopHeartbeat();
        return;
      }

      this.currentSession.lastActivity = Date.now();
      this.saveSessionToStorage(this.currentSession);

      // Update last_seen in Supabase
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/users?oder_id=eq.${this.currentSession.oderId}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            last_seen: new Date().toISOString()
          })
        });
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Save session to localStorage
   */
  private saveSessionToStorage(session: AuthSession): void {
    localStorage.setItem('dragon_session', JSON.stringify(session));
    localStorage.setItem('dragon_oder_id', session.oderId);
    localStorage.setItem('dragon_username', session.username);
    
    // Also save to legacy keys for compatibility
    localStorage.setItem('lapetus_oder_id', session.oderId);
    localStorage.setItem('lapetus_username', session.username);
  }

  /**
   * Load session from localStorage
   */
  private loadSessionFromStorage(): AuthSession | null {
    try {
      const sessionData = localStorage.getItem('dragon_session');
      if (!sessionData) {
        console.log('[Auth] No session data found in storage');
        return null;
      }

      const session = JSON.parse(sessionData) as AuthSession;
      console.log('[Auth] Loaded session from storage:', session.username, 'Age:', Math.floor((Date.now() - session.loginTime) / 1000 / 60), 'minutes');
      
      // Check if session is still valid (not older than 7 days)
      const sessionAge = Date.now() - session.loginTime;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      if (sessionAge > maxAge) {
        console.log('[Auth] Session expired (older than 7 days), clearing');
        this.clearSessionFromStorage();
        return null;
      }

      // Restart heartbeat if session is valid
      console.log('[Auth] Session valid, starting heartbeat');
      this.startHeartbeat();

      return session;
    } catch (error) {
      console.error('[Auth] Error loading session:', error);
      return null;
    }
  }

  /**
   * Clear session from localStorage
   */
  private clearSessionFromStorage(): void {
    localStorage.removeItem('dragon_session');
    localStorage.removeItem('lapetus_session'); // Also clear the lapetus session
    // DON'T remove oder_id and username - they should persist across sessions
    // This allows friends list and other features to work even after logout
    // localStorage.removeItem('dragon_oder_id');
    // localStorage.removeItem('dragon_username');
    // localStorage.removeItem('lapetus_oder_id');
    // localStorage.removeItem('lapetus_username');
  }

  /**
   * Hash password using SHA-256
   */
  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }
}

// Singleton instance
export const authManager = new AuthManager();

// Auto-restore session on page load
if (typeof window !== 'undefined') {
  authManager.getCurrentSession();
}
