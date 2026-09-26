-- =====================================================================================
-- v2 admin panel: the database additions the new admin UI needs.
--
-- Everything here is ADDITIVE and safe to re-run:
--   * new columns have defaults (or are nullable), so existing rows and every existing
--     insert — including finalize_razorpay_order, which creates paid orders — keep working
--     unchanged;
--   * two new order_status values are appended; no existing value is renamed or removed;
--   * new tables are admin-only (RLS + is_admin()), except website content, which the shop
--     may read.
-- Nothing touches the Razorpay payment flow, product photo storage, or Cloudinary.
-- =====================================================================================

-- ---------- 1. orders.email --------------------------------------------------------------
-- The customer's checkout email. server/razorpay.js already writes it after payment, and
-- api/orders/notify-status.js reads it to send status emails — but the column was never
-- created on the live database (202609181300 wasn't applied), so both silently failed.
alter table public.orders add column if not exists email text;

-- ---------- 2. Order statuses: the two customization steps ------------------------------
-- Existing: pending, confirmed, preparing, ready, shipped, delivered, cancelled, refunded.
alter type public.order_status add value if not exists 'customization_pending' after 'confirmed';
alter type public.order_status add value if not exists 'customization_received' after 'customization_pending';

-- ---------- 3. Categories → main categories with subcategories ---------------------------
-- e.g. Occasions › Anniversary. One level deep. Products keep using product_categories and
-- can sit in any number of categories/subcategories.
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete cascade,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists categories_parent_idx on public.categories(parent_id, sort_order);

create or replace function public.categories_one_level() returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'A category cannot be inside itself.'; end if;
    if exists (select 1 from public.categories where id = new.parent_id and parent_id is not null) then
      raise exception 'Subcategories cannot have their own subcategories.';
    end if;
    if exists (select 1 from public.categories where parent_id = new.id) then
      raise exception 'This category has subcategories, so it has to stay a main category.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists categories_one_level on public.categories;
create trigger categories_one_level before insert or update on public.categories
  for each row execute function public.categories_one_level();

-- The shop's three ways in. Existing categories are placed under them (their products and
-- names are unchanged); anything else stays a main category, and the admin can move it.
insert into public.categories (name, slug, description, sort_order) values
  ('Shop by Person', 'shop-by-person', 'Choose who it is for, from Mom and Dad to your partner, friends and little ones.', 0),
  ('Occasions', 'occasions', 'Birthdays, anniversaries, festivals and every moment worth celebrating.', 1),
  ('Custom Gifts', 'custom-gifts', 'Your photos, names and words, made into a one-of-a-kind gift by hand.', 2)
on conflict (slug) do nothing;

update public.categories c set parent_id = p.id, sort_order = m.pos
from (values
  ('birthday', 'occasions', 0), ('anniversary', 'occasions', 1), ('love', 'occasions', 2),
  ('raksha-bandhan', 'occasions', 3), ('just-because', 'occasions', 4),
  ('best-friend', 'shop-by-person', 0), ('friendship', 'shop-by-person', 1),
  ('custom', 'custom-gifts', 0)
) as m(child, parent, pos)
join public.categories p on p.slug = m.parent
where c.slug = m.child and c.parent_id is null
  and not exists (select 1 from public.categories k where k.parent_id = c.id);

-- ---------- 4. Product flags -------------------------------------------------------------
alter table public.products
  add column if not exists featured boolean not null default false,
  add column if not exists bestseller boolean not null default false,
  add column if not exists weight text,
  add column if not exists finish text;

-- ---------- 4b. Customer notes (admin only) ---------------------------------------------
alter table public.customers add column if not exists notes text not null default '';

-- ---------- 5. Reviews: featured on the shop --------------------------------------------
alter table public.reviews add column if not exists featured boolean not null default false;

-- ---------- 6. Personalised items: the customization workflow ---------------------------
-- Tracked per order item (only meaningful for personalizable products). Photos the admin
-- saves from WhatsApp are stored as personalization_assets rows (Cloudinary), as before.
alter table public.order_items
  add column if not exists custom_status text,
  add column if not exists photo_status text,
  add column if not exists approval_status text not null default 'pending',
  add column if not exists admin_notes text not null default '',
  add column if not exists custom_updated_at timestamptz;
do $$ begin
  alter table public.order_items add constraint order_items_custom_status_check check (custom_status is null or custom_status in
    ('waiting_for_customer', 'photos_pending', 'photos_received', 'requirements_received', 'design_pending', 'design_approved', 'in_production', 'completed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.order_items add constraint order_items_photo_status_check check (photo_status is null or photo_status in ('not_required', 'pending', 'received'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.order_items add constraint order_items_approval_status_check check (approval_status in ('pending', 'approved', 'changes_requested'));
exception when duplicate_object then null; end $$;

-- ---------- 7. Order timeline -----------------------------------------------------------
-- Written by the admin when it changes an order (status, customization). Order creation and
-- the Razorpay payment are shown from the order's own columns, so checkout writes nothing here.
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null,                       -- status | payment | custom | note
  from_value text,
  to_value text,
  message text not null default '',
  admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events(order_id, created_at);

-- ---------- 8. Store settings and website content ---------------------------------------
create table if not exists public.store_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- 9. Access: admins manage; the shop may read website content ------------------
alter table public.order_events enable row level security;
alter table public.store_settings enable row level security;
alter table public.site_content enable row level security;

grant select, insert, update, delete on public.order_events, public.store_settings, public.site_content to authenticated;
grant select on public.site_content to anon;

do $$
declare t text;
begin
  foreach t in array array['order_events', 'store_settings', 'site_content'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin full access ' || t) then
      execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', 'admin full access ' || t, t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_content' and policyname = 'site content readable') then
    create policy "site content readable" on public.site_content for select to anon, authenticated using (true);
  end if;
end $$;

-- The service role (server API routes) reads orders.email; make sure it may.
grant select, update on public.orders to service_role;
