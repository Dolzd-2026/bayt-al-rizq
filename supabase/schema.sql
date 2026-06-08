-- ═══════════════════════════════════════════════════════════
-- BAYT AL-RIZQ V2 — Supabase Schema
-- Private household app. Free tier. No sensitive personal data.
-- RLS is intentionally disabled — all household members share
-- one view of the data via the anon key (read/write for all).
-- Run this entire file in: Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════

-- ── 1. PANTRY ITEMS ─────────────────────────────────────────
create table if not exists brq_items (
  id             bigint primary key generated always as identity,
  name           text not null unique,
  category       text not null default 'dry',
  qty            numeric not null default 0,
  unit           text not null default 'pcs',
  restock_at     numeric not null default 1,
  restock_date   date,
  last_restocked date,
  notes          text default '',
  halal          boolean default true,
  store          text default 'Any Store',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ── 2. Auto-timestamp trigger ────────────────────────────────
create or replace function brq_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger brq_items_updated_at
  before update on brq_items
  for each row execute function brq_set_updated_at();

-- ── 3. FAMILY USERS ─────────────────────────────────────────
create table if not exists brq_users (
  id         text primary key,
  name       text not null,
  emoji      text default '👤',
  role       text not null default 'family',
  color      text default '#C8860A',
  created_at timestamptz default now()
);

-- ── 4. STORES ────────────────────────────────────────────────
create table if not exists brq_stores (
  id         bigint primary key generated always as identity,
  name       text not null unique,
  created_at timestamptz default now()
);

-- ── 5. AUDIT LOG ─────────────────────────────────────────────
-- Permanent record of all changes. Not deletable from the app.
create table if not exists brq_audit (
  id         bigint primary key generated always as identity,
  user_id    text,
  user_name  text not null default 'Unknown',
  action     text not null,
  detail     text default '',
  created_at timestamptz default now()
);

-- ── 6. Audit auto-trim (keep last 1000 rows) ─────────────────
create or replace function brq_trim_audit()
returns trigger language plpgsql as $$
begin
  delete from brq_audit
  where id in (
    select id from brq_audit
    order by created_at asc
    limit greatest(0, (select count(*) from brq_audit) - 1000)
  );
  return new;
end;
$$;

create trigger brq_audit_trim
  after insert on brq_audit
  for each row execute function brq_trim_audit();

-- ── 7. Realtime subscriptions ────────────────────────────────
-- Enables live sync across all household devices
alter publication supabase_realtime add table brq_items;
alter publication supabase_realtime add table brq_stores;
alter publication supabase_realtime add table brq_users;

-- ── 8. Row Level Security ────────────────────────────────────
-- INTENTIONALLY DISABLED: This is a private household app.
-- The anon key is shared only within the household.
-- No sensitive personal data (no passwords, no financial info).
-- Disabling RLS lets all household members read and write freely.
-- This is the correct pattern for a private shared-device app
-- on Supabase's free tier.
alter table brq_items   disable row level security;
alter table brq_users   disable row level security;
alter table brq_stores  disable row level security;
alter table brq_audit   disable row level security;

-- ── 9. Seed: Users ───────────────────────────────────────────
insert into brq_users (id, name, emoji, role, color) values
  ('omod',    'OmoD',       '👑', 'admin',  '#C8860A'),
  ('chef',    'Chef',       '👨‍🍳', 'chef',   '#2E7D5A'),
  ('spouse',  'Spouse',     '🤝', 'family', '#3A7ABF'),
  ('helper',  'House Help', '🏠', 'family', '#8B5E3C')
on conflict (id) do nothing;

-- ── 10. Seed: Stores ─────────────────────────────────────────
insert into brq_stores (name) values
  ('Spar VI'),('Hartleys VI'),('Renee Ikoyi'),('Prince Ebeano Ikeja'),
  ('Old Bakery'),('Bokku'),('Mile 12 Market'),('Ijora Frozen Food Market'),
  ('Mushin Market'),('Online / Delivery'),('Any Store')
on conflict (name) do nothing;

-- ── 11. Seed: 49 Pantry Items ────────────────────────────────
-- Safe to re-run: unique name constraint means duplicates are ignored
insert into brq_items
  (name,category,qty,unit,restock_at,restock_date,last_restocked,notes,halal,store)
values
  ('Long Grain Rice','dry',10,'kg',3,current_date+14,current_date-7,'Basmati preferred',true,'Spar VI'),
  ('Semolina','dry',2,'kg',1,current_date+10,current_date-14,'',true,'Hartleys VI'),
  ('Garri (White)','dry',3,'kg',1,current_date+21,current_date-5,'Ijebu style',true,'Mile 12 Market'),
  ('Garri (Yellow)','dry',1,'kg',0.5,current_date+7,current_date-21,'',true,'Mile 12 Market'),
  ('Black-Eyed Beans','dry',2,'kg',0.5,current_date+30,current_date-3,'',true,'Mile 12 Market'),
  ('Brown Beans','dry',1.5,'kg',0.5,current_date+21,current_date-10,'For moi moi',true,'Mushin Market'),
  ('Spaghetti','dry',4,'packs',1,current_date+28,current_date-4,'',true,'Spar VI'),
  ('Palm Oil','wet',2,'litres',0.5,current_date+21,current_date-8,'Unrefined',true,'Mile 12 Market'),
  ('Groundnut Oil','wet',1,'litres',0.25,current_date+14,current_date-14,'',true,'Hartleys VI'),
  ('Tomato Paste (Canned)','wet',6,'cans',2,current_date+21,current_date-2,'Gino brand',true,'Spar VI'),
  ('Coconut Milk','wet',3,'cans',1,current_date+30,current_date-10,'',true,'Renee Ikoyi'),
  ('Chicken (Whole)','frozen',3,'pcs',1,current_date+7,current_date-3,'Halal certified',true,'Ijora Frozen Food Market'),
  ('Beef (Stew Cut)','frozen',2,'kg',0.5,current_date+10,current_date-5,'Halal butcher',true,'Ijora Frozen Food Market'),
  ('Prawns','frozen',1,'kg',0.25,current_date+14,current_date-12,'',true,'Ijora Frozen Food Market'),
  ('Goat Meat','frozen',1.5,'kg',0.5,current_date+7,current_date-7,'Halal butcher',true,'Mushin Market'),
  ('Oats','cereal',1,'kg',0.5,current_date+14,current_date-10,'Rolled oats',true,'Hartleys VI'),
  ('Millet Flour','cereal',1,'kg',0.25,current_date+21,current_date-6,'For fura',true,'Mile 12 Market'),
  ('Corn Flour','cereal',0.5,'kg',0.25,current_date+7,current_date-20,'',true,'Spar VI'),
  ('Eggs','protein',18,'pcs',6,current_date+5,current_date-5,'Free-range',true,'Hartleys VI'),
  ('Canned Sardines','protein',4,'cans',2,current_date+60,current_date-1,'In tomato sauce',true,'Spar VI'),
  ('Dried Fish (Titus)','protein',0.5,'kg',0.1,current_date+14,current_date-9,'Stock fish',true,'Mile 12 Market'),
  ('Salt (Table)','staples',1,'kg',0.25,current_date+60,current_date-20,'',true,'Any Store'),
  ('Sugar','staples',2,'kg',0.5,current_date+21,current_date-7,'',true,'Spar VI'),
  ('Maggi Cubes','staples',20,'pcs',5,current_date+14,current_date-4,'',true,'Any Store'),
  ('Chicken Stock Cubes','staples',10,'pcs',3,current_date+21,current_date-10,'Halal certified',true,'Hartleys VI'),
  ('Tomatoes','produce',10,'pcs',4,current_date+5,current_date-2,'Fresh',true,'Mile 12 Market'),
  ('Onions','produce',8,'pcs',3,current_date+7,current_date-3,'Red & white',true,'Mile 12 Market'),
  ('Scotch Bonnet Peppers','produce',15,'pcs',5,current_date+5,current_date-1,'Ata rodo',true,'Mile 12 Market'),
  ('Ginger','produce',3,'pcs',1,current_date+10,current_date-4,'Fresh root',true,'Mile 12 Market'),
  ('Garlic','produce',2,'pcs',1,current_date+10,current_date-4,'Bulbs',true,'Renee Ikoyi'),
  ('Plantain','produce',4,'pcs',2,current_date+4,current_date-2,'Ripe & unripe mix',true,'Mile 12 Market'),
  ('Peak Milk (Canned)','dairy',6,'cans',2,current_date+21,current_date-5,'',true,'Spar VI'),
  ('Yoghurt (Plain)','dairy',2,'pcs',1,current_date+5,current_date-3,'Halal certified',true,'Hartleys VI'),
  ('Green Tea','snacks',1,'boxes',1,current_date+21,current_date-10,'Lipton green',true,'Renee Ikoyi'),
  ('Milo','snacks',1,'kg',0.25,current_date+14,current_date-7,'',true,'Spar VI'),
  ('Suya Spice Mix','spices',3,'packs',1,current_date+30,current_date-8,'Yaji blend',true,'Mushin Market'),
  ('Curry Powder','spices',2,'packs',1,current_date+30,current_date-12,'',true,'Spar VI'),
  ('Thyme','spices',2,'packs',1,current_date+30,current_date-9,'',true,'Any Store'),
  ('Iru (Locust Beans)','spices',2,'packs',1,current_date+21,current_date-6,'',true,'Mile 12 Market'),
  ('All-Purpose Flour','bakery',2,'kg',0.5,current_date+14,current_date-7,'',true,'Spar VI'),
  ('Toothpaste','hygiene',2,'pcs',1,current_date+30,current_date-15,'Fluoride-free',false,'Hartleys VI'),
  ('Shampoo','hygiene',1,'bottles',1,current_date+21,current_date-21,'',false,'Renee Ikoyi'),
  ('Body Wash','hygiene',2,'bottles',1,current_date+30,current_date-10,'',false,'Spar VI'),
  ('Deodorant','hygiene',1,'pcs',1,current_date+14,current_date-21,'Alcohol-free',false,'Renee Ikoyi'),
  ('Dish Soap','household',2,'bottles',1,current_date+21,current_date-7,'',false,'Spar VI'),
  ('Laundry Detergent','household',1,'kg',0.5,current_date+21,current_date-10,'',false,'Prince Ebeano Ikeja'),
  ('Toilet Paper','household',6,'rolls',2,current_date+14,current_date-5,'',false,'Spar VI'),
  ('Vitamin C (1000mg)','supplements',30,'pcs',10,current_date+21,current_date-9,'',false,'Old Bakery'),
  ('Iron Supplements','supplements',20,'pcs',10,current_date+14,current_date-16,'Doctor recommended',false,'Old Bakery')
on conflict (name) do nothing;
