-- Indexes for the country filter on countries other than India / the USA.
-- Partial: only rows whose phone number is from another country (~230K people, ~230K companies), so
-- they are small and quick to build. CONCURRENTLY = no table lock, the app keeps working while it builds.
-- The search conditions repeat this predicate (phone_country NOT IN ('IN', 'US')) so the planner uses them.
-- Run outside a transaction, e.g.:  psql "$NEON_DIRECT_URL" -f scripts/create_country_indexes.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_phone_country_other
  ON final.people (phone_country) WHERE phone_country NOT IN ('IN', 'US');
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_phone_country_other
  ON final.companies (phone_country) WHERE phone_country NOT IN ('IN', 'US');
