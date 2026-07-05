-- Phase 1: Instagram webhook spine (ig_accounts, ig_events)
-- Multi-account from day one — all future rule/conversation tables FK to ig_accounts.

create table if not exists ig_accounts (
  id uuid primary key default gen_random_uuid(),
  ig_user_id text unique not null,
  username text,
  access_token text,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id),
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ig_account_id is nullable — routing to an account may fail (unknown recipient),
-- but the raw event is still stored so nothing is silently dropped.
create table if not exists ig_events (
  id uuid primary key default gen_random_uuid(),
  ig_account_id uuid references ig_accounts(id),
  event_object text,
  event_field text,
  sender_igsid text,
  media_id text,
  raw_payload jsonb not null,
  status text not null default 'received',
  error text,
  created_at timestamptz default now()
);

create index if not exists ig_events_created_at_idx on ig_events(created_at);
create index if not exists ig_events_sender_igsid_idx on ig_events(sender_igsid);
create index if not exists ig_events_status_idx on ig_events(status);

alter table ig_accounts enable row level security;
alter table ig_events enable row level security;

-- Admin-only read access. No public/authenticated-user policies —
-- edge functions use the service role key and bypass RLS entirely.
create policy "Admins can view ig_accounts"
  on ig_accounts
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

create policy "Admins can view ig_events"
  on ig_events
  for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );
