import { createApp } from "./app";
import { logger } from "./lib/logger";
import { parsePort } from "./lib/port";

const port = parsePort(process.env["PORT"]);
const host = "0.0.0.0";
const app = createApp();

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ host, port }, "Server listening");
});
