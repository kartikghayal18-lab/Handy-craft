-- The Razorpay serverless checkout prices carts with the service-role key.
-- RLS bypass does not grant the underlying schema/table privileges.
grant usage on schema public to service_role;
grant select on table public.products to service_role;
