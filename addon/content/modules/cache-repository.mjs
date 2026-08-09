export class CacheRepository {
  constructor(files, options = {}) {
    this.files = files;
    this.cacheVersion = options.cacheVersion ?? 1;
  }

  async loadDocument(identity) {
    const path = this.#documentPath(identity);
    try {
      const record = await this.files.readJSON(path);
      if (
        record.cacheVersion !== this.cacheVersion ||
        record.identity?.attachmentKey !== identity.attachmentKey ||
        record.identity?.fingerprint !== identity.fingerprint
      ) {
        return null;
      }
      return record;
    } catch (error) {
      if (isMissingFileError(error)) return null;
      try {
        await this.files.quarantine?.(path);
      } catch (quarantineError) {
        if (!isMissingFileError(quarantineError)) throw quarantineError;
      }
      return null;
    }
  }

  async saveDocument(record) {
    if (!record?.identity) throw new TypeError("record.identity is required");
    const value = { cacheVersion: this.cacheVersion, ...record };
    await this.files.writeJSONAtomic(this.#documentPath(record.identity), value);
    return value;
  }

  async invalidate(identity) {
    await this.files.remove(this.#documentPath(identity));
  }

  async enforceLimit(limitBytes = 500_000_000) {
    const entries = (await this.files.list("documents/"))
      .filter((entry) => entry.kind !== "confirmedTerms")
      .sort((a, b) => a.lastUsed - b.lastUsed);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    const removedPaths = [];
    for (const entry of entries) {
      if (total <= limitBytes) break;
      await this.files.remove(entry.path);
      removedPaths.push(entry.path);
      total -= entry.size;
    }
    return { totalBytes: total, removedPaths };
  }

  documentPath(identity) {
    return this.#documentPath(identity);
  }

  #documentPath(identity) {
    const attachmentKey = safeSegment(identity.attachmentKey);
    const fingerprint = safeSegment(identity.fingerprint);
    return `documents/${attachmentKey}-${fingerprint}.v${this.cacheVersion}.json`;
  }
}

function isMissingFileError(error) {
  return (
    error?.code === "ENOENT" ||
    error?.name === "NotFoundError" ||
    /NS_ERROR_FILE_NOT_FOUND|source file does not exist|no such file/i.test(
      String(error?.message ?? error ?? ""),
    )
  );
}

function safeSegment(value) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9._-]+$/.test(text)) {
    throw new TypeError("Cache identity contains unsafe characters");
  }
  return text;
}
