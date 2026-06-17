import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Types
export interface Friend {
  id: string;
  user_oder_id: string;
  friend_oder_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
}

export interface UserStatus {
  oder_id: string;
  username: string;
  is_online: boolean;
  current_game: string | null;
  game_version?: string | null;
  loader?: string | null;
  server_ip?: string | null;
  server_port?: number | null;
  world_name?: string | null;
  last_seen: string;
  updated_at: string;
  bio?: string | null;
  banner_url?: string | null;
  avatar_url?: string | null;
}

export interface FriendWithStatus extends Friend {
  friend_username?: string;
  friend_status?: UserStatus;
}

// Flattened friend data for UI display
export interface FriendDisplay {
  oder_id: string;
  username: string;
  is_online: boolean;
  game_version: string | null;
  loader: string | null;
  server_ip: string | null;
  server_port: number | null;
  world_name: string | null;
  last_seen: string;
  bio: string | null;
  banner_url: string | null;
  avatar_url: string | null;
  status: 'pending' | 'accepted' | 'blocked';
}
