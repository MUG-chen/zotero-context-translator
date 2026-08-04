import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { SSEDecoder } from "../addon/content/modules/sse.mjs";

test("decodes a Chinese character split across network chunks", () => {
  const bytes = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"中文"}}]}\r\n\r\ndata: [DONE]\r\n\r\n',
  );
  const firstChineseByte = bytes.indexOf(0xe4);
  const decoder = new SSEDecoder();
  const events = [
    ...decoder.push(bytes.slice(0, firstChineseByte + 1)),
    ...decoder.push(bytes.slice(firstChineseByte + 1)),
    ...decoder.finish(),
  ];

  assert.equal(events[0].choices[0].delta.content, "中文");
  assert.deepEqual(events.at(-1), { done: true });
});

test("joins multiple data lines and ignores comments", () => {
  const decoder = new SSEDecoder();
  const events = decoder.push(
    new TextEncoder().encode(': ping\n' + 'data: {"value":\n' + 'data: 1}\n\n'),
  );

  assert.deepEqual(events, [{ value: 1 }]);
});

test("clones streaming decoder options into Zotero's TextDecoder realm", (t) => {
  const originalCu = globalThis.Cu;
  let cloneCalls = 0;
  globalThis.Cu = {
    getGlobalForObject: () => ({ realm: "decoder" }),
    cloneInto(value, target) {
      cloneCalls += 1;
      assert.deepEqual(value, { stream: true });
      assert.equal(target.realm, "decoder");
      return value;
    },
  };
  t.after(() => {
    if (originalCu === undefined) delete globalThis.Cu;
    else globalThis.Cu = originalCu;
  });

  const decoder = new SSEDecoder();
  decoder.push(new TextEncoder().encode("data: [DONE]\n\n"));
  assert.equal(cloneCalls, 1);
});

test("accepts Uint8Array chunks created in another JavaScript realm", () => {
  const bytes = new TextEncoder().encode("data: [DONE]\n\n");
  const context = vm.createContext({ values: [...bytes] });
  const foreignChunk = vm.runInContext("new Uint8Array(values)", context);
  assert.equal(foreignChunk instanceof Uint8Array, false);

  const decoder = new SSEDecoder();
  assert.deepEqual(decoder.push(foreignChunk), [{ done: true }]);
});
