BEGIN;
-- One row per independent live path. Consumers must deduplicate material IDs,
-- while copy revisions retain the path identity and lifetime for revocation.
CREATE VIEW private.live_collection_access_paths_v1 AS
 SELECT subscription.user_id,root.collection_id,root.owner_user_id,root.id AS root_id,
  'collection'::text AS root_kind,root.access_lifetime
 FROM private.collection_sharing_subscriptions subscription
 JOIN private.collection_sharing_roots root ON root.id=subscription.root_id
 WHERE subscription.is_active AND root.is_open AND subscription.access_lifetime=root.access_lifetime
 UNION ALL
 SELECT user_id,collection_id,owner_user_id,root_id,'label'::text,access_lifetime
 FROM private.live_label_sharing_collections_v1;
REVOKE ALL ON private.live_collection_access_paths_v1 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
