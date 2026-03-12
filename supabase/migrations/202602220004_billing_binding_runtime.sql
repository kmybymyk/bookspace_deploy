begin;

do $$
begin
  if exists (
    select 1
    from (
      select provider, provider_customer_id
      from public.subscription_accounts
      where provider is not null
        and provider_customer_id is not null
      group by provider, provider_customer_id
      having count(*) > 1
    ) as dup
  ) then
    raise exception 'cannot enforce provider/customer binding uniqueness: duplicate rows exist';
  end if;

  if exists (
    select 1
    from (
      select provider, provider_subscription_id
      from public.subscription_accounts
      where provider is not null
        and provider_subscription_id is not null
      group by provider, provider_subscription_id
      having count(*) > 1
    ) as dup
  ) then
    raise exception 'cannot enforce provider/subscription binding uniqueness: duplicate rows exist';
  end if;
end
$$;

create unique index if not exists subscription_accounts_provider_customer_uniq
  on public.subscription_accounts (provider, provider_customer_id)
  where provider is not null and provider_customer_id is not null;

create unique index if not exists subscription_accounts_provider_subscription_uniq
  on public.subscription_accounts (provider, provider_subscription_id)
  where provider is not null and provider_subscription_id is not null;

create or replace function public.bookspace_register_billing_binding(
  p_provider text,
  p_user_id uuid,
  p_provider_customer_id text default null,
  p_provider_subscription_id text default null,
  p_context jsonb default '{}'::jsonb
)
returns table (
  user_id uuid,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  registered boolean,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_provider_customer_id text := nullif(trim(coalesce(p_provider_customer_id, '')), '');
  v_provider_subscription_id text := nullif(trim(coalesce(p_provider_subscription_id, '')), '');
  v_conflict_user_id uuid;
begin
  if v_request_role <> 'service_role' then
    raise exception 'service_role claim is required';
  end if;

  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  if v_provider = '' or v_provider !~ '^[a-z0-9._-]+$' then
    raise exception 'provider is invalid: %', p_provider;
  end if;

  if v_provider_customer_id is null and v_provider_subscription_id is null then
    raise exception 'provider_customer_id or provider_subscription_id is required';
  end if;

  if v_provider_customer_id is not null then
    select sa.user_id
      into v_conflict_user_id
    from public.subscription_accounts sa
    where sa.provider = v_provider
      and sa.provider_customer_id = v_provider_customer_id
      and sa.user_id <> p_user_id
    limit 1;

    if found then
      raise exception 'provider_customer_id already bound to another user';
    end if;
  end if;

  if v_provider_subscription_id is not null then
    select sa.user_id
      into v_conflict_user_id
    from public.subscription_accounts sa
    where sa.provider = v_provider
      and sa.provider_subscription_id = v_provider_subscription_id
      and sa.user_id <> p_user_id
    limit 1;

    if found then
      raise exception 'provider_subscription_id already bound to another user';
    end if;
  end if;

  insert into public.subscription_accounts (
    user_id,
    provider,
    provider_customer_id,
    provider_subscription_id
  )
  values (
    p_user_id,
    v_provider,
    v_provider_customer_id,
    v_provider_subscription_id
  )
  on conflict (user_id) do update
    set provider = excluded.provider,
        provider_customer_id = coalesce(excluded.provider_customer_id, public.subscription_accounts.provider_customer_id),
        provider_subscription_id = coalesce(excluded.provider_subscription_id, public.subscription_accounts.provider_subscription_id),
        updated_at = v_now;

  return query
  select
    sa.user_id,
    sa.provider,
    sa.provider_customer_id,
    sa.provider_subscription_id,
    true,
    v_now
  from public.subscription_accounts sa
  where sa.user_id = p_user_id;
end;
$$;

do $$
begin
  execute 'revoke all on function public.bookspace_register_billing_binding(text, uuid, text, text, jsonb) from public';

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.bookspace_register_billing_binding(text, uuid, text, text, jsonb) from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.bookspace_register_billing_binding(text, uuid, text, text, jsonb) from authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.bookspace_register_billing_binding(text, uuid, text, text, jsonb) to service_role';
  end if;
end
$$;

commit;
