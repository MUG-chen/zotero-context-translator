export class SSEDecoder {
  #decoder = new TextDecoder();
  #buffer = "";

  push(chunk) {
    if (!chunk || typeof chunk.byteLength !== "number") {
      throw new TypeError("SSE chunks must be Uint8Array values");
    }
    this.#buffer += this.#decoder.decode(
      chunk,
      decoderOptions(this.#decoder, { stream: true }),
    );
    return this.#drain(false);
  }

  finish() {
    this.#buffer += this.#decoder.decode();
    return this.#drain(true);
  }

  #drain(flush) {
    const events = [];
    let match;
    while ((match = /\r?\n\r?\n/.exec(this.#buffer))) {
      const block = this.#buffer.slice(0, match.index);
      this.#buffer = this.#buffer.slice(match.index + match[0].length);
      const event = parseEventBlock(block);
      if (event !== null) events.push(event);
    }

    if (flush && this.#buffer.trim()) {
      const event = parseEventBlock(this.#buffer);
      if (event !== null) events.push(event);
      this.#buffer = "";
    }
    return events;
  }
}

function decoderOptions(decoder, options) {
  const components = globalThis.Cu;
  if (!components?.cloneInto || !components?.getGlobalForObject) return options;
  return components.cloneInto(options, components.getGlobalForObject(decoder));
}

function parseEventBlock(block) {
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    if (line === "data") {
      dataLines.push("");
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (!dataLines.length) return null;
  const data = dataLines.join("\n").trim();
  if (data === "[DONE]") return { done: true };
  return JSON.parse(data);
}
