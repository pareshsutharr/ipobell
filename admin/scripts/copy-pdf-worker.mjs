// Copies pdf.js's worker next to the app (public/pdf.worker.min.mjs) so the browser can load it from our own
// origin. Run before every dev start and build, so the worker always matches the installed pdfjs-dist version.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const to = join(root, "public/pdf.worker.min.mjs");
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
const { version } = JSON.parse(readFileSync(join(root, "node_modules/pdfjs-dist/package.json"), "utf8"));
console.log(`pdf.js worker ${version} copied to public/pdf.worker.min.mjs`);
