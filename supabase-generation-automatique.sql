-- Migration idempotente pour la génération IA automatique des maquettes.
alter table public.briefs
  add column if not exists ai_generation_status text not null default 'not_started'
    check (ai_generation_status in ('not_started','pending','processing','ready','complete','failed','email_failed')),
  add column if not exists ai_generation_error text,
  add column if not exists ai_generation_started_at timestamptz,
  add column if not exists ai_generated_at timestamptz,
  add column if not exists ai_model text,
  add column if not exists ai_input_tokens integer,
  add column if not exists ai_output_tokens integer;

create index if not exists briefs_ai_generation_status_created_idx
  on public.briefs(ai_generation_status, created_at);

grant select, update on public.briefs to authenticated;
grant select, insert, update on public.briefs to service_role;
