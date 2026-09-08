alter table public.products
  add column if not exists category text
    check (category is null or char_length(btrim(category)) between 1 and 80),
  add column if not exists size text
    check (size is null or char_length(btrim(size)) between 1 and 40),
  add column if not exists selling_price numeric(14,2)
    check (selling_price is null or selling_price >= 0);
