import { PREF_BRANCH } from "./constants.mjs";

const LOGIN_REALM = "Zotero Context Translator API Key";

export function readPaperMetadata(zotero, attachmentID) {
  const attachment = zotero.Items.get(attachmentID);
  const item = attachment?.parentItemID
    ? zotero.Items.get(attachment.parentItemID)
    : attachment;
  if (!item) return emptyMetadata();
  return {
    title: field(item, "title"),
    abstract: field(item, "abstractNote"),
    publicationTitle: field(item, "publicationTitle"),
    date: field(item, "date"),
    creators: (item.getCreators?.() ?? [])
      .map(formatCreator)
      .filter(Boolean),
  };
}

export function createPreferenceBackend(prefs) {
  return {
    get(name, fallback = "") {
      const value = prefs.get(`${PREF_BRANCH}${name}`, true);
      return value === undefined ? fallback : value;
    },
    set(name, value) {
      return prefs.set(`${PREF_BRANCH}${name}`, value, true);
    },
    clear(name) {
      return prefs.clear(`${PREF_BRANCH}${name}`, true);
    },
  };
}

export function createLoginBackend({ loginManager, createLogin }) {
  return {
    async find({ origin, realm, username }) {
      const matches = await loginManager.findLogins(origin, null, realm);
      return matches.find((login) => login.username === username) ?? null;
    },
    async add(value) {
      return loginManager.addLoginAsync(
        createLogin({
          origin: value.origin,
          realm: value.realm,
          username: value.username,
          password: value.password,
        }),
      );
    },
    async remove(login) {
      return loginManager.removeLogin(login);
    },
    async removeAll() {
      const logins = await loginManager.getAllLogins();
      for (const login of logins) {
        if (login.httpRealm === LOGIN_REALM) {
          await loginManager.removeLogin(login);
        }
      }
    },
  };
}

export function createZoteroFileAdapter({
  IOUtils,
  PathUtils,
  rootPath,
  random = () => globalThis.crypto.randomUUID(),
  cloneIntoIO = (value) => value,
}) {
  const resolve = (relativePath) => {
    const segments = String(relativePath).split(/[\\/]+/).filter(Boolean);
    if (!segments.length || segments.some((part) => part === "." || part === "..")) {
      throw new TypeError("Unsafe cache path");
    }
    return PathUtils.join(rootPath, ...segments);
  };

  return {
    async readJSON(relativePath) {
      return JSON.parse(await IOUtils.readUTF8(resolve(relativePath)));
    },
    async writeJSONAtomic(relativePath, value) {
      const destination = resolve(relativePath);
      const parent = parentPath(destination, PathUtils);
      await IOUtils.makeDirectory(parent, cloneIntoIO({
        ignoreExisting: true,
        createAncestors: true,
      }));
      const temporary = `${destination}.tmp-${random()}`;
      await IOUtils.writeUTF8(temporary, JSON.stringify(value));
      try {
        await IOUtils.move(
          temporary,
          destination,
          cloneIntoIO({ noOverwrite: false }),
        );
      } catch (error) {
        await IOUtils.remove?.(
          temporary,
          cloneIntoIO({ ignoreAbsent: true }),
        );
        throw error;
      }
    },
    async remove(relativePath) {
      return IOUtils.remove(
        resolve(relativePath),
        cloneIntoIO({ ignoreAbsent: true }),
      );
    },
    async quarantine(relativePath) {
      const source = resolve(relativePath);
      return IOUtils.move(
        source,
        `${source}.corrupt-${Date.now()}`,
        cloneIntoIO({ noOverwrite: true }),
      );
    },
    async list(relativeDirectory) {
      const directory = resolve(relativeDirectory);
      let children;
      try {
        children = await IOUtils.getChildren(directory);
      } catch (error) {
        if (error?.name === "NotFoundError" || error?.code === "ENOENT") return [];
        throw error;
      }
      return Promise.all(
        children.map(async (path) => {
          const stat = await IOUtils.stat(path);
          return {
            path: toRelativePath(path, rootPath),
            size: stat.size,
            lastUsed: stat.lastModified,
            kind: path.includes("confirmed-terms") ? "confirmedTerms" : "document",
          };
        }),
      );
    },
  };
}

export function createLoginInfoFactory(LoginInfo) {
  return ({ origin, realm, username, password }) => {
    const login = new LoginInfo();
    login.init(origin, null, realm, username, password, "", "");
    return login;
  };
}

function field(item, name) {
  return String(item.getField?.(name) ?? "").trim();
}

function formatCreator(creator) {
  const name = creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(" ");
  return String(name ?? "").trim();
}

function emptyMetadata() {
  return { title: "", abstract: "", publicationTitle: "", date: "", creators: [] };
}

function parentPath(path, PathUtils) {
  if (typeof PathUtils.parent === "function") return PathUtils.parent(path);
  return path.replace(/[\\/][^\\/]+$/, "");
}

function toRelativePath(path, rootPath) {
  return path.slice(rootPath.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
}
