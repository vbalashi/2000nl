BEGIN;
-- Preserve a user-filterable relation without expanding the entire recursive
-- group graph into every nested entry-access predicate during planning.
CREATE OR REPLACE VIEW private.shared_author_entry_memberships_v1 AS
 SELECT DISTINCT recipient.user_id,entry.id AS entry_id,scope.collection_id,scope.root_id
 FROM (
  SELECT user_id FROM private.collection_sharing_subscriptions
  UNION SELECT user_id FROM private.label_sharing_subscriptions
 ) recipient
 CROSS JOIN LATERAL private.collection_access_paths_for_user_v1(recipient.user_id) scope
 JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
 JOIN private.active_word_entries entry ON entry.id=item.word_id
 JOIN public.dictionaries dictionary ON dictionary.id=entry.dictionary_id
 WHERE dictionary.kind='user' AND dictionary.owner_user_id=scope.owner_user_id AND entry.management_kind='user';
COMMIT;
