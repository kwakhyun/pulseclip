import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

test("uses a direct installer download and keeps the product preview tilt static", async () => {
  const [appSource, styles, document] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);

  const installerPath =
    "releases/download/v0.1.0/PulseClip-0.1.0-Setup.exe";

  assert.ok(
    appSource.includes(
      "releases/download/v${RELEASE_VERSION}/PulseClip-${RELEASE_VERSION}-Setup.exe",
    ),
  );
  assert.ok(document.includes(installerPath));
  assert.doesNotMatch(appSource, /handleProductMove|resetProduct|onPointerLeave/);
  assert.doesNotMatch(styles, /--tilt-[xy]|product-stage:hover/);
});

test("uses natural Korean copy across the landing page and SEO metadata", async () => {
  const [appSource, document] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /플레이에 집중하세요\./);
  assert.match(appSource, /명장면은 F8로 남기세요\./);
  assert.match(appSource, /바로 전 45초가 저장됩니다\./);
  assert.match(document, /계정 가입이나 클라우드 업로드가 필요 없습니다\./);

  for (const awkwardCopy of [
    "게임은 계속.",
    "기록은 이미 완료.",
    "최근 45초가 남습니다.",
    "설정은 한 번.",
    "다음 명장면에서는,",
  ]) {
    assert.ok(!appSource.includes(awkwardCopy));
  }

  assert.ok(!document.includes("게임은 계속. 기록은 이미 완료."));
});

test("ships a production CSP without development connection permissions", async () => {
  const document = await readFile(
    new URL("../dist/client/index.html", import.meta.url),
    "utf8",
  );
  assert.ok(document.includes("connect-src 'none';"));
  assert.ok(!document.includes("__PULSECLIP_LANDING_CONNECT_SRC__"));
  assert.ok(!document.includes("ws://localhost"));
});
