import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";
import { CHECKSUM_URL, DEVELOPMENT_VERSION, DOWNLOAD_URL, installers, RELEASE_VERSION } from "../src/release.js";

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

test("keeps visible downloads and search metadata on the published release", async () => {
  const document = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  const schema = JSON.parse(document.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const software = schema["@graph"].find(item => item["@type"] === "SoftwareApplication");
  assert.equal(software.softwareVersion, RELEASE_VERSION);
  assert.equal(software.downloadUrl, DOWNLOAD_URL);
  const downloads = [...document.matchAll(/href="([^"]+\/releases\/download\/[^"]+)"/g)].map(match => match[1]);
  assert.ok(downloads.includes(DOWNLOAD_URL));
  for (const installer of installers) assert.ok(downloads.includes(installer.url));
  assert.ok(downloads.includes(CHECKSUM_URL));
  assert.ok(downloads.every(url => new URL(url).pathname.includes(`/download/v${RELEASE_VERSION}/`)));
  assert.doesNotMatch(document, /__PULSECLIP_[A-Z_]+__/);
});

test("prerenders essential information and distinguishes upcoming features", async () => {
  const document = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  const text = document.replace(/<!--.*?-->/g, "");
  assert.match(text, /리플레이를 미리 켜두/);
  assert.match(text, /기본 설정에서는 F8을 누르면 바로 전 45초가 저장됩니다/);
  assert.match(text, /SmartScreen/);
  assert.match(text, /현재 PC의 진단 결과가 아니며/);
  assert.ok(text.includes(`v${DEVELOPMENT_VERSION}에서 준비한 변화`));
  assert.ok(text.includes(`아래 기능은 공개 베타 v${RELEASE_VERSION}에 포함되지 않습니다.`));
  assert.doesNotMatch(text, /3개 항목 정상|명장면을 놓쳤다면|게임 성능을 방해하지/);
});

test("preserves navigation anchors, local images and the static product preview", async () => {
  const [document, styles] = await Promise.all([
    readFile(new URL("../dist/client/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  for (const [, anchor] of document.matchAll(/href="#([^"]+)"/g)) assert.ok(document.includes(`id="${anchor}"`));
  for (const [, source] of document.matchAll(/<img[^>]+src="(\.[^"]+)"/g)) await access(new URL(`../dist/client/${source}`, import.meta.url));
  assert.doesNotMatch(styles, /--tilt-[xy]|product-stage:hover/);
  assert.match(styles, /prefers-reduced-motion/);
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
