BEGIN;
-- Owner state, audience preview and revocation events look up subscribers by
-- root. The primary key serves the opposite, user-first lookup direction.
CREATE INDEX label_sharing_subscriptions_active_root_idx
 ON private.label_sharing_subscriptions(root_id,access_lifetime,user_id) WHERE is_active;
COMMIT;
