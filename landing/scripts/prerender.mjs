import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const htmlPath = path.join(projectRoot, "dist", "client", "index.html");
const serverEntryPath = path.join(projectRoot, "dist", "ssr", "entry-server.js");
const rootMarker = '<div id="root"></div>';

const template = await readFile(htmlPath, "utf8");
if (!template.includes(rootMarker)) {
  throw new Error(`Unable to prerender: ${rootMarker} was not found in ${htmlPath}`);
}

const { render } = await import(pathToFileURL(serverEntryPath).href);
const appMarkup = render();
const prerendered = template.replace(rootMarker, `<div id="root">${appMarkup}</div>`);

await writeFile(htmlPath, prerendered, "utf8");
console.log(`Prerendered PulseClip landing page into ${htmlPath}`);
