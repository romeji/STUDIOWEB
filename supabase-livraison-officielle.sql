-- Suivi du lien officiel et de son e-mail de livraison dans le dashboard.
alter table public.clients add column if not exists official_site_url text;
alter table public.clients add column if not exists official_site_email_sent_at timestamptz;
