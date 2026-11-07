-- Optional contact address; authentication email remains unchanged.
ALTER TABLE drivers_registration ADD COLUMN contact_email TEXT;
-- Runtime compatibility: profile._ensure_columns checks column existence.
-- Rollback: older code ignores this nullable field; preserve stored data.
