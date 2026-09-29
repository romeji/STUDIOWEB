-- Suivi de l'identité de souscription, de l'information précontractuelle et des demandes de rétractation.
alter table public.clients
  add column if not exists customer_type text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists withdrawal_info_acknowledged_at timestamptz,
  add column if not exists early_start_requested boolean not null default false,
  add column if not exists contract_started_at timestamptz,
  add column if not exists withdrawal_requested_at timestamptz,
  add column if not exists withdrawal_status text,
  add column if not exists withdrawal_declaration text,
  add column if not exists withdrawal_refund_cents integer,
  add column if not exists withdrawal_refund_id text;
