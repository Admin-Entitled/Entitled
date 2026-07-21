-- Login/auth performance indexes
-- Safe to run multiple times.

-- Member login lookup by phone
create unique index if not exists idx_members_phone
  on public.members (phone);

-- Member access token lookup/update
create unique index if not exists idx_access_sessions_token
  on public.access_sessions (token);

-- Admin session lookup
create unique index if not exists idx_admin_sessions_token
  on public.admin_sessions (token);

-- Admin login lookup by phone
create unique index if not exists idx_admin_users_phone
  on public.admin_users (phone);
