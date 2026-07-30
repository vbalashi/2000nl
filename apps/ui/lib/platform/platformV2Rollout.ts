export function platformV2LookupEnabled() {
  const value = process.env.PLATFORM_V2_LOOKUP_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function platformV2ActionsEnabled() {
  const value = process.env.PLATFORM_V2_ACTIONS_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}
