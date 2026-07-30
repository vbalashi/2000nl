export function platformV2LookupEnabled() {
  const value = process.env.PLATFORM_V2_LOOKUP_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true";
}
