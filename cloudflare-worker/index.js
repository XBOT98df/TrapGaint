/**
 * Cloudflare Worker for Xbox Live Friend Request Notifications
 * 
 * When user X sends a friend request to user Y:
 * 1. X's client calls this worker with Y's XUID
 * 2. Worker stores the pending request in KV
 * 3. When Y's client polls, worker returns pending requests
 * 4. Y sees notification to follow X back
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // POST /friend-request - Send a friend request notification
      if (path === '/friend-request' && request.method === 'POST') {
        const { sender_xuid, sender_gamertag, receiver_xuid } = await request.json();

        if (!sender_xuid || !sender_gamertag || !receiver_xuid) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Store pending request in KV
        // Key: receiver_xuid, Value: array of pending requests
        const existingKey = `pending_${receiver_xuid}`;
        const existing = await env.FRIEND_REQUESTS.get(existingKey, { type: 'json' }) || [];
        
        // Check if request already exists
        const alreadyExists = existing.some(req => req.sender_xuid === sender_xuid);
        if (!alreadyExists) {
          existing.push({
            sender_xuid,
            sender_gamertag,
            timestamp: Date.now(),
          });
          
          // Store with 7 day expiration
          await env.FRIEND_REQUESTS.put(existingKey, JSON.stringify(existing), {
            expirationTtl: 604800, // 7 days
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // GET /friend-requests/:xuid - Get pending friend requests for a user
      if (path.startsWith('/friend-requests/') && request.method === 'GET') {
        const xuid = path.split('/')[2];
        
        if (!xuid) {
          return new Response(JSON.stringify({ error: 'XUID required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const key = `pending_${xuid}`;
        const pending = await env.FRIEND_REQUESTS.get(key, { type: 'json' }) || [];

        return new Response(JSON.stringify({ requests: pending }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // DELETE /friend-request - Remove a pending request (after accepting/declining)
      if (path === '/friend-request' && request.method === 'DELETE') {
        const { receiver_xuid, sender_xuid } = await request.json();

        if (!receiver_xuid || !sender_xuid) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const key = `pending_${receiver_xuid}`;
        const existing = await env.FRIEND_REQUESTS.get(key, { type: 'json' }) || [];
        
        // Remove the specific request
        const updated = existing.filter(req => req.sender_xuid !== sender_xuid);
        
        if (updated.length > 0) {
          await env.FRIEND_REQUESTS.put(key, JSON.stringify(updated), {
            expirationTtl: 604800,
          });
        } else {
          // Delete the key if no more pending requests
          await env.FRIEND_REQUESTS.delete(key);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
