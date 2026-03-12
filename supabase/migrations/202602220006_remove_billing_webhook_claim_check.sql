begin;
create or replace function public.bookspace_apply_billing_webhook(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_user_id uuid default null,
  p_plan public.bookspace_plan default null,
  p_subscription_status public.bookspace_subscription_status default null,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_period_start_at timestamptz default null,
  p_period_end_at timestamptz default null,
  p_ai_credits_monthly integer default null,
  p_ai_credits_remaining integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns table (
  event_id text,
  result text,
  applied boolean,
  processed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_event_id text := trim(coalesce(p_event_id, ''));
  v_event_type text := trim(coalesce(p_event_type, ''));
  v_existing_status text;
  v_existing_processed_at timestamptz;
  v_plan public.bookspace_plan := p_plan;
  v_subscription_status public.bookspace_subscription_status := p_subscription_status;
  v_provider_customer_id text := nullif(trim(coalesce(p_provider_customer_id, '')), '');
  v_provider_subscription_id text := nullif(trim(coalesce(p_provider_subscription_id, '')), '');
  v_ai_credits_monthly integer;
  v_ai_credits_remaining integer;
  v_existing_plan public.bookspace_plan;
  v_existing_subscription_status public.bookspace_subscription_status;
  v_existing_ai_credits_monthly integer;
  v_existing_ai_credits_remaining integer;
  v_bound_user_id uuid;
  v_bound_customer_user_id uuid;
  v_bound_subscription_user_id uuid;
  v_bound_customer_user_count integer := 0;
  v_bound_subscription_user_count integer := 0;
begin
  -- request role guard removed: execution is already restricted by function grants.

  if v_provider = '' or v_provider !~ '^[a-z0-9._-]+$' then
    raise exception 'provider is invalid: %', p_provider;
  end if;

  if v_event_id = '' then
    raise exception 'event_id is required';
  end if;

  if v_event_type = '' then
    raise exception 'event_type is required';
  end if;

  select bwe.processing_status, bwe.processed_at
    into v_existing_status, v_existing_processed_at
  from public.billing_webhook_events bwe
  where bwe.provider = v_provider
    and bwe.event_id = v_event_id
  for update;

  if found and v_existing_processed_at is not null and v_existing_status in ('processed', 'ignored') then
    return query
    select
      v_event_id,
      'duplicate',
      false,
      v_existing_processed_at;
    return;
  end if;

  if found then
    update public.billing_webhook_events bwe
      set event_type = v_event_type,
          payload = coalesce(p_payload, '{}'::jsonb),
          received_at = v_now,
          processing_status = 'received',
          attempt_count = bwe.attempt_count + 1,
          last_error = null
    where bwe.provider = v_provider
      and bwe.event_id = v_event_id;
  else
    insert into public.billing_webhook_events (
      provider,
      event_id,
      event_type,
      payload,
      received_at,
      processing_status,
      attempt_count
    )
    values (
      v_provider,
      v_event_id,
      v_event_type,
      coalesce(p_payload, '{}'::jsonb),
      v_now,
      'received',
      1
    );
  end if;

  if v_provider_customer_id is null and v_provider_subscription_id is null then
    update public.billing_webhook_events bwe
      set processing_status = 'ignored',
          processed_at = v_now,
          last_error = 'provider binding identifiers missing'
    where bwe.provider = v_provider
      and bwe.event_id = v_event_id;

    return query
    select
      v_event_id,
      'ignored',
      false,
      v_now;
    return;
  end if;

  if v_provider_customer_id is not null then
    select
      case when count(distinct sa.user_id) = 1 then min(sa.user_id) else null end,
      count(distinct sa.user_id)::integer
      into v_bound_customer_user_id, v_bound_customer_user_count
    from public.subscription_accounts sa
    where sa.provider = v_provider
      and sa.provider_customer_id = v_provider_customer_id;
  end if;

  if v_provider_subscription_id is not null then
    select
      case when count(distinct sa.user_id) = 1 then min(sa.user_id) else null end,
      count(distinct sa.user_id)::integer
      into v_bound_subscription_user_id, v_bound_subscription_user_count
    from public.subscription_accounts sa
    where sa.provider = v_provider
      and sa.provider_subscription_id = v_provider_subscription_id;
  end if;

  if v_bound_customer_user_count > 1 or v_bound_subscription_user_count > 1 then
    update public.billing_webhook_events bwe
      set processing_status = 'ignored',
          processed_at = v_now,
          last_error = 'ambiguous existing provider binding'
    where bwe.provider = v_provider
      and bwe.event_id = v_event_id;

    return query
    select
      v_event_id,
      'ignored',
      false,
      v_now;
    return;
  end if;

  if v_bound_customer_user_id is not null
     and v_bound_subscription_user_id is not null
     and v_bound_customer_user_id <> v_bound_subscription_user_id then
    update public.billing_webhook_events bwe
      set processing_status = 'ignored',
          processed_at = v_now,
          last_error = 'binding conflict between customer and subscription ids'
    where bwe.provider = v_provider
      and bwe.event_id = v_event_id;

    return query
    select
      v_event_id,
      'ignored',
      false,
      v_now;
    return;
  end if;

  v_bound_user_id := coalesce(v_bound_customer_user_id, v_bound_subscription_user_id);

  if v_bound_user_id is null then
    update public.billing_webhook_events bwe
      set processing_status = 'ignored',
          processed_at = v_now,
          last_error = 'provider binding not found'
    where bwe.provider = v_provider
      and bwe.event_id = v_event_id;

    return query
    select
      v_event_id,
      'ignored',
      false,
      v_now;
    return;
  end if;

  if p_user_id is not null and p_user_id <> v_bound_user_id then
    update public.billing_webhook_events bwe
      set processing_status = 'ignored',
          processed_at = v_now,
          last_error = 'bookspace_user_id metadata mismatch with provider binding'
    where bwe.provider = v_provider
      and bwe.event_id = v_event_id;

    return query
    select
      v_event_id,
      'ignored',
      false,
      v_now;
    return;
  end if;

  select
    sa.plan,
    sa.status,
    sa.ai_credits_monthly,
    sa.ai_credits_remaining
    into
      v_existing_plan,
      v_existing_subscription_status,
      v_existing_ai_credits_monthly,
      v_existing_ai_credits_remaining
  from public.subscription_accounts sa
  where sa.user_id = v_bound_user_id
  for update;

  v_plan := coalesce(v_plan, v_existing_plan, 'FREE');
  v_subscription_status := coalesce(v_subscription_status, v_existing_subscription_status, 'active');

  v_ai_credits_monthly := greatest(
    0,
    coalesce(
      p_ai_credits_monthly,
      v_existing_ai_credits_monthly,
      case
        when v_plan = 'PRO' then 300
        when v_plan = 'PRO_LITE' then 100
        else 0
      end
    )
  );

  if v_plan = 'FREE' then
    v_ai_credits_remaining := null;
  else
    v_ai_credits_remaining := greatest(
      0,
      coalesce(
        p_ai_credits_remaining,
        v_existing_ai_credits_remaining,
        v_ai_credits_monthly
      )
    );
  end if;

  insert into public.subscription_accounts (
    user_id,
    plan,
    status,
    period_start_at,
    period_end_at,
    provider,
    provider_customer_id,
    provider_subscription_id,
    ai_credits_monthly,
    ai_credits_remaining
  )
  values (
    v_bound_user_id,
    v_plan,
    v_subscription_status,
    p_period_start_at,
    p_period_end_at,
    v_provider,
    v_provider_customer_id,
    v_provider_subscription_id,
    v_ai_credits_monthly,
    v_ai_credits_remaining
  )
  on conflict (user_id) do update
    set plan = excluded.plan,
        status = excluded.status,
        period_start_at = excluded.period_start_at,
        period_end_at = excluded.period_end_at,
        provider = excluded.provider,
        provider_customer_id = coalesce(excluded.provider_customer_id, public.subscription_accounts.provider_customer_id),
        provider_subscription_id = coalesce(excluded.provider_subscription_id, public.subscription_accounts.provider_subscription_id),
        ai_credits_monthly = excluded.ai_credits_monthly,
        ai_credits_remaining = excluded.ai_credits_remaining;

  update public.billing_webhook_events bwe
    set user_id = v_bound_user_id,
        provider_customer_id = v_provider_customer_id,
        provider_subscription_id = v_provider_subscription_id,
        normalized_plan = v_plan,
        normalized_status = v_subscription_status,
        processing_status = 'processed',
        processed_at = v_now,
        last_error = null
  where bwe.provider = v_provider
    and bwe.event_id = v_event_id;

  return query
  select
    v_event_id,
    'processed',
    true,
    v_now;
exception
  when others then
    update public.billing_webhook_events bwe
      set processing_status = 'failed',
          last_error = left(sqlerrm, 500)
    where bwe.provider = v_provider
      and bwe.event_id = v_event_id;
    raise;
end;
$$;

do $$
begin
  execute 'revoke all on function public.bookspace_apply_billing_webhook(text, text, text, uuid, public.bookspace_plan, public.bookspace_subscription_status, text, text, timestamptz, timestamptz, integer, integer, jsonb) from public';

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.bookspace_apply_billing_webhook(text, text, text, uuid, public.bookspace_plan, public.bookspace_subscription_status, text, text, timestamptz, timestamptz, integer, integer, jsonb) from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.bookspace_apply_billing_webhook(text, text, text, uuid, public.bookspace_plan, public.bookspace_subscription_status, text, text, timestamptz, timestamptz, integer, integer, jsonb) from authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.bookspace_apply_billing_webhook(text, text, text, uuid, public.bookspace_plan, public.bookspace_subscription_status, text, text, timestamptz, timestamptz, integer, integer, jsonb) to service_role';
  end if;
end
$$;

commit;
