begin;

create or replace function public.bookspace_is_ai_feature(p_feature_id text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_feature_id, '') like 'ai.%'
$$;

create or replace function public.bookspace_plan_allows_feature(
  p_plan public.bookspace_plan,
  p_feature_id text
)
returns boolean
language sql
immutable
as $$
  select
    case
      when coalesce(p_feature_id, '') like 'core.%' then true
      when coalesce(p_feature_id, '') like 'ai.%' then p_plan <> 'FREE'
      else false
    end
$$;

create or replace function public.bookspace_gate_check_and_consume(
  p_user_id uuid,
  p_request_id text,
  p_feature_id text,
  p_required_credits integer default 1,
  p_consume_credit boolean default false,
  p_idempotency_key text default null,
  p_context jsonb default '{}'::jsonb
)
returns table (
  request_id text,
  allowed boolean,
  reason public.bookspace_gate_reason,
  plan public.bookspace_plan,
  ai_credits_remaining integer,
  consumed_credits integer,
  replayed boolean,
  checked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_request_id text := trim(coalesce(p_request_id, ''));
  v_feature_id text := lower(trim(coalesce(p_feature_id, '')));
  v_required_credits integer := greatest(1, coalesce(p_required_credits, 1));
  v_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_auth_user_id uuid;

  v_plan public.bookspace_plan;
  v_ai_credits_remaining integer;
  v_is_ai boolean;
  v_allowed boolean := true;
  v_reason public.bookspace_gate_reason := 'plan-allows-feature';
  v_consumed_credits integer := 0;
  v_replayed boolean := false;

  v_disabled_override boolean := false;
  v_enabled_override boolean := false;
  v_existing_ledger public.ai_credit_ledgers%rowtype;
  v_existing_required_credits integer;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if v_request_role <> 'service_role' and to_regprocedure('auth.uid()') is not null then
    v_auth_user_id := auth.uid();
    if v_auth_user_id is null then
      raise exception 'authenticated user is required';
    end if;
    if v_auth_user_id <> p_user_id then
      raise exception 'user_id must match auth.uid() for non-service callers';
    end if;
  end if;

  if v_request_id = '' then
    raise exception 'request_id is required';
  end if;

  if v_feature_id = '' or v_feature_id !~ '^(core|ai)\.[a-z0-9._-]+$' then
    raise exception 'feature_id is invalid: %', p_feature_id;
  end if;

  v_is_ai := public.bookspace_is_ai_feature(v_feature_id);

  insert into public.subscription_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select sa.plan, sa.ai_credits_remaining
    into v_plan, v_ai_credits_remaining
  from public.subscription_accounts sa
  where sa.user_id = p_user_id
  for update;

  -- Replay path: identical idempotency consume request should not double-charge.
  if p_consume_credit and v_idempotency_key is not null then
    select l.*
      into v_existing_ledger
    from public.ai_credit_ledgers l
    where l.user_id = p_user_id
      and l.idempotency_key = v_idempotency_key
      and l.reason = 'consume'
    order by l.created_at desc
    limit 1;

    if found then
      if coalesce(v_existing_ledger.metadata ->> 'featureId', '') <> v_feature_id then
        raise exception 'idempotency_key reused with different feature_id';
      end if;

      v_existing_required_credits := nullif(v_existing_ledger.metadata ->> 'requiredCredits', '')::integer;
      if coalesce(v_existing_required_credits, v_required_credits) <> v_required_credits then
        raise exception 'idempotency_key reused with different required_credits';
      end if;

      v_replayed := true;
      v_allowed := true;
      v_reason := 'plan-allows-feature';
      v_consumed_credits := 0;

      insert into public.gate_audit_logs (
        user_id,
        request_id,
        feature_id,
        plan,
        allowed,
        reason,
        required_credits,
        consumed_credits,
        idempotency_key,
        context
      )
      values (
        p_user_id,
        v_request_id,
        v_feature_id,
        v_plan,
        true,
        v_reason,
        v_required_credits,
        0,
        v_idempotency_key,
        coalesce(p_context, '{}'::jsonb) || jsonb_build_object('replayed', true)
      )
      on conflict (user_id, request_id, feature_id) do nothing;

      return query
      select
        v_request_id,
        v_allowed,
        v_reason,
        v_plan,
        v_ai_credits_remaining,
        v_consumed_credits,
        v_replayed,
        v_now;
      return;
    end if;
  end if;

  select
    coalesce(bool_or(eo.enabled = false), false),
    coalesce(bool_or(eo.enabled = true), false)
    into v_disabled_override, v_enabled_override
  from public.entitlement_overrides eo
  where eo.user_id = p_user_id
    and eo.feature_id = v_feature_id
    and eo.is_active = true
    and (eo.expires_at is null or eo.expires_at > v_now);

  if v_disabled_override then
    v_allowed := false;
    v_reason := 'feature-disabled-by-flag';
  else
    v_allowed := public.bookspace_plan_allows_feature(v_plan, v_feature_id) or v_enabled_override;
    if not v_allowed then
      v_reason := 'plan-does-not-allow-feature';
    else
      v_reason := 'plan-allows-feature';
    end if;
  end if;

  if v_allowed and p_consume_credit and v_is_ai then
    if v_ai_credits_remaining is not null and v_ai_credits_remaining < v_required_credits then
      v_allowed := false;
      v_reason := 'insufficient-ai-credits';
    end if;
  end if;

  if v_allowed and p_consume_credit and v_is_ai and v_ai_credits_remaining is not null then
    v_consumed_credits := v_required_credits;

    update public.subscription_accounts sa
      set ai_credits_remaining = greatest(0, sa.ai_credits_remaining - v_required_credits)
    where sa.user_id = p_user_id
    returning sa.ai_credits_remaining into v_ai_credits_remaining;
  end if;

  if v_allowed and p_consume_credit and v_is_ai and v_idempotency_key is not null then
    insert into public.ai_credit_ledgers (
      user_id,
      request_id,
      feature_id,
      idempotency_key,
      reason,
      delta,
      balance_before,
      balance_after,
      metadata
    )
    values (
      p_user_id,
      v_request_id,
      v_feature_id,
      v_idempotency_key,
      'consume',
      -v_consumed_credits,
      case
        when v_ai_credits_remaining is null then null
        else v_ai_credits_remaining + v_consumed_credits
      end,
      v_ai_credits_remaining,
      jsonb_build_object(
        'featureId', v_feature_id,
        'requiredCredits', v_required_credits,
        'replayed', false
      ) || coalesce(p_context, '{}'::jsonb)
    )
    on conflict (user_id, idempotency_key, reason) do nothing;
  end if;

  insert into public.gate_audit_logs (
    user_id,
    request_id,
    feature_id,
    plan,
    allowed,
    reason,
    required_credits,
    consumed_credits,
    idempotency_key,
    context
  )
  values (
    p_user_id,
    v_request_id,
    v_feature_id,
    v_plan,
    v_allowed,
    v_reason,
    v_required_credits,
    v_consumed_credits,
    v_idempotency_key,
    coalesce(p_context, '{}'::jsonb)
  )
  on conflict (user_id, request_id, feature_id) do nothing;

  return query
  select
    v_request_id,
    v_allowed,
    v_reason,
    v_plan,
    v_ai_credits_remaining,
    v_consumed_credits,
    v_replayed,
    v_now;
end;
$$;

create or replace function public.bookspace_credit_refund(
  p_user_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_refund_reason text default 'execution-failed',
  p_context jsonb default '{}'::jsonb
)
returns table (
  request_id text,
  status text,
  refunded_credits integer,
  ai_credits_remaining integer,
  refunded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_request_id text := trim(coalesce(p_request_id, ''));
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_auth_user_id uuid;
  v_ai_credits_remaining integer;
  v_consume_ledger public.ai_credit_ledgers%rowtype;
  v_refund_ledger public.ai_credit_ledgers%rowtype;
  v_refunded_credits integer := 0;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if v_request_role <> 'service_role' and to_regprocedure('auth.uid()') is not null then
    v_auth_user_id := auth.uid();
    if v_auth_user_id is null then
      raise exception 'authenticated user is required';
    end if;
    if v_auth_user_id <> p_user_id then
      raise exception 'user_id must match auth.uid() for non-service callers';
    end if;
  end if;

  if v_request_id = '' then
    raise exception 'request_id is required';
  end if;

  if v_idempotency_key = '' then
    raise exception 'idempotency_key is required';
  end if;

  insert into public.subscription_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select sa.ai_credits_remaining
    into v_ai_credits_remaining
  from public.subscription_accounts sa
  where sa.user_id = p_user_id
  for update;

  select l.*
    into v_consume_ledger
  from public.ai_credit_ledgers l
  where l.user_id = p_user_id
    and l.idempotency_key = v_idempotency_key
    and l.reason = 'consume'
  order by l.created_at desc
  limit 1;

  if not found then
    return query
    select
      v_request_id,
      'not-found',
      0,
      v_ai_credits_remaining,
      v_now;
    return;
  end if;

  select l.*
    into v_refund_ledger
  from public.ai_credit_ledgers l
  where l.user_id = p_user_id
    and l.idempotency_key = v_idempotency_key
    and l.reason = 'refund'
  order by l.created_at desc
  limit 1;

  if found then
    return query
    select
      v_request_id,
      'already-refunded',
      0,
      v_ai_credits_remaining,
      v_now;
    return;
  end if;

  v_refunded_credits := greatest(0, -v_consume_ledger.delta);

  if v_refunded_credits > 0 and v_ai_credits_remaining is not null then
    update public.subscription_accounts sa
      set ai_credits_remaining = sa.ai_credits_remaining + v_refunded_credits
    where sa.user_id = p_user_id
    returning sa.ai_credits_remaining into v_ai_credits_remaining;
  end if;

  insert into public.ai_credit_ledgers (
    user_id,
    request_id,
    feature_id,
    idempotency_key,
    reason,
    delta,
    balance_before,
    balance_after,
    metadata
  )
  values (
    p_user_id,
    v_request_id,
    v_consume_ledger.feature_id,
    v_idempotency_key,
    'refund',
    v_refunded_credits,
    case
      when v_ai_credits_remaining is null then null
      else v_ai_credits_remaining - v_refunded_credits
    end,
    v_ai_credits_remaining,
    jsonb_build_object(
      'refundReason', coalesce(nullif(trim(coalesce(p_refund_reason, '')), ''), 'execution-failed'),
      'consumeRequestId', v_consume_ledger.request_id
    ) || coalesce(p_context, '{}'::jsonb)
  )
  on conflict (user_id, idempotency_key, reason) do nothing;

  return query
  select
    v_request_id,
    'refunded',
    v_refunded_credits,
    v_ai_credits_remaining,
    v_now;
end;
$$;

do $$
begin
  execute 'revoke all on function public.bookspace_gate_check_and_consume(uuid, text, text, integer, boolean, text, jsonb) from public';
  execute 'revoke all on function public.bookspace_credit_refund(uuid, text, text, text, jsonb) from public';

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.bookspace_gate_check_and_consume(uuid, text, text, integer, boolean, text, jsonb) from anon';
    execute 'revoke all on function public.bookspace_credit_refund(uuid, text, text, text, jsonb) from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.bookspace_gate_check_and_consume(uuid, text, text, integer, boolean, text, jsonb) from authenticated';
    execute 'revoke all on function public.bookspace_credit_refund(uuid, text, text, text, jsonb) from authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.bookspace_gate_check_and_consume(uuid, text, text, integer, boolean, text, jsonb) to service_role';
    execute 'grant execute on function public.bookspace_credit_refund(uuid, text, text, text, jsonb) to service_role';
  end if;
end
$$;

commit;
