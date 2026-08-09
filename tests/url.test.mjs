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

test("rejects plaintext HTTP for public and LAN endpoints", () => {
  assert.throws(
    () => normalizeChatCompletionsURL("http://api.example.com/v1"),
    /HTTPS/i,
  );
  assert.throws(
    () => normalizeChatCompletionsURL("http://192.168.1.20/v1"),
    /HTTPS/i,
  );
});

test("allows plaintext HTTP only for explicit loopback development hosts", () => {
  const cases = [
    ["http://localhost:8080/v1", "http://localhost:8080/v1/chat/completions"],
    ["http://127.0.0.1:8080/v1", "http://127.0.0.1:8080/v1/chat/completions"],
    ["http://127.42.7.9/v1", "http://127.42.7.9/v1/chat/completions"],
    ["http://[::1]:8080/v1", "http://[::1]:8080/v1/chat/completions"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeChatCompletionsURL(input), expected);
  }
});
