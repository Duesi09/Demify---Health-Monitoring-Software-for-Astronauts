// Small built-in MQTT broker (aedes) on 127.0.0.1:1883, so the demo runs on a
// laptop without Docker. Same role as the Mosquitto container: local only.
import { createServer } from "node:net";
import { Aedes } from "aedes";
import { stamp } from "./lib/env.mjs";

const PORT = Number(process.env.BROKER_PORT || 1883);
const aedes = await Aedes.createBroker();
const server = createServer(aedes.handle);
server.on("error", (err) => {
  console.error(`${stamp()} broker: ${err.code === "EADDRINUSE" ? `port ${PORT} already in use (another broker running? then this one is not needed)` : err.message}`);
  process.exit(1);
});
server.listen(PORT, "127.0.0.1", () => console.log(`${stamp()} built-in MQTT broker on 127.0.0.1:${PORT}`));
aedes.on("client", (c) => console.log(`${stamp()} broker: client ${c.id.slice(0, 24)} connected`));

function stop() {
  server.close();
  aedes.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
