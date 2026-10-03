import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminServerClient", () => ({ createAdminServiceClient: () => ({ rpc, from }) }));

import { replaceDictionaryAudience, updateDictionaryPublication, upsertAccessGroup } from "@/lib/admin/publicationRepository";

beforeEach(() => { vi.clearAllMocks(); });

const audit = { operatorUserId: "operator-1", requestId: "request-1", clientIp: "198.51.100.7", userAgent: "Admin test" };

describe("admin publication mutations", () => {
  it("uses one transaction-scoped RPC for the audience replacement and audit record", async () => {
    rpc.mockResolvedValue({ data: { groupKeys: ["trusted"], userIds: ["user-1"] }, error: null });
    await replaceDictionaryAudience("dictionary-1", [" Trusted ", "trusted"], ["user-1"], audit);
    expect(rpc).toHaveBeenCalledWith("admin_replace_dictionary_audience", {
      p_dictionary_id: "dictionary-1", p_group_keys: ["trusted"], p_user_ids: ["user-1"],
      p_operator_user_id: "operator-1", p_request_id: "request-1", p_client_ip: "198.51.100.7", p_user_agent: "Admin test",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("uses one transaction-scoped RPC for publication plus audience", async () => {
    rpc.mockResolvedValue({ data: { dictionaryId: "dictionary-1", publicationState: "restricted" }, error: null });
    await updateDictionaryPublication("dictionary-1", "restricted", [" Trusted "], ["user-1"], audit);
    expect(rpc).toHaveBeenCalledWith("admin_set_dictionary_publication", {
      p_dictionary_id: "dictionary-1", p_publication_state: "restricted",
      p_group_keys: ["trusted"], p_user_ids: ["user-1"],
      p_operator_user_id: "operator-1", p_request_id: "request-1", p_client_ip: "198.51.100.7", p_user_agent: "Admin test",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns no result for a missing dictionary so the route can return 404", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(updateDictionaryPublication("missing", "general", undefined, undefined, audit)).resolves.toBeNull();
  });

  it("replaces a group's metadata and membership in one database RPC", async () => {
    rpc.mockResolvedValue({ data: { key: "trusted", memberIds: ["user-1"] }, error: null });
    await upsertAccessGroup(" Trusted ", "Trusted users", [" user-1 ", "user-1"], audit);
    expect(rpc).toHaveBeenCalledWith("admin_replace_dictionary_access_group", {
      p_key: "trusted", p_name: "Trusted users", p_member_ids: ["user-1"],
      p_operator_user_id: "operator-1", p_request_id: "request-1", p_client_ip: "198.51.100.7", p_user_agent: "Admin test",
    });
    expect(from).not.toHaveBeenCalled();
  });
});
