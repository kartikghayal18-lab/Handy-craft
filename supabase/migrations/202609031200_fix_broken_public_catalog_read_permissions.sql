-- The previous migration (202608200001_public_catalog_read_permissions.sql)
-- intended to grant the anon role table-level SELECT on the storefront
-- catalog tables and add matching "to anon" RLS policies, but its DO block
-- contains a corrupted line ("egenrate public catlogbegin" instead of
-- "begin") that is not valid PL/pgSQL. That syntax error would have failed
-- the whole migration transaction, so none of it — including the
-- `grant select` statements — ever actually took effect.
--
-- Net effect: the anon role (used by the public storefront) may never have
-- had table-level SELECT on product_images (and possibly products/
-- product_categories/categories), so PostgREST requests embedding
-- product_images would be rejected or return empty, even though the
-- existing row-level policies from the initial migration were themselves
-- fine. This migration re-applies the same grants and policies with correct
-- syntax. It does not alter any table/column schema, does not touch
-- Storage buckets or policies, and does not delete or modify any data —
-- every statement is idempotent ("if not exists" / grant, which is safe to
-- re-run).

grant usage on schema public to anon;
grant select on table public.products, public.product_images, public.product_categories, public.categories to anon;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'catalog active products readable'
  ) then
    create policy "catalog active products readable"
      on public.products for select to anon
      using (status = 'active');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_images' and policyname = 'catalog images readable'
  ) then
    create policy "catalog images readable"
      on public.product_images for select to anon
      using (exists (
        select 1 from public.products
        where products.id = product_images.product_id and products.status = 'active'
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_categories' and policyname = 'catalog product categories readable'
  ) then
    create policy "catalog product categories readable"
      on public.product_categories for select to anon
      using (exists (
        select 1 from public.products
        where products.id = product_categories.product_id and products.status = 'active'
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'categories' and policyname = 'catalog active categories readable'
  ) then
    create policy "catalog active categories readable"
      on public.categories for select to anon
      using (status = true);
  end if;
end $$;
