create table if not exists public.draft_listing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null references public.draft_products(id) on delete cascade,
  store_id uuid,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  image_rights_confirmed boolean not null default false,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  current_step text not null default 'Sırada bekliyor',
  attempts smallint not null default 0 check (attempts between 0 and 3),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 3),
  last_error text,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists draft_listing_jobs_user_created_idx
  on public.draft_listing_jobs (user_id, created_at desc);
create index if not exists draft_listing_jobs_fifo_idx
  on public.draft_listing_jobs (available_at, created_at)
  where status = 'queued';
create unique index if not exists draft_listing_jobs_one_active_per_draft_idx
  on public.draft_listing_jobs (user_id, draft_id)
  where status in ('queued', 'processing');

alter table public.draft_listing_jobs enable row level security;
revoke all on public.draft_listing_jobs from public, anon, authenticated;
grant all on public.draft_listing_jobs to service_role;

create or replace function public.claim_next_draft_listing_job()
returns setof public.draft_listing_jobs
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  -- A transaction-scoped lock plus the processing-row check gives the SaaS
  -- one global FIFO worker even when several web instances wake at once.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('autolister-draft-listing-worker-v1', 0)
  );

  update public.draft_listing_jobs
     set status = 'queued',
         lease_until = null,
         available_at = pg_catalog.now(),
         current_step = 'Önceki işlem kesildi; kuyruk yeniden başlatılıyor.',
         updated_at = pg_catalog.now()
   where status = 'processing'
     and lease_until < pg_catalog.now();

  if exists (
    select 1 from public.draft_listing_jobs
     where status = 'processing'
       and lease_until >= pg_catalog.now()
  ) then
    return;
  end if;

  return query
  with next_job as (
    select id
      from public.draft_listing_jobs
     where status = 'queued'
       and available_at <= pg_catalog.now()
     order by created_at asc, id asc
     for update skip locked
     limit 1
  )
  update public.draft_listing_jobs as job
     set status = 'processing',
         progress = greatest(job.progress, 20),
         current_step = 'Ürün verileri ve kategori hazırlanıyor…',
         attempts = least(job.attempts + 1, job.max_attempts),
         started_at = coalesce(job.started_at, pg_catalog.now()),
         lease_until = pg_catalog.now() + interval '10 minutes',
         updated_at = pg_catalog.now()
    from next_job
   where job.id = next_job.id
  returning job.*;
end;
$function$;

revoke all on function public.claim_next_draft_listing_job() from public, anon, authenticated;
grant execute on function public.claim_next_draft_listing_job() to service_role;
