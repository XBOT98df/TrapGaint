-- Create cracked_accounts table
CREATE TABLE IF NOT EXISTS public.cracked_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    oder_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT DEFAULT '',
    minecraft_uuid TEXT NOT NULL,
    skin_username TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_cracked_accounts_username ON public.cracked_accounts(username);
CREATE INDEX IF NOT EXISTS idx_cracked_accounts_oder_id ON public.cracked_accounts(oder_id);

-- Enable Row Level Security
ALTER TABLE public.cracked_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public access (for anon key)
CREATE POLICY "Allow public read access" ON public.cracked_accounts
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON public.cracked_accounts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access" ON public.cracked_accounts
    FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access" ON public.cracked_accounts
    FOR DELETE USING (true);

-- Create users table (for friends system)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    oder_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    minecraft_uuid TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on oder_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_oder_id ON public.users(oder_id);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Allow public read access" ON public.users
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON public.users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access" ON public.users
    FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access" ON public.users
    FOR DELETE USING (true);
