-- Migration idempotente : exécuter dans Supabase > SQL Editor.
-- Boîte de réception des formulaires/corrections et journal des e-mails clients.
create table if not exists public.client_messages (
  id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('contact','correction')),
  status text not null default 'new' check (status in ('new','handled')), direction text not null default 'inbound' check (direction='inbound'),
  client_id uuid references public.clients(id) on delete set null, brief_id uuid references public.briefs(id) on delete set null,
  name text not null default '', company_name text not null default '', email text not null, phone text not null default '',
  postal_code text not null default '', activity text not null default '', callback_time text not null default '',
  subject text not null, message text not null, notification_sent_at timestamptz, acknowledgement_sent_at timestamptz,
  notification_error text, created_at timestamptz not null default now()
);
create table if not exists public.client_emails (
  id uuid primary key default gen_random_uuid(), client_id uuid references public.clients(id) on delete set null,
  brief_id uuid references public.briefs(id) on delete set null, recipient_email text not null,
  category text not null, subject text not null, body_text text not null default '', provider_message_id text,
  status text not null default 'sent' check (status in ('sent','failed')), created_at timestamptz not null default now()
);
create index if not exists client_messages_created_at_idx on public.client_messages(created_at desc);
create index if not exists client_messages_client_id_idx on public.client_messages(client_id);
create index if not exists client_messages_brief_id_idx on public.client_messages(brief_id);
create index if not exists client_emails_client_id_idx on public.client_emails(client_id, created_at desc);
create index if not exists client_emails_brief_id_idx on public.client_emails(brief_id, created_at desc);

alter table public.client_messages enable row level security;
alter table public.client_emails enable row level security;
drop policy if exists "JL admin reads client messages" on public.client_messages;
create policy "JL admin reads client messages" on public.client_messages for select to authenticated using (public.is_jl_admin());
drop policy if exists "JL admin updates client messages" on public.client_messages;
create policy "JL admin updates client messages" on public.client_messages for update to authenticated using (public.is_jl_admin()) with check (public.is_jl_admin());
drop policy if exists "JL admin reads client emails" on public.client_emails;
create policy "JL admin reads client emails" on public.client_emails for select to authenticated using (public.is_jl_admin());

revoke all on public.client_messages, public.client_emails from anon;
grant select, update on public.client_messages to authenticated;
grant select on public.client_emails to authenticated;
grant select, insert, update on public.client_messages, public.client_emails to service_role;
