-- Story 3.1 / AD-10: the `job` table owned by the `jobs` module, and the only
-- functions that change it. Forward-only (AD-12).
--
-- Every state change runs inside one of the jobs_* functions below and uses the
-- database clock (`now()`), never the worker's. The functions are security
-- definer so the service role itself has only `select` on the table: nothing,
-- not even the server, can update a job row except through them.
--
-- Lifecycle: queued -> running (claim) -> succeeded (finish)
--                                      -> queued    (retryable fail, or release on shutdown)
--                                      -> failed    (permanent fail, last attempt, or an
--                                                    expired lease on the last attempt)
-- The lease (`locked_until` while running) only detects a crashed worker; the
-- worker renews it every minute, so it is never a time limit (NFR4). While
-- queued, `locked_until` is the retry backoff: the job is not claimable before it.

create table public.job (
  id uuid primary key default gen_random_uuid(),
  -- Must list exactly JOB_KINDS in jobs/domain/job.ts.
  kind text not null check (kind in ('generate', 'export', 'rendition')),
  -- The case, asset or revision the job works on. No foreign key: the subject
  -- table depends on the kind.
  subject_id uuid not null,
  input_hash text not null check (char_length(input_hash) between 1 and 256),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  -- Must list exactly JOB_STATUSES in jobs/domain/job.ts.
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  locked_until timestamptz null,
  -- `{ code, message }` of the latest failed attempt.
  error jsonb null check (
    error is null
    -- coalesce: a missing key makes the test NULL, which a check would accept.
    or coalesce(
      jsonb_typeof(error) = 'object'
      and jsonb_typeof(error -> 'code') = 'string'
      and jsonb_typeof(error -> 'message') = 'string'
      -- JOB_ERROR_CODE_MAX and JOB_ERROR_MESSAGE_MAX in jobs/domain/job.ts.
      and char_length(error ->> 'code') between 1 and 64
      and char_length(error ->> 'message') <= 1000,
      false
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz null,
  constraint job_attempts_within_max check (attempts <= max_attempts),
  constraint job_running_has_lease check (status <> 'running' or locked_until is not null),
  constraint job_finished_at_iff_done check ((status in ('succeeded', 'failed')) = (finished_at is not null))
);

-- Idempotent enqueue: at most one live (queued or running) job per input.
create unique index job_live_input_key
  on public.job (kind, subject_id, input_hash)
  where status in ('queued', 'running');

-- Claim scans live jobs oldest first.
create index job_live_by_age on public.job (created_at, id) where status in ('queued', 'running');

-- getJobsFor(subjectId), newest first.
create index job_subject_newest on public.job (subject_id, created_at desc);

-- Backstop: the browser never queries tables (AD-11). RLS on with no policies
-- denies anon and authenticated. The service role may only read; writes go
-- through the functions below.
alter table public.job enable row level security;
revoke all on table public.job from public, anon, authenticated, service_role;
grant select on table public.job to service_role;

-- Enqueues a job, or returns the live job with the same (kind, subject, input
-- hash). Safe under concurrency: a parallel insert of the same triple waits
-- for the other transaction and then returns its row. Retries when the live
-- row finishes between the insert and the read.
create function public.jobs_enqueue(
  p_kind text,
  p_subject_id uuid,
  p_input_hash text,
  p_payload jsonb
)
returns setof public.job
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.job;
begin
  for i in 1..5 loop
    insert into public.job (kind, subject_id, input_hash, payload)
    values (p_kind, p_subject_id, p_input_hash, coalesce(p_payload, '{}'::jsonb))
    on conflict (kind, subject_id, input_hash) where status in ('queued', 'running') do nothing
    returning * into j;
    if found then
      return next j;
      return;
    end if;

    select * into j
      from public.job
     where kind = p_kind
       and subject_id = p_subject_id
       and input_hash = p_input_hash
       and status in ('queued', 'running');
    if found then
      return next j;
      return;
    end if;
  end loop;
  raise exception 'jobs_enqueue: the live job kept finishing, gave up';
end;
$$;

-- Claims at most one job of `p_kinds` for the calling worker, returning it.
-- First, an expired `running` job on its last attempt is marked `failed`
-- (`LEASE_EXPIRED`) and returned, so the worker emits `job_failed` and no case
-- stays stuck. Otherwise the oldest job that is `queued` with no future
-- backoff, or `running` with an expired lease and attempts left, becomes
-- `running` with `attempts + 1` and a 10-minute lease (JOB_LEASE_MS). Kinds
-- outside `p_kinds` are never touched.
create function public.jobs_claim(p_kinds text[])
returns setof public.job
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.job;
begin
  update public.job
     set status = 'failed',
         locked_until = null,
         finished_at = now(),
         updated_at = now(),
         error = jsonb_build_object('code', 'LEASE_EXPIRED', 'message', 'The worker stopped during the last attempt.')
   where id = (
     select id
       from public.job
      where status = 'running'
        and kind = any (p_kinds)
        and locked_until <= now()
        and attempts >= max_attempts
      order by locked_until, id
      limit 1
      for update skip locked
   )
  returning * into j;
  if found then
    return next j;
    return;
  end if;

  update public.job
     set status = 'running',
         attempts = attempts + 1,
         locked_until = now() + interval '10 minutes',
         updated_at = now()
   where id = (
     select id
       from public.job
      where kind = any (p_kinds)
        and (
          (status = 'queued' and (locked_until is null or locked_until <= now()))
          or (status = 'running' and locked_until <= now() and attempts < max_attempts)
        )
      order by created_at, id
      limit 1
      for update skip locked
   )
  returning * into j;
  if found then
    return next j;
  end if;
  return;
end;
$$;

-- The calls below are fenced on (id, attempts) with status `running`: they
-- act only for the worker holding the current attempt. False / no row means
-- the lease was lost (reclaimed, failed or released), and nothing is written.

-- Extends the lease by 10 minutes from now.
create function public.jobs_renew(p_id uuid, p_attempts integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job
     set locked_until = now() + interval '10 minutes',
         updated_at = now()
   where id = p_id and attempts = p_attempts and status = 'running';
  return found;
end;
$$;

-- Marks the job `succeeded` and clears the lease.
create function public.jobs_finish(p_id uuid, p_attempts integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job
     set status = 'succeeded',
         locked_until = null,
         error = null,
         finished_at = now(),
         updated_at = now()
   where id = p_id and attempts = p_attempts and status = 'running';
  return found;
end;
$$;

-- Records a failed attempt's `{ code, message }`. When `p_retryable` and
-- attempts are left, the job goes back to `queued` and is claimable again
-- `p_retry_after` milliseconds from now; otherwise it is `failed`. Returns the
-- updated job (the caller emits `job_failed` when it is `failed`), or no row
-- when the lease was lost.
create function public.jobs_fail(
  p_id uuid,
  p_attempts integer,
  p_error jsonb,
  p_retry_after integer,
  p_retryable boolean
)
returns setof public.job
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.job;
begin
  update public.job
     set status = case when p_retryable and attempts < max_attempts then 'queued' else 'failed' end,
         locked_until = case
           when p_retryable and attempts < max_attempts
             then now() + greatest(p_retry_after, 0) * interval '1 millisecond'
           else null
         end,
         finished_at = case when p_retryable and attempts < max_attempts then null else now() end,
         error = p_error,
         updated_at = now()
   where id = p_id and attempts = p_attempts and status = 'running'
  returning * into j;
  if found then
    return next j;
  end if;
  return;
end;
$$;

-- Gives an unfinished job back on shutdown: `queued`, claimable at once, and
-- the attempt is returned (`attempts - 1`).
create function public.jobs_release(p_id uuid, p_attempts integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job
     set status = 'queued',
         attempts = attempts - 1,
         locked_until = null,
         updated_at = now()
   where id = p_id and attempts = p_attempts and status = 'running';
  return found;
end;
$$;

revoke all on function public.jobs_enqueue(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.jobs_claim(text[]) from public, anon, authenticated;
revoke all on function public.jobs_renew(uuid, integer) from public, anon, authenticated;
revoke all on function public.jobs_finish(uuid, integer) from public, anon, authenticated;
revoke all on function public.jobs_fail(uuid, integer, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.jobs_release(uuid, integer) from public, anon, authenticated;

grant execute on function public.jobs_enqueue(text, uuid, text, jsonb) to service_role;
grant execute on function public.jobs_claim(text[]) to service_role;
grant execute on function public.jobs_renew(uuid, integer) to service_role;
grant execute on function public.jobs_finish(uuid, integer) to service_role;
grant execute on function public.jobs_fail(uuid, integer, jsonb, integer, boolean) to service_role;
grant execute on function public.jobs_release(uuid, integer) to service_role;
