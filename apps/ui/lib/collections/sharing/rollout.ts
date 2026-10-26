/** Server admission only. Reads stay available during a new-write rollback.
 * Draft275 adds the authoritative DB command/note/placement gate; both layers
 * must permit new writes. Complete protocol/UI rollout is still a prerequisite. */
export function collectionSharingWritesEnabled(){
 return process.env.COLLECTION_SHARING_WRITES_ENABLED==='true';
}
