import test from "node:test";
import assert from "node:assert/strict";
import { normalizeChatCompletionsURL } from "../addon/content/modules/url.mjs";

test("normalizes a v1 base URL and preserves a full endpoint", () => {
  assert.equal(
    normalizeChatCompletionsURL(" https://api.example.com/v1/ "),
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(
    normalizeChatCompletionsURL(
      "https://api.example.com/proxy/v1/chat/completions/",
    ),
    "https://api.example.com/proxy/v1/chat/completions",
  );
});

test("rejects unsafe protocols and URLs with query credentials", () => {
  assert.throws(() => normalizeChatCompletionsURL("file:///secret"), /HTTP/);
  assert.throws(
    () => normalizeChatCompletionsURL("https://api.example.com/v1?key=secret"),
    /query/i,
  );
});
