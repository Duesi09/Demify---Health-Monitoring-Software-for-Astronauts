// Copies refreshed snapshots (written by the app after live fetches) into the
// committed seed directory so the next release ships the newest offline data.
//   npm run snapshots:promote
import { promises as fs } from "node:fs";
import path from "node:path";

const from = process.env.DEMIFY_SNAPSHOT_DIR ?? path.join("data", "runtime", "snapshots");
const to = process.env.DEMIFY_SNAPSHOT_SEED_DIR ?? path.join("data", "snapshots");

const files = (await fs.readdir(from).catch(() => [])).filter((f) => f.endsWith(".json"));
if (!files.length) {
  console.log(`No refreshed snapshots in ${from}. Run the app online first.`);
  process.exit(0);
}
await fs.mkdir(to, { recursive: true });
for (const f of files) {
  const raw = await fs.readFile(path.join(from, f), "utf8");
  JSON.parse(raw); // refuse to promote corrupt files
  await fs.writeFile(path.join(to, f), raw);
  console.log(`promoted ${f}`);
}
