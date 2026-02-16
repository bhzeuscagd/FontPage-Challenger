-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES (Public profile data, linked to auth.users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  username text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- USER SETTINGS (Preferences)
create table public.user_settings (
  user_id uuid references public.profiles(id) primary key,
  theme text default 'system', -- 'light', 'dark', 'system'
  layout_mode text default 'list', -- 'list', 'cards', 'magazine'
  refresh_interval integer default 60, -- minutes
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- FEEDS (Source of truth for RSS feeds)
create table public.feeds (
  id uuid default uuid_generate_v4() primary key,
  url text unique not null,
  title text,
  description text,
  site_url text,
  icon_url text,
  last_fetched_at timestamp with time zone,
  error_count integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- FEED ITEMS (The actual content)
create table public.feed_items (
  id uuid default uuid_generate_v4() primary key,
  feed_id uuid references public.feeds(id) on delete cascade not null,
  guid text not null, -- Unique ID from the feed item
  url text not null,
  title text not null,
  description text,
  content text, -- Full content if available
  author text,
  image_url text,
  published_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(feed_id, guid)
);

-- CATEGORIES (User specific organization)
create table public.categories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  sort_order integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, name)
);

-- SUBSCRIPTIONS (User -> Feed relationship)
create table public.feed_subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  feed_id uuid references public.feeds(id) on delete cascade not null,
  category_id uuid references public.categories(id) on delete set null,
  custom_title text, -- User can rename the feed
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, feed_id)
);

-- USER ITEM STATES (Read/Unread, Bookmarks)
create table public.user_item_states (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  item_id uuid references public.feed_items(id) on delete cascade not null,
  is_read boolean default false,
  is_saved boolean default false, -- Bookmark
  read_at timestamp with time zone,
  saved_at timestamp with time zone,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, item_id)
);

-- SECURITY POLICIES (RLS)

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.feeds enable row level security;
alter table public.feed_items enable row level security;
alter table public.categories enable row level security;
alter table public.feed_subscriptions enable row level security;
alter table public.user_item_states enable row level security;

-- Profiles: Users can see their own profile
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Feeds: Everyone can read feeds (public data)
create policy "Feeds are viewable by everyone" on public.feeds
  for select using (true);
-- Only service role can insert/update feeds (backend worker) - for now allow authenticated users to insert if the feed doesn't exist
create policy "Authenticated users can insert feeds" on public.feeds
  for insert with check (auth.role() = 'authenticated');

-- Feed Items: Everyone can read items
create policy "Items are viewable by everyone" on public.feed_items
  for select using (true);

-- Subscriptions: Users can CRUD their own subscriptions
create policy "Users manage their own subscriptions" on public.feed_subscriptions
  for all using (auth.uid() = user_id);

-- Categories: Users manage their own categories
create policy "Users manage their own categories" on public.categories
  for all using (auth.uid() = user_id);

-- Item States: Users manage their own read/saved state
create policy "Users manage their own item states" on public.user_item_states
  for all using (auth.uid() = user_id);

-- User Settings: Users manage their own settings
create policy "Users manage their own settings" on public.user_settings
  for all using (auth.uid() = user_id);

-- FUNCTIONS & TRIGGERS

-- Automatically create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  insert into public.user_settings (user_id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
