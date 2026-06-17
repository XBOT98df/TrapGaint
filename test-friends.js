// Test script to check friends system
const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";

async function testFriends() {
  console.log('=== Testing Friends System ===\n');
  
  // Check friends table
  console.log('1. Checking friends table...');
  const friendsResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/friends?select=*`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    }
  );
  
  if (friendsResponse.ok) {
    const friends = await friendsResponse.json();
    console.log(`   Found ${friends.length} friend entries:`);
    friends.forEach(f => {
      console.log(`   - ${f.user_oder_id} → ${f.friend_oder_id} (${f.status})`);
    });
  } else {
    console.log('   ❌ Error:', await friendsResponse.text());
  }
  
  // Check user_status table
  console.log('\n2. Checking user_status table...');
  const statusResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/user_status?select=*`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    }
  );
  
  if (statusResponse.ok) {
    const statuses = await statusResponse.json();
    console.log(`   Found ${statuses.length} user statuses:`);
    statuses.forEach(s => {
      console.log(`   - ${s.username} (${s.oder_id}): ${s.is_online ? 'Online' : 'Offline'}`);
    });
  } else {
    console.log('   ❌ Error:', await statusResponse.text());
  }
  
  console.log('\n=== Test Complete ===');
}

testFriends().catch(console.error);
