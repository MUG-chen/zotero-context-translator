import test from "node:test";
import assert from "node:assert/strict";
import { CredentialStore } from "../addon/content/modules/credential-store.mjs";

class MemoryCredentialBackend {
  logins = [];
  async find(query) {
    return (
      this.logins.find(
        (login) =>
          login.origin === query.origin &&
          login.realm === query.realm &&
          login.username === query.username,
      ) ?? null
    );
  }
  async add(login) {
    this.logins.push({ ...login });
  }
  async remove(login) {
    this.logins = this.logins.filter((candidate) => candidate !== login);
  }
}

test("replaces an existing API key for the same endpoint", async () => {
  const backend = new MemoryCredentialBackend();
  const store = new CredentialStore(backend);

  await store.setAPIKey("https://api.example.com/v1", "first");
  await store.setAPIKey("https://api.example.com/v1", "second");

  assert.equal(
    await store.getAPIKey("https://api.example.com/v1"),
    "second",
  );
  assert.equal(backend.logins.length, 1);
});

test("clear removes the stored key and missing keys return an empty string", async () => {
  const store = new CredentialStore(new MemoryCredentialBackend());
  await store.setAPIKey("https://api.example.com/v1", "secret");
  await store.clearAPIKey("https://api.example.com/v1");

  assert.equal(await store.getAPIKey("https://api.example.com/v1"), "");
});
