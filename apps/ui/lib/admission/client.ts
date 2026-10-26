import type { AdmissionState } from "./contract";
export async function requestAdmission(token: string): Promise<AdmissionState> {
  const response = await fetch("/api/admission", { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось проверить доступ");
  const data = await response.json() as AdmissionState;
  if (typeof data.enabled !== "boolean" || !["approved", "pending", "rejected", "revoked", "unconfirmed"].includes(data.status)) throw new Error("Некорректный ответ проверки доступа");
  return data;
}
