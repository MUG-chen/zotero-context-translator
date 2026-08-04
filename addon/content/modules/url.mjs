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
