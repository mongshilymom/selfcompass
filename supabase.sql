-- Enable extensions
create extension if not exists pgcrypto;

-- 1) events table
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  occurred_at timestamptz not null default now(),
  type text not null,
  minutes numeric,
  payload jsonb
);

-- 2) RLS
alter table public.events enable row level security;
create policy if not exists events_insert_own on public.events
  for insert to public
  with check (auth.uid() is not null);

-- (Optional) read for MVP; tighten later
create policy if not exists events_read_all on public.events
  for select using (true);

-- 3) 7-day stats RPC
create or replace function public.stats_last_7_days()
returns table (day date, quiz_complete int, share_click int, purchase_success int)
language sql
security definer
as $$
  with days as (
    select generate_series((now() - interval '6 days')::date, now()::date, interval '1 day')::date as day
  ), agg as (
    select date_trunc('day', occurred_at)::date as day,
           sum(case when type = 'quiz_complete' then 1 else 0 end) as qc,
           sum(case when type = 'share_click' then 1 else 0 end) as sc,
           sum(case when type = 'purchase_success' then 1 else 0 end) as ps
    from public.events
    where occurred_at >= now() - interval '7 days'
    group by 1
  )
  select d.day,
         coalesce(a.qc,0)::int as quiz_complete,
         coalesce(a.sc,0)::int as share_click,
         coalesce(a.ps,0)::int as purchase_success
  from days d left join agg a using(day)
  order by d.day;
$$;

grant execute on function public.stats_last_7_days to anon;
