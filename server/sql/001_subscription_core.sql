begin;

create extension if not exists pgcrypto;

-- Enumerations used by subscription and AI runtime tables.
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'bookspace_plan'
  ) then
    create type public.bookspace_plan as enum ('FREE', 'PRO_LITE', 'PRO');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'bookspace_subscription_status'
  ) then
    create type public.bookspace_subscription_status as enum ('active', 'past_due', 'canceled');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'bookspace_credit_ledger_reason'
  ) then
    create type public.bookspace_credit_ledger_reason as enum ('consume', 'refund', 'grant', 'adjustment');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'bookspace_gate_reason'
  ) then
    create type public.bookspace_gate_reason as enum (
      'plan-allows-feature',
      'plan-does-not-allow-feature',
      'feature-disabled-by-flag',
      'insufficient-ai-credits'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'bookspace_ai_request_status'
  ) then
    create type public.bookspace_ai_request_status as enum (
      'ok',
      'needs-context',
      'error',
      'rejected-safety',
      'conflict',
      'upstream-timeout',
      'upstream-error',
      'validation-error'
    );
  end if;
end
$$;

create or replace function public.bookspace_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.subscription_accounts (
  user_id uuid primary key,
  plan public.bookspace_plan not null default 'FREE',
  status public.bookspace_subscription_status not null default 'active',
  period_start_at timestamptz,
  period_end_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  ai_credits_monthly integer not null default 0,
  ai_credits_remaining integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ai_credits_monthly >= 0),
  check (ai_credits_remaining is null or ai_credits_remaining >= 0)
);

create index if not exists subscription_accounts_plan_status_idx
  on public.subscription_accounts (plan, status);

create index if not exists subscription_accounts_provider_customer_idx
  on public.subscription_accounts (provider_customer_id)
  where provider_customer_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_subscription_accounts_updated_at'
  ) then
    create trigger trg_subscription_accounts_updated_at
    before update on public.subscription_accounts
    for each row execute function public.bookspace_set_updated_at();
  end if;
end
$$;

create table if not exists public.entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature_id text not null,
  enabled boolean not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  is_active boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (feature_id ~ '^(core|ai)\.[a-z0-9._-]+$'),
  check (not is_active or revoked_at is null)
);

create unique index if not exists entitlement_overrides_user_feature_active_uniq
  on public.entitlement_overrides (user_id, feature_id)
  where is_active = true;

create index if not exists entitlement_overrides_user_created_at_idx
  on public.entitlement_overrides (user_id, created_at desc);

create index if not exists entitlement_overrides_expires_at_idx
  on public.entitlement_overrides (expires_at)
  where expires_at is not null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_entitlement_overrides_updated_at'
  ) then
    create trigger trg_entitlement_overrides_updated_at
    before update on public.entitlement_overrides
    for each row execute function public.bookspace_set_updated_at();
  end if;
end
$$;

create table if not exists public.ai_credit_ledgers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id text not null,
  feature_id text not null,
  idempotency_key text not null,
  reason public.bookspace_credit_ledger_reason not null,
  delta integer not null,
  balance_before integer,
  balance_after integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (feature_id ~ '^(core|ai)\.[a-z0-9._-]+$'),
  check (
    (balance_before is null and balance_after is null)
    or (balance_before is not null and balance_after is not null and balance_after = balance_before + delta)
  )
);

create unique index if not exists ai_credit_ledgers_user_idempotency_reason_uniq
  on public.ai_credit_ledgers (user_id, idempotency_key, reason);

create index if not exists ai_credit_ledgers_user_created_at_idx
  on public.ai_credit_ledgers (user_id, created_at desc);

create index if not exists ai_credit_ledgers_request_id_idx
  on public.ai_credit_ledgers (request_id);

create table if not exists public.gate_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id text not null,
  feature_id text not null,
  plan public.bookspace_plan not null,
  allowed boolean not null,
  reason public.bookspace_gate_reason not null,
  required_credits integer not null default 1,
  consumed_credits integer not null default 0,
  idempotency_key text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (feature_id ~ '^(core|ai)\.[a-z0-9._-]+$'),
  check (required_credits >= 1),
  check (consumed_credits >= 0)
);

create unique index if not exists gate_audit_logs_user_request_feature_uniq
  on public.gate_audit_logs (user_id, request_id, feature_id);

create index if not exists gate_audit_logs_user_created_at_idx
  on public.gate_audit_logs (user_id, created_at desc);

create index if not exists gate_audit_logs_feature_created_at_idx
  on public.gate_audit_logs (feature_id, created_at desc);

create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id text not null,
  idempotency_key text not null,
  feature_id text not null default 'ai.chat.ask',
  intent text not null,
  status public.bookspace_ai_request_status not null,
  base_project_revision text,
  schema_version text,
  validation_code text,
  warnings jsonb not null default '[]'::jsonb,
  input_context jsonb not null default '{}'::jsonb,
  output_envelope jsonb,
  model_id text,
  model_version text,
  prompt_template_version text,
  prompt_hash text,
  error_code text,
  error_message text,
  latency_ms integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (feature_id ~ '^(core|ai)\.[a-z0-9._-]+$'),
  check (latency_ms is null or latency_ms >= 0)
);

create unique index if not exists ai_requests_request_id_uniq
  on public.ai_requests (request_id);

create unique index if not exists ai_requests_user_idempotency_uniq
  on public.ai_requests (user_id, idempotency_key);

create index if not exists ai_requests_user_created_at_idx
  on public.ai_requests (user_id, created_at desc);

create index if not exists ai_requests_status_created_at_idx
  on public.ai_requests (status, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_ai_requests_updated_at'
  ) then
    create trigger trg_ai_requests_updated_at
    before update on public.ai_requests
    for each row execute function public.bookspace_set_updated_at();
  end if;
end
$$;

alter table public.subscription_accounts enable row level security;
alter table public.entitlement_overrides enable row level security;
alter table public.ai_credit_ledgers enable row level security;
alter table public.gate_audit_logs enable row level security;
alter table public.ai_requests enable row level security;

-- Service role can perform full access across all subscription and AI billing tables.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'subscription_accounts' and policyname = 'bookspace_service_all_subscription_accounts'
  ) then
    create policy bookspace_service_all_subscription_accounts
      on public.subscription_accounts
      for all
      using (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      with check (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'entitlement_overrides' and policyname = 'bookspace_service_all_entitlement_overrides'
  ) then
    create policy bookspace_service_all_entitlement_overrides
      on public.entitlement_overrides
      for all
      using (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      with check (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_credit_ledgers' and policyname = 'bookspace_service_all_ai_credit_ledgers'
  ) then
    create policy bookspace_service_all_ai_credit_ledgers
      on public.ai_credit_ledgers
      for all
      using (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      with check (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'gate_audit_logs' and policyname = 'bookspace_service_all_gate_audit_logs'
  ) then
    create policy bookspace_service_all_gate_audit_logs
      on public.gate_audit_logs
      for all
      using (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      with check (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_requests' and policyname = 'bookspace_service_all_ai_requests'
  ) then
    create policy bookspace_service_all_ai_requests
      on public.ai_requests
      for all
      using (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      with check (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  end if;
end
$$;

-- End-user read access is applied only when auth.uid() is available (Supabase runtime).
do $$
begin
  if to_regprocedure('auth.uid()') is not null then
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = 'subscription_accounts' and policyname = 'bookspace_user_select_subscription_accounts'
    ) then
      create policy bookspace_user_select_subscription_accounts
        on public.subscription_accounts
        for select
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = 'entitlement_overrides' and policyname = 'bookspace_user_select_entitlement_overrides'
    ) then
      create policy bookspace_user_select_entitlement_overrides
        on public.entitlement_overrides
        for select
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_credit_ledgers' and policyname = 'bookspace_user_select_ai_credit_ledgers'
    ) then
      create policy bookspace_user_select_ai_credit_ledgers
        on public.ai_credit_ledgers
        for select
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = 'gate_audit_logs' and policyname = 'bookspace_user_select_gate_audit_logs'
    ) then
      create policy bookspace_user_select_gate_audit_logs
        on public.gate_audit_logs
        for select
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_requests' and policyname = 'bookspace_user_select_ai_requests'
    ) then
      create policy bookspace_user_select_ai_requests
        on public.ai_requests
        for select
        using (auth.uid() = user_id);
    end if;
  end if;
end
$$;

commit;
