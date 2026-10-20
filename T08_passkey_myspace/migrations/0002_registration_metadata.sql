-- T08 registration pending metadata; apply ONCE in the D1 Console after 0001_init.sql.
-- Registration challenges have short lifetimes and are discarded on cancellation.
ALTER TABLE challenges ADD COLUMN pending_nickname TEXT;
ALTER TABLE challenges ADD COLUMN pending_label TEXT;
ALTER TABLE challenges ADD COLUMN pending_user_id TEXT;
ALTER TABLE challenges ADD COLUMN rp_origin TEXT;
