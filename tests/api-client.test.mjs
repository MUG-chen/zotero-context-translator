import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthenticationError,
  OpenAICompatibleClient,
} from "../addon/content/modules/api-client.mjs";
import {
  sendJSON,
  startFakeOpenAIServer,
} from "./helpers/fake-openai-server.mjs";

function requestFor(baseURL, signal) {
  return {
    baseURL,
    apiKey: "secret",
    model: "test-model",
    messages: [{ role: "user", content: "translate" }],
    signal,
  };
}

test("sends bearer auth and a one-token connection request", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    sendJSON(response, 200, {
      choices: [{ message: { role: "assistant", content: "OK" } }],
    });
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient();

  const result = await client.testConnection({
    baseURL: server.baseURL,
    apiKey: "secret",
    model: "test-model",
  });

  assert.equal(result.ok, true);
  assert.equal(server.requests[0].headers.authorization, "Bearer secret");
  assert.equal(server.requests[0].body.max_tokens, 1);
  assert.equal(server.requests[0].body.stream, false);
  assert.equal(server.requests[0].body.model, "test-model");
});

test("streams visible translation and parses trailing structured data", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const content of [
      "<<<TRANSLATION>>>\n",
      "准确译文\n",
      "<<<TERMS_JSON>>>\n",
      '[{"source":"alignment","translation":"对齐"}]',
    ]) {
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
      );
    }
    response.end("data: [DONE]\n\n");
  });
  t.after(() => server.close());
  const deltas = [];
  const client = new OpenAICompatibleClient();

  const result = await client.streamTranslation(
    {
      baseURL: server.baseURL,
      apiKey: "secret",
      model: "test-model",
      messages: [{ role: "user", content: "translate" }],
    },
    { onDelta: (value) => deltas.push(value) },
  );

  assert.match(deltas.join(""), /准确译文/);
  assert.equal(result.translation, "准确译文");
  assert.deepEqual(result.terms, [
    { source: "alignment", translation: "对齐" },
  ]);
});

test("classifies authentication failures without retrying", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    sendJSON(response, 401, { error: { message: "invalid key" } });
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient();

  await assert.rejects(
    client.streamTranslation({
      baseURL: server.baseURL,
      apiKey: "wrong",
      model: "test-model",
      messages: [],
    }),
    AuthenticationError,
  );
  assert.equal(server.requests.length, 1);
});

test("retries one short rate limit before any content", async (t) => {
  const server = await startFakeOpenAIServer(
    ({ response, requestNumber }) => {
      if (requestNumber === 1) {
        sendJSON(
          response,
          429,
          { error: { message: "slow down" } },
          { "retry-after": "0" },
        );
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "译文" } }] })}\n\ndata: [DONE]\n\n`,
      );
    },
  );
  t.after(() => server.close());
  const client = new OpenAICompatibleClient();

  const result = await client.streamTranslation({
    baseURL: server.baseURL,
    apiKey: "secret",
    model: "test-model",
    messages: [],
  });

  assert.equal(result.translation, "译文");
  assert.equal(server.requests.length, 2);
});

test("keeps the abort signal active until the response stream ends", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "first" } }] })}\n\n`,
    );
    setTimeout(() => response.end("data: [DONE]\n\n"), 80);
  });
  t.after(() => server.close());
  const controller = new AbortController();
  const client = new OpenAICompatibleClient();
  let callbacks = 0;

  await assert.rejects(
    client.streamTranslation(
      {
        baseURL: server.baseURL,
        apiKey: "secret",
        model: "test-model",
        messages: [],
        signal: controller.signal,
      },
      {
        onDelta() {
          callbacks += 1;
          controller.abort();
        },
      },
    ),
    /cancel/i,
  );
  assert.equal(callbacks, 1);
  assert.equal(server.requests.length, 1);
});

test("times out when only SSE keep-alive comments arrive before the first model event", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    const timer = setInterval(() => response.write(": keep-alive\n\n"), 4);
    response.on("close", () => clearInterval(timer));
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({
    timeoutMs: 20,
    firstEventTimeoutMs: 20,
    idleTimeoutMs: 20,
  });

  await assert.rejects(
    client.streamTranslation(requestFor(server.baseURL)),
    (error) => error.code === "FIRST_EVENT_TIMEOUT",
  );
});

test("allows a stream to outlive the first-event deadline while model events stay active", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    const parts = ["一", "段", "译", "文"];
    const emit = (index) => {
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: parts[index] } }] })}\n\n`,
      );
      if (index + 1 < parts.length) setTimeout(() => emit(index + 1), 12);
      else response.end("data: [DONE]\n\n");
    };
    emit(0);
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({
    timeoutMs: 15,
    firstEventTimeoutMs: 15,
    idleTimeoutMs: 30,
  });

  const result = await client.streamTranslation(requestFor(server.baseURL));

  assert.equal(result.translation, "一段译文");
});

test("recovers from two transient 503 responses before model output", async (t) => {
  const progress = [];
  const server = await startFakeOpenAIServer(({ response, requestNumber }) => {
    if (requestNumber < 3) {
      sendJSON(response, 503, { error: { message: "busy" } });
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "恢复后的译文" } }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({ sleep: async () => {} });

  const result = await client.streamTranslation(
    requestFor(server.baseURL),
    { onProgress: (event) => progress.push(event) },
  );

  assert.equal(result.translation, "恢复后的译文");
  assert.equal(server.requests.length, 3);
  assert.deepEqual(
    progress
      .filter((event) => event.phase === "retrying")
      .map((event) => [event.attempt, event.status]),
    [[2, 503], [3, 503]],
  );
});

test("does not retry a broken stream after a model event", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "部分译文" } }] })}\n\n`,
    );
    setTimeout(() => response.destroy(), 5);
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({ sleep: async () => {} });

  await assert.rejects(
    client.streamTranslation(requestFor(server.baseURL)),
  );
  assert.equal(server.requests.length, 1);
});

test("retries a pre-response network failure before any model event", async () => {
  let attempts = 0;
  const progress = [];
  const client = new OpenAICompatibleClient({
    sleep: async () => {},
    async fetchImpl() {
      attempts += 1;
      if (attempts < 3) throw new TypeError("socket reset before response");
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "网络恢复" } }] })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    },
  });

  const result = await client.streamTranslation(
    requestFor("https://api.example.com/v1"),
    { onProgress: (event) => progress.push(event) },
  );

  assert.equal(result.translation, "网络恢复");
  assert.equal(attempts, 3);
  assert.deepEqual(
    progress.filter((event) => event.phase === "retrying").map((event) => event.attempt),
    [2, 3],
  );
});

test("reports reasoning as progress without exposing chain-of-thought text", async (t) => {
  const progress = [];
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "private reasoning" } }] })}\n\n`,
    );
    response.end(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "最终译文" } }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient();

  const result = await client.streamTranslation(
    requestFor(server.baseURL),
    { onProgress: (event) => progress.push(event) },
  );

  assert.equal(result.translation, "最终译文");
  assert.ok(progress.some((event) => event.phase === "reasoning"));
  assert.ok(progress.some((event) => event.phase === "streaming"));
  assert.doesNotMatch(JSON.stringify(progress), /private reasoning/);
});

test("classifies an inactive model stream separately from first-response timeout", async (t) => {
  const deltas = [];
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "部分内容" } }] })}\n\n`,
    );
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({
    firstEventTimeoutMs: 30,
    idleTimeoutMs: 20,
  });

  await assert.rejects(
    client.streamTranslation(
      requestFor(server.baseURL),
      { onDelta: (delta) => deltas.push(delta) },
    ),
    (error) =>
      error.code === "IDLE_TIMEOUT" &&
      error.attempt === 1 &&
      error.maxAttempts === 3,
  );
  assert.equal(deltas.join(""), "部分内容");
  assert.equal(server.requests.length, 1);
});

for (const status of [502, 504]) {
  test(`retries transient HTTP ${status} before model output`, async (t) => {
    const server = await startFakeOpenAIServer(({ response, requestNumber }) => {
      if (requestNumber === 1) {
        sendJSON(response, status, { error: { message: "temporary" } });
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "成功" } }] })}\n\ndata: [DONE]\n\n`,
      );
    });
    t.after(() => server.close());
    const client = new OpenAICompatibleClient({ sleep: async () => {} });

    const result = await client.streamTranslation(requestFor(server.baseURL));

    assert.equal(result.translation, "成功");
    assert.equal(server.requests.length, 2);
  });
}

test("reports final attempt metadata after transient retries are exhausted", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    sendJSON(response, 503, { error: { message: "still busy" } });
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({ sleep: async () => {} });

  await assert.rejects(
    client.streamTranslation(requestFor(server.baseURL)),
    (error) =>
      error.status === 503 && error.attempt === 3 && error.maxAttempts === 3,
  );
  assert.equal(server.requests.length, 3);
});

for (const status of [429, 503]) {
  test(`cancels immediately while waiting to retry HTTP ${status}`, async (t) => {
    const retryStarted = deferredSignal();
    const server = await startFakeOpenAIServer(({ response }) => {
      sendJSON(
        response,
        status,
        { error: { message: "wait before retry" } },
        status === 429 ? { "retry-after": "15" } : {},
      );
    });
    t.after(() => server.close());
    const controller = new AbortController();
    const client = new OpenAICompatibleClient({
      sleep: () => new Promise(() => {}),
    });

    const translation = client.streamTranslation(
      requestFor(server.baseURL, controller.signal),
      {
        onProgress(event) {
          if (event.phase === "retrying") retryStarted.resolve();
        },
      },
    );
    await retryStarted.promise;
    controller.abort();

    const outcome = await Promise.race([
      translation.then(
        () => ({ kind: "resolved" }),
        (error) => ({ kind: "rejected", error }),
      ),
      new Promise((resolve) =>
        setTimeout(() => resolve({ kind: "did-not-settle" }), 250),
      ),
    ]);
    assert.equal(outcome.kind, "rejected");
    assert.match(outcome.error.message, /cancel/i);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(server.requests.length, 1);
  });
}

function deferredSignal() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
