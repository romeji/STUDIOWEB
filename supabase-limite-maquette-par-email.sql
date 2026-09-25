-- Une demande de maquette par adresse e-mail sur 30 jours.
-- La base ne stocke qu'un HMAC de l'adresse, pas une seconde copie du courriel.

create table if not exists public.brief_email_demo_limits (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  brief_id uuid not null,
  reserved_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists brief_email_demo_limits_expiry_idx
  on public.brief_email_demo_limits (completed_at, reserved_at);

alter table public.brief_email_demo_limits enable row level security;
revoke all on table public.brief_email_demo_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.brief_email_demo_limits to service_role;

create or replace function public.reserve_brief_email_demo(p_email_hash text, p_brief_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare reserved boolean;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' or p_brief_id is null then
    raise exception 'Invalid demo reservation';
  end if;

  delete from public.brief_email_demo_limits
  where (completed_at is not null and completed_at < now() - interval '60 days')
     or (completed_at is null and reserved_at < now() - interval '15 minutes');

  insert into public.brief_email_demo_limits (email_hash, brief_id, reserved_at, completed_at)
  values (p_email_hash, p_brief_id, now(), null)
  on conflict (email_hash) do update
    set brief_id = excluded.brief_id, reserved_at = excluded.reserved_at, completed_at = null
    where (public.brief_email_demo_limits.completed_at is not null
           and public.brief_email_demo_limits.completed_at <= now() - interval '30 days')
       or (public.brief_email_demo_limits.completed_at is null
           and public.brief_email_demo_limits.reserved_at <= now() - interval '15 minutes')
  returning true into reserved;

  return coalesce(reserved, false);
end;
$$;

create or replace function public.finalize_brief_email_demo(p_email_hash text, p_brief_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.brief_email_demo_limits
  set completed_at = now()
  where email_hash = p_email_hash and brief_id = p_brief_id and completed_at is null;
  return found;
end;
$$;

create or replace function public.release_brief_email_demo(p_email_hash text, p_brief_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.brief_email_demo_limits
  where email_hash = p_email_hash and brief_id = p_brief_id and completed_at is null;
  return found;
end;
$$;

revoke all on function public.reserve_brief_email_demo(text, uuid) from public, anon, authenticated;
revoke all on function public.finalize_brief_email_demo(text, uuid) from public, anon, authenticated;
revoke all on function public.release_brief_email_demo(text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_brief_email_demo(text, uuid) to service_role;
grant execute on function public.finalize_brief_email_demo(text, uuid) to service_role;
grant execute on function public.release_brief_email_demo(text, uuid) to service_role;
