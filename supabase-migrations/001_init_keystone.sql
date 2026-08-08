-- EmbyrKeystone — initial schema
-- Run this in the Supabase SQL editor. Best-effort, not verified against a live schema yet —
-- run it, then verify each table with a follow-up `select * from <table> limit 1;`.

-- ─────────────────────────────────────────────────────────────────────────
-- accounts
-- One row per EmbyrKeystone account, 1:1 with a Supabase Auth user (auth.users).
-- Supabase Auth owns the credential (password hash, email) — this table only holds
-- the EmbyrLabs-specific profile/licensing/role fields.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists accounts (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  username           text not null unique,
  email              text not null,
  created_at         timestamptz not null default now(),
  last_login         timestamptz,
  email_verified     boolean not null default false,

  products_owned     text[] not null default '{}',

  role               text not null default 'user'
                        check (role in ('user','moderator','developer','beta_tester')),
  permissions        jsonb not null default '{}'::jsonb,

  status             text not null default 'active'
                        check (status in ('active','suspended','banned','deleted')),
  suspension_reason  text,
  suspended_by       text,
  suspended_until    timestamptz,

  pin_hash           text,
  pin_updated_at     timestamptz,

  hardware_ids       jsonb not null default '[]'::jsonb,
  ip_last_known      text,

  notes              text,

  billing_email      text,
  payment_method_ref text,
  subscription_status text
);

-- ─────────────────────────────────────────────────────────────────────────
-- spark_codes
-- Every field from the Spark Code spec. code is the primary key and the literal
-- string, e.g. SPRK-ATL-XXX-XXX-XXX.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists spark_codes (
  code                 text primary key,
  product              text not null check (product in ('atlas','veridia')),
  status               text not null default 'active'
                          check (status in ('active','claimed','revoked','expired')),

  generation_method    text not null check (generation_method in ('manual','purchase','trial')),
  author               text,                       -- username, or null for N/A (checkout/auto-issued)
  generation_time      timestamptz not null default now(),

  claimed_by           uuid references accounts(user_id),
  claimed_time         timestamptz,

  is_trial             boolean not null default false,
  trial_duration_days  int,
  trial_start_date     timestamptz,
  trial_expiry_date    timestamptz,
  trial_converted       boolean not null default false,
  converted_order_id    text,

  revoked_by            text,
  revoked_time           timestamptz,
  revoked_reason         text
                          check (revoked_reason is null or revoked_reason in
                            ('refund','chargeback','abuse','trial_expired','manual','other')),

  order_id              text,
  purchase_platform     text,
  price_paid             numeric,
  currency               text,

  license_tier           text,
  platform                text,

  expiration_date         timestamptz,   -- null = perpetual

  hardware_id             text,
  ip_address_at_claim     text,
  redemption_attempts     int not null default 0,

  notes                   text,
  support_ticket_id       text
);

create index if not exists spark_codes_claimed_by_idx on spark_codes(claimed_by);
create index if not exists spark_codes_status_idx on spark_codes(status);

-- ─────────────────────────────────────────────────────────────────────────
-- sessions
-- Device/session tracking, surfaced on the Account page's "active sessions" list.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists sessions (
  session_id       uuid primary key default gen_random_uuid(),
  user_id          uuid not null references accounts(user_id) on delete cascade,
  device_name      text,
  ip_address       text,
  created_at       timestamptz not null default now(),
  last_active_at   timestamptz not null default now(),
  revoked          boolean not null default false
);

create index if not exists sessions_user_id_idx on sessions(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
--
-- Lesson learned from a prior project: RLS policies combine permissively (OR), so a
-- broad "users can update their own row" policy plus a narrower "developers can update
-- role" policy does NOT restrict non-developers from also matching the broad one and
-- writing to `role` themselves. The simplest correct fix is to grant NO update/insert/
-- delete policies to the `authenticated` role at all — every write to these tables goes
-- through this backend using the Supabase service_role key, which bypasses RLS entirely.
-- Clients can only ever read their own row.
-- ─────────────────────────────────────────────────────────────────────────
alter table accounts enable row level security;
alter table spark_codes enable row level security;
alter table sessions enable row level security;

create policy "accounts_select_own" on accounts
  for select using (auth.uid() = user_id);

create policy "spark_codes_select_own" on spark_codes
  for select using (auth.uid() = claimed_by);

create policy "sessions_select_own" on sessions
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies are defined for `authenticated` or `anon` on any of
-- these three tables — intentional. All writes happen server-side via this backend's
-- service_role key.
