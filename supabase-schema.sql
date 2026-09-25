-- Exécuter une seule fois dans Supabase > SQL Editor.
create extension if not exists pgcrypto;

create or replace function public.is_jl_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'lopes.jerome21@gmail.com';
$$;
revoke all on function public.is_jl_admin() from public, anon;
grant execute on function public.is_jl_admin() to authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

create or replace function public.allow_only_jl_admin_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.email, '')) <> 'lopes.jerome21@gmail.com' then
    raise exception 'Inscription non autorisée';
  end if;
  return new;
end;
$$;
revoke all on function public.allow_only_jl_admin_signup() from public, anon, authenticated;
drop trigger if exists jl_admin_only_signup on auth.users;
create trigger jl_admin_only_signup before insert on auth.users for each row execute function public.allow_only_jl_admin_signup();

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(), company_name text not null, contact_name text not null default '',
  contact_email text not null, contact_phone text not null default '', plan_interest text not null default '',
  answers jsonb not null default '{}'::jsonb, generated_prompt text not null default '', generated_site_html text not null default '',
  preview_token_hash text unique, preview_expires_at timestamptz, photo_paths jsonb not null default '[]'::jsonb,
  request_email_sent_at timestamptz, preview_email_sent_at timestamptz, email_last_error text,
  status text not null default 'nouveau' check (status in ('nouveau','en_cours','apercu_envoye','converti','archive')),
  created_at timestamptz not null default now()
);
alter table public.briefs add column if not exists generated_site_html text not null default '';
alter table public.briefs add column if not exists preview_token_hash text unique;
alter table public.briefs add column if not exists preview_expires_at timestamptz;
alter table public.briefs add column if not exists request_email_sent_at timestamptz;
alter table public.briefs add column if not exists preview_email_sent_at timestamptz;
alter table public.briefs add column if not exists email_last_error text;
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(), company_name text not null, contact_name text not null default '',
  contact_email text not null, contact_phone text not null default '', plan text not null default '',
  monthly_price_cents integer not null default 0, subscription_status text not null default 'pending',
  provider text not null default 'manual', provider_subscription_id text, stripe_checkout_session_id text,
  brief_id uuid unique references public.briefs(id) on delete set null,
  started_at date, canceled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.clients add column if not exists brief_id uuid unique references public.briefs(id) on delete set null;
alter table public.clients add column if not exists stripe_checkout_session_id text;
alter table public.clients add column if not exists welcome_email_sent_at timestamptz;
alter table public.clients add column if not exists welcome_email_last_error text;
create table if not exists public.edit_logs (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  description text not null default 'Petite retouche', created_at timestamptz not null default now()
);
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(), company_name text not null, activity text not null default '',
  city text not null default 'Dijon', website text not null default '', email text not null default '',
  phone text not null default '', status text not null default 'a_contacter', notes text not null default '',
  contacted_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.brief_submission_limits (
  ip_hash text not null, hour_bucket timestamptz not null default date_trunc('hour', now()),
  attempts integer not null default 1, primary key (ip_hash, hour_bucket)
);
alter table public.brief_submission_limits enable row level security;

create or replace function public.consume_brief_submission(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_bucket timestamptz := date_trunc('hour', now()); current_attempts integer;
begin
  delete from public.brief_submission_limits where hour_bucket < now() - interval '48 hours';
  insert into public.brief_submission_limits(ip_hash, hour_bucket, attempts)
  values (p_ip_hash, current_bucket, 1)
  on conflict (ip_hash, hour_bucket) do update set attempts = public.brief_submission_limits.attempts + 1
  returning attempts into current_attempts;
  return current_attempts <= 5;
end;
$$;
revoke all on function public.consume_brief_submission(text) from public, anon, authenticated;
grant execute on function public.consume_brief_submission(text) to service_role;

alter table public.briefs enable row level security;
alter table public.clients enable row level security;
alter table public.edit_logs enable row level security;
alter table public.prospects enable row level security;
drop policy if exists "JL admin reads briefs" on public.briefs;
create policy "JL admin reads briefs" on public.briefs for select to authenticated using (public.is_jl_admin());
drop policy if exists "JL admin updates briefs" on public.briefs;
create policy "JL admin updates briefs" on public.briefs for update to authenticated using (public.is_jl_admin()) with check (public.is_jl_admin());
drop policy if exists "JL admin manages clients" on public.clients;
create policy "JL admin manages clients" on public.clients for all to authenticated using (public.is_jl_admin()) with check (public.is_jl_admin());
drop policy if exists "JL admin manages edit logs" on public.edit_logs;
create policy "JL admin manages edit logs" on public.edit_logs for all to authenticated using (public.is_jl_admin()) with check (public.is_jl_admin());
drop policy if exists "JL admin manages prospects" on public.prospects;
create policy "JL admin manages prospects" on public.prospects for all to authenticated using (public.is_jl_admin()) with check (public.is_jl_admin());
revoke all on public.briefs, public.clients, public.edit_logs, public.prospects from anon;
grant select, update on public.briefs to authenticated;
grant select, insert, update, delete on public.clients, public.edit_logs, public.prospects to authenticated;
grant insert on public.briefs to service_role;
grant select, update on public.briefs to service_role;
grant select, insert, update on public.clients to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brief-photos', 'brief-photos', false, 500000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 500000, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "JL admin reads brief photos" on storage.objects;
create policy "JL admin reads brief photos" on storage.objects for select to authenticated using (bucket_id = 'brief-photos' and public.is_jl_admin());
drop policy if exists "JL admin deletes brief photos" on storage.objects;
create policy "JL admin deletes brief photos" on storage.objects for delete to authenticated using (bucket_id = 'brief-photos' and public.is_jl_admin());
