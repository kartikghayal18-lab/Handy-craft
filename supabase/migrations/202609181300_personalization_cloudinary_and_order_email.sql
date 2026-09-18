-- Two additive, non-breaking changes. Nothing here alters existing columns, drops constraints,
-- or touches existing rows (they simply get NULL in the new columns), so old orders and old
-- personalization photos keep working exactly as before.

-- 1) orders.email — the customer's real, checkout-validated email, written directly by
--    server/razorpay.js's finalizeSupabaseOrder() right after an order is created. This exists
--    because finalize_razorpay_order (the RPC that actually creates paid orders) lives outside
--    this repo's migrations — it was created directly in Supabase — so its own customer/email
--    linking logic cannot be inspected or safely rewritten here. Rather than trust whatever
--    email that opaque function may have put on the linked customers row (which, for a guest
--    checkout, is not guaranteed to be the address the customer actually typed), the app now
--    always writes the real address directly onto the order it belongs to. Status-update and
--    tracking code should prefer orders.email over customers.email; customers.email remains the
--    fallback for orders placed before this column existed.
alter table public.orders
  add column if not exists email text;

-- 2) Cloudinary-backed personalization photos. storage_path/public_url/original_filename stay
--    as they are (storage_path is NOT NULL) — new uploads populate them with the same values as
--    cloudinary_public_id/original_url for backward compatibility, while cloudinary_public_id/
--    original_url are the columns the app now treats as authoritative. bytes/format are the
--    "required metadata" the task asked for, kept minimal on purpose.
alter table public.personalization_assets
  add column if not exists cloudinary_public_id text,
  add column if not exists original_url text,
  add column if not exists bytes integer,
  add column if not exists format text;

create index if not exists personalization_assets_cloudinary_public_id_idx
  on public.personalization_assets(cloudinary_public_id);
