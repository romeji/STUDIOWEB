-- Suivi de la résiliation programmée sans couper immédiatement l’abonnement.
alter table public.clients
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_effective_at timestamptz;
