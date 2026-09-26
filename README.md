# Memory Kraft backend foundation

This storefront now includes a Supabase schema, RLS policies, storage policy definitions, and reusable browser data-access modules. It does not include an admin UI yet.

## Configure Supabase

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; never expose the service-role key in Vite.
3. Run `supabase/migrations/202608170001_initial_ecommerce.sql` in the Supabase SQL editor or through the Supabase CLI.
4. Run `supabase/seed.sql` to migrate the six existing static catalogue entries as drafts. Add stock and set an item to `active` only when ready for customer visibility.
5. Create an owner account with Supabase Auth, then promote it once from the SQL editor: `update public.profiles set role = 'admin' where id = '<auth-user-uuid>';`.

The migration creates `product-images` (public) and `customer-personalization` (private) storage buckets. RLS is enabled on every application table. Customer personalization files are limited to their authenticated user folder; admins can access all files.

## Verification status

`npm run build` verifies the frontend and modules compile. Live Supabase connection, migrations, RLS, Auth, Storage, and CRUD require real project credentials and have not been claimed as verified without them.

## Admin panel (v2)

The admin lives in `admin/` (its own pages, served at `/admin`; open it from the shop with **⌘⇧O** on Mac or **Ctrl+Shift+O** on Windows). Sign in with a Supabase Auth account whose `profiles.role` is `admin`.

- **Data:** every screen talks to Supabase through `admin/static/data/supabase-api.js`, using the signed-in admin's session, so row-level security (`is_admin()`) still decides what can be read or changed.
- **Before first use:** run `supabase/migrations/202609270001_v2_admin.sql` in the Supabase SQL editor. It only adds things: `orders.email` (needed for status emails), subcategories on `categories`, the two customization order statuses, product flags, review "featured", customization tracking on `order_items`, and the `order_events`, `store_settings` and `site_content` tables.
- **Photos:** product, category and site images go to Supabase Storage (`product-images`), as before. Customer photos saved on a personalised item go to Cloudinary through `api/admin/upload-photo.js` (admin-only), using the existing `server/cloudinary.js`.
- **Payments:** Razorpay checkout is unchanged. Online orders arrive already paid; the admin can record payments taken outside the website and mark refunds (the refund itself is done in the Razorpay dashboard).
- **Status emails:** changing an order's status calls the existing `api/orders/notify-status`.
