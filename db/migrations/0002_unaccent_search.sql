-- Accent-insensitive search: "poang" finds "Poäng", "cafe" finds "café".
-- unaccent() isn't IMMUTABLE, so wrap it (with an explicit dictionary) for use in a generated column.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

DROP INDEX IF EXISTS listings_search_idx;
ALTER TABLE listings DROP COLUMN search;
ALTER TABLE listings ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', immutable_unaccent(coalesce(title, ''))), 'A') ||
  setweight(to_tsvector('english', immutable_unaccent(coalesce(brand, ''))), 'B') ||
  setweight(to_tsvector('english', immutable_unaccent(coalesce(description, '') || ' ' || coalesce(wear_notes, ''))), 'C')
) STORED;
CREATE INDEX listings_search_idx ON listings USING gin (search);
