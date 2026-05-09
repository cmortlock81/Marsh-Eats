create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type user_role as enum ('customer','restaurant_owner','restaurant_staff','admin','support');
exception when duplicate_object then null; end $$;
do $$ begin
  create type restaurant_status as enum ('draft','pending_review','active','suspended','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type fulfilment_type as enum ('delivery','collection');
exception when duplicate_object then null; end $$;
do $$ begin
  create type order_status as enum ('pending_payment','paid','sent_to_restaurant','accepted','preparing','ready','completed','cancelled','refunded','failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type payment_status as enum ('requires_payment_method','requires_confirmation','processing','succeeded','failed','cancelled','refunded','partially_refunded');
exception when duplicate_object then null; end $$;

create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_code char(2) not null default 'GB',
  postcode_prefixes text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  phone text,
  password_hash text not null,
  full_name text not null,
  role user_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  label text not null,
  line1 text not null,
  line2 text,
  town text not null,
  county text,
  postcode text not null,
  country_code char(2) not null default 'GB',
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id),
  region_id uuid references regions(id),
  name text not null,
  slug text not null unique,
  status restaurant_status not null default 'draft',
  cuisine_types text[] not null default '{}',
  description text,
  phone text,
  email citext,
  address_line1 text not null,
  address_line2 text,
  town text not null,
  county text,
  postcode text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  minimum_order_pence integer not null default 0 check (minimum_order_pence >= 0),
  collection_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  is_accepting_orders boolean not null default false,
  stripe_connect_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists restaurant_staff_members (
  restaurant_id uuid not null references restaurants(id),
  user_id uuid not null references users(id),
  role user_role not null check (role in ('restaurant_owner','restaurant_staff')),
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);

create table if not exists restaurant_opening_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  unique (restaurant_id, day_of_week)
);

create table if not exists menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references menus(id),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references menu_categories(id),
  name text not null,
  description text,
  price_pence integer not null check (price_pence >= 0),
  allergens text[] not null default '{}',
  modifiers jsonb not null default '[]',
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references users(id),
  restaurant_id uuid not null references restaurants(id),
  fulfilment_type fulfilment_type not null,
  delivery_address_id uuid references user_addresses(id),
  status order_status not null default 'pending_payment',
  subtotal_pence integer not null check (subtotal_pence >= 0),
  delivery_fee_pence integer not null default 0 check (delivery_fee_pence >= 0),
  total_pence integer not null check (total_pence >= 0),
  commission_pence integer not null check (commission_pence >= 0),
  rnli_contribution_pence integer not null check (rnli_contribution_pence >= 0),
  restaurant_payable_pence integer not null check (restaurant_payable_pence >= 0),
  currency char(3) not null default 'GBP',
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  item_name_snapshot text not null,
  unit_price_pence_snapshot integer not null check (unit_price_pence_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  allergens_snapshot jsonb not null default '[]',
  modifiers_snapshot jsonb not null default '[]',
  line_total_pence integer not null check (line_total_pence >= 0)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  provider text not null default 'stripe',
  provider_payment_intent_id text not null unique,
  provider_charge_id text,
  status payment_status not null,
  amount_pence integer not null check (amount_pence >= 0),
  currency char(3) not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rnli_contributions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id),
  amount_pence integer not null check (amount_pence >= 0),
  currency char(3) not null default 'GBP',
  reported_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  actor_type text not null,
  actor_user_id uuid references users(id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token text not null unique,
  platform text not null check (platform in ('web','ios','android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  ip_address inet,
  created_at timestamptz not null default now()
);

create table if not exists idempotency_keys (
  key text primary key,
  scope text not null,
  response_body jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index if not exists idx_restaurants_discovery on restaurants (status, is_accepting_orders, town) where deleted_at is null;
create index if not exists idx_restaurants_region on restaurants (region_id, status) where deleted_at is null;
create index if not exists idx_orders_customer_history on orders (customer_id, created_at desc) where deleted_at is null;
create index if not exists idx_orders_restaurant_active on orders (restaurant_id, status, created_at) where status in ('paid','sent_to_restaurant','accepted','preparing','ready');
create index if not exists idx_orders_lookup on orders (restaurant_id, created_at desc);
create index if not exists idx_payments_order on payments (order_id);
create index if not exists idx_rnli_reporting on rnli_contributions (created_at, reported_at);
create index if not exists idx_audit_entity on audit_log (entity_type, entity_id, created_at desc);
create index if not exists idx_notification_tokens_user on notification_tokens (user_id) where revoked_at is null;
