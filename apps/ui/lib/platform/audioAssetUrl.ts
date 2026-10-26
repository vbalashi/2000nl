import type { NextRequest } from "next/server";

export function publicAudioAssetUrl(request: NextRequest, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const publicOrigin = publicRequestOrigin(request);
  try {
    const url = new URL(trimmed, publicOrigin || request.url);
    if (isInternalOrigin(url)) {
      return new URL(
        `${url.pathname}${url.search}${url.hash}`,
        publicOrigin || request.url,
      ).toString();
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function publicRequestOrigin(request: NextRequest) {
  const configured =
    process.env.PLATFORM_AUDIO_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "https://2000.dilum.io" : "");
  const configuredOrigin = originFromUrl(configured);
  if (configuredOrigin) return configuredOrigin;

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(request.headers.get("host"));
  if (host) {
    const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    const proto = forwardedProto || (isLocalHost(host) ? "http" : "https");
    const headerOrigin = originFromUrl(`${proto}://${host}`);
    if (headerOrigin && !isInternalOrigin(new URL(headerOrigin))) return headerOrigin;
  }

  const requestOrigin = originFromUrl(request.url);
  if (requestOrigin && !isInternalOrigin(new URL(requestOrigin))) return requestOrigin;
  return requestOrigin || "";
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function originFromUrl(value: string) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isInternalOrigin(url: URL) {
  return isLocalHost(url.hostname) || url.hostname === "0.0.0.0";
}

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}
