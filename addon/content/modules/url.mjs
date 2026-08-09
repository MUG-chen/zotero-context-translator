const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";

export function normalizeChatCompletionsURL(baseURL) {
  if (typeof baseURL !== "string" || !baseURL.trim()) {
    throw new TypeError("Base URL is required");
  }

  let url;
  try {
    url = new URL(baseURL.trim());
  } catch {
    throw new TypeError("Base URL must be a valid HTTP URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Base URL must use HTTP or HTTPS");
  }
  if (url.protocol === "http:" && !isExplicitLoopback(url.hostname)) {
    throw new TypeError("Base URL must use HTTPS for non-loopback hosts");
  }
  if (url.username || url.password) {
    throw new TypeError("Base URL must not contain credentials");
  }
  if (url.search) {
    throw new TypeError("Base URL must not contain a query string");
  }
  if (url.hash) {
    throw new TypeError("Base URL must not contain a fragment");
  }

  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith(CHAT_COMPLETIONS_SUFFIX)
    ? path
    : `${path}${CHAT_COMPLETIONS_SUFFIX}`;
  return url.toString().replace(/\/$/, "");
}

function isExplicitLoopback(hostname) {
  const normalized = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255)
  );
}
