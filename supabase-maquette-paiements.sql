-- À exécuter dans Supabase > SQL Editor avant le déploiement du parcours aperçu/paiement.
-- Ajoute l’aperçu privé des sites générés et relie le client Stripe à son brief.
alter table public.briefs
  add column if not exists generated_site_html text not null default '',
  add column if not exists preview_token_hash text unique,
  add column if not exists preview_expires_at timestamptz,
  add column if not exists request_email_sent_at timestamptz,
  add column if not exists preview_email_sent_at timestamptz,
  add column if not exists email_last_error text;

alter table public.clients
  add column if not exists brief_id uuid unique references public.briefs(id) on delete set null,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists welcome_email_last_error text;

grant select, update on public.briefs to authenticated;
grant select, update on public.clients to authenticated;
grant select, update on public.briefs to service_role;
grant select, insert, update on public.clients to service_role;
