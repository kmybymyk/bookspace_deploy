# BookSpace Server SQL Baseline

This directory contains the SQL baseline for subscription entitlements, AI credits, and AI request audit trails.

## Files

1. `001_subscription_core.sql`
- Core enums and tables for subscription plans, overrides, credit ledgers, gate audits, and AI requests
- RLS enablement and baseline policies for `service_role` + user read access (when `auth.uid()` is available)
2. `002_subscription_runtime_functions.sql`
- Atomic runtime SQL functions for entitlement gate checks and credit refunds
- Function names:
  - `bookspace_gate_check_and_consume(...)`
  - `bookspace_credit_refund(...)`
3. `003_billing_webhook_runtime.sql`
- Billing webhook event idempotency log table + service-role-only apply function
- Function names:
  - `bookspace_apply_billing_webhook(...)`
4. `004_billing_binding_runtime.sql`
- Provider binding uniqueness constraints and service-role-only register function
- Function names:
  - `bookspace_register_billing_binding(...)`

## Apply Order

1. `001_subscription_core.sql`
2. `002_subscription_runtime_functions.sql`
3. `003_billing_webhook_runtime.sql`
4. `004_billing_binding_runtime.sql`

## Notes

- SQL is idempotent (`if not exists` / guarded `do $$ ... $$`) to support repeatable local setup.
- `user_id` is stored as `uuid` without hard FK binding so the same schema can run in both Supabase and plain PostgreSQL.
- For Supabase production, run migration via Supabase migration pipeline and validate RLS with real JWT claims.
