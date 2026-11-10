-- New Supabase projects no longer grant table access to API roles by default.
-- Grant only what the app needs; RLS policies in 0001 still decide which rows.
grant select, update on public.profiles to authenticated;
