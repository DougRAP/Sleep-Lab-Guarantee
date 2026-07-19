-- RAP Sleep Lab Supabase Schema
-- Run this in your Supabase SQL editor after creating the project

create extension if not exists "uuid-ossp";

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  role text check (role in ('customer', 'dealer', 'admin')) default 'customer',
  store_id text,
  phone text,
  created_at timestamptz default now()
);

create table public.stores (
  store_id text primary key,
  name text,
  location text
);

create table public.guarantees (
  id uuid primary key default uuid_generate_v4(),
  trans_id text unique not null,
  store_id text,
  purch_date date not null, -- start date for 90-night calculation
  cust_nam text not null,
  cust_street text,
  cust_street2 text,
  cust_cit text,
  cust_st text,
  cust_zip text,
  cust_email text,
  cust_phone text,
  manufacturer text,
  model_num text,
  prod_retail_price numeric,
  prod_sku text,
  prod_cat text,
  prod_desc text,
  contract_sku text,
  guarantee_number text,
  created_at timestamptz default now()
);

create table public.claims (
  id uuid primary key default uuid_generate_v4(),
  guarantee_id uuid references public.guarantees(id),
  customer_id uuid references public.profiles(id),
  claim_type text check (claim_type in ('comfort_exchange', 'oem_warranty', 'other')) not null,
  status text default 'submitted',
  issue_description text,
  days_since_delivery int,
  condition_sanitary boolean,
  tags_intact boolean,
  protector_used boolean,
  restocking_fee_acknowledged boolean default false,
  fast_inspection_requested boolean default false,
  eligibility_flags jsonb default '[]',
  structured_data jsonb,
  chat_transcript jsonb,
  ra_number text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.photos (
  id uuid primary key default uuid_generate_v4(),
  claim_id uuid references public.claims(id) on delete cascade,
  storage_path text not null,
  angle text not null,
  vision_analysis jsonb,
  created_at timestamptz default now()
);

create table public.claim_notes (
  id uuid primary key default uuid_generate_v4(),
  claim_id uuid references public.claims(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null,
  is_internal boolean default true,
  created_at timestamptz default now()
);

-- Basic RLS can be added later
