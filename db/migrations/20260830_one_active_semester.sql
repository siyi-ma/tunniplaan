-- Phase 2: make "exactly one active semester" an enforced invariant.
--
-- db/schema.sql has asserted this in a comment since Phase 1, but nothing stopped
-- a second row being activated. Both read endpoints pick the active semester with
-- an unordered `WHERE is_active = true LIMIT 1`, so two active rows could resolve
-- differently on different requests and serve two clients two different
-- dataset_versions -- defeating the version pinning the whole phase is built on.
--
-- Idempotent. Fails loudly if the invariant is ALREADY broken, which is the
-- correct outcome: that must be resolved by hand before it can be enforced.
--
-- REQUIRES THE TABLE OWNER (neondb_owner). Neither webapp_ro nor scraper_rw can
-- run it -- scraper_rw gets "must be owner of table semesters". Apply it from the
-- Neon console or with an owner connection string, the same way Task 1's
-- migration was applied. NOT YET APPLIED to any database as of 2026-08-30.

CREATE UNIQUE INDEX IF NOT EXISTS semesters_one_active
    ON semesters ((true)) WHERE is_active;
