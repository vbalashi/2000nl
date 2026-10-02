import "server-only";

import { createAdminServiceClient } from "./adminServerClient";

export const PUBLICATION_STATES = ["unpublished", "restricted", "general"] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

export async function updateDictionaryPublication(id: string, state: PublicationState, groupKeys?: string[], userIds?: string[]) {
  const service = createAdminServiceClient();
  const keys = groupKeys === undefined ? null : [...new Set(groupKeys.map((key) => key.trim().toLowerCase()).filter(Boolean))];
  const users = userIds === undefined ? null : [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
  const { data, error } = await service.rpc("set_dictionary_publication", {
    p_dictionary_id: id,
    p_publication_state: state,
    p_group_keys: keys,
    p_user_ids: users,
  });
  if (error) throw new Error("Dictionary publication update failed");
  return data;
}

export async function replaceDictionaryAudience(id: string, groupKeys: string[], userIds: string[]) {
  const service = createAdminServiceClient();
  const keys = [...new Set(groupKeys.map((key) => key.trim().toLowerCase()).filter(Boolean))];
  const users = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
  const { data, error } = await service.rpc("replace_dictionary_audience", {
    p_dictionary_id: id,
    p_group_keys: keys,
    p_user_ids: users,
  });
  if (error) throw new Error("Dictionary audience update failed");
  return data;
}

export async function upsertAccessGroup(key: string, name: string, memberIds: string[]) {
  const service = createAdminServiceClient();
  const normalized = key.trim().toLowerCase();
  if (!normalized || !name.trim()) throw new Error("Invalid access group");
  const members = [...new Set(memberIds.map((id) => id.trim()).filter(Boolean))];
  const { data, error } = await service.rpc("replace_dictionary_access_group", {
    p_key: normalized,
    p_name: name.trim(),
    p_member_ids: members,
  });
  if (error) throw new Error("Access group could not be saved");
  return data;
}

export async function getDictionaryAudience(id: string) {
  const service = createAdminServiceClient();
  const { data, error } = await service.from("dictionary_entitlements")
    .select("subject_type,subject_key")
    .eq("dictionary_id", id).eq("permission", "read");
  if (error) throw new Error("Dictionary audience could not be loaded");
  return {
    groupKeys: (data ?? []).filter((row) => row.subject_type === "group").map((row) => row.subject_key),
    userIds: (data ?? []).filter((row) => row.subject_type === "user").map((row) => row.subject_key),
  };
}

export async function getDictionaryAudienceOptions(page = 1) {
  const service = createAdminServiceClient();
  const perPage = 50;
  const [{ data: groups, error: groupError }, { data: users, error: userError }] = await Promise.all([
    service.from("dictionary_access_groups").select("key,name").order("name"),
    service.auth.admin.listUsers({ page, perPage }),
  ]);
  if (groupError || userError) throw new Error("Dictionary audience options could not be loaded");
  return {
    groups: (groups ?? []).map((group) => ({ key: group.key, name: group.name })),
    users: (users.users ?? []).filter((user) => user.email).map((user) => ({ id: user.id, email: user.email! })),
    page,
    hasMoreUsers: (users.users ?? []).length === perPage,
  };
}
