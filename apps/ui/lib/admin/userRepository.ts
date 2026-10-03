import "server-only";

import { createAdminServiceClient } from "./adminServerClient";
import {
  projectAdminUserRegistryRow,
  type AdminUserRegistryPage,
  type AdminUserRegistryQuery,
  type AdminUserRegistryRow,
} from "./userContract";

async function readAdminUserRows(input: {
  query: string | null;
  userId: string | null;
  page: number;
  pageSize: number;
}): Promise<AdminUserRegistryRow[]> {
  const client = createAdminServiceClient();
  const { data, error } = await client.rpc("admin_user_registry_page", {
    p_query: input.query,
    p_user_id: input.userId,
    p_page: input.page,
    p_page_size: input.pageSize,
  });
  if (error) throw new Error("Admin user registry read failed");

  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map(projectAdminUserRegistryRow)
    .filter((row): row is AdminUserRegistryRow => row !== null);
}

export async function listAdminUsers(query: AdminUserRegistryQuery): Promise<AdminUserRegistryPage> {
  const rows = await readAdminUserRows({
    query: query.query,
    userId: null,
    page: query.page,
    pageSize: query.pageSize,
  });
  const items = rows.slice(0, query.pageSize);
  return {
    items,
    hasNext: rows.length > query.pageSize,
    page: query.page,
    pageSize: query.pageSize,
    returned: items.length,
  };
}

export async function getAdminUser(userId: string): Promise<AdminUserRegistryRow | null> {
  const rows = await readAdminUserRows({ query: null, userId, page: 1, pageSize: 1 });
  return rows[0] ?? null;
}
