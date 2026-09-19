-- Root-cause fix: service_role is missing PostgreSQL table-level GRANTs on every table our
-- server-side (service-role) API routes touch except public.products (granted separately in
-- 202609080001_razorpay_service_role_catalog_read.sql). RLS bypass (the service_role Postgres
-- role attribute) and table GRANTs are two independent gates — bypassing RLS does not imply
-- having SELECT/INSERT/UPDATE privileges on the table, exactly as already noted in
-- 202609080001's own comment. Without these grants, every service-role REST call against these
-- tables fails at the database with "permission denied for table <name>", which is swallowed or
-- surfaced differently depending on the caller:
--
--   * api/orders/track.js (findOrderForTracking -> select orders + order_items) surfaced this
--     verbatim to the customer as "Order not found — permission denied for table orders".
--   * api/personalization/upload.js (resolveOrderItem -> select orders, then order_items)
--     failed at its very first query, before the Cloudinary upload step ever ran — so no
--     personalization_assets row was ever written, which is why Admin > Personalization always
--     showed "No photo uploaded" even though Cloudinary credentials work on their own.
--   * api/orders/notify-status.js (requireAdminFromToken -> select profiles; then
--     getOrderForNotification -> select orders embedding customers + order_items) failed before
--     it could send the status-update email; the admin UI only logs this to the browser console
--     (see notifyOrderStatusUpdate in src/lib/supabase/orders.js), so the status change appeared
--     to "just not send an email" with no visible error.
--   * server/razorpay.js's finalizeSupabaseOrder() PATCH of orders.email (the real checkout
--     email, written so status/confirmation emails never use a Razorpay/.invalid placeholder)
--     failed the same way; the failure is caught and only console.error-logged there, so the
--     column was silently never actually being populated in production.
--
-- Order creation itself (the finalize_razorpay_order / create_order RPCs) was unaffected because
-- RPC functions run with their own defined privileges, not the caller's — only the direct
-- service-role REST calls added for tracking, personalization uploads, and email notifications
-- were ever blocked.
--
-- This grants only what each route actually needs (least privilege), and does not touch RLS —
-- service_role already bypasses RLS by role attribute; these are purely the missing base grants.

grant usage on schema public to service_role;

grant select, update on table public.orders to service_role;
grant select on table public.order_items to service_role;
grant select, insert on table public.personalization_assets to service_role;
grant select on table public.customers to service_role;
grant select on table public.profiles to service_role;
