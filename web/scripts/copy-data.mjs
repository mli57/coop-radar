// Copies the scraper's output next to the site, so dev and build both serve the real data.
import { copyFile, mkdir } from "node:fs/promises";

const from = new URL("../../data/", import.meta.url);
const to = new URL("../public/data/", import.meta.url);

await mkdir(to, { recursive: true });
for (const file of ["postings.json", "companies.json"]) {
  await copyFile(new URL(file, from), new URL(file, to));
}
