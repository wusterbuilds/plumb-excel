import https from "node:https";
import cors from "cors";
import express from "express";
import { createRouter } from "./routes.js";

const DEFAULT_PORT = 3456;

async function getHttpsOptions() {
  try {
    const devCerts = await import("office-addin-dev-certs");
    const certs = await devCerts.getHttpsServerOptions();
    return { ca: certs.ca, key: certs.key, cert: certs.cert };
  } catch {
    console.warn("Could not load office-addin-dev-certs, HTTPS disabled");
    return null;
  }
}

async function main() {
  const portArg = process.argv.find((a) => a.startsWith("--port="));
  const port = portArg
    ? Number.parseInt(portArg.split("=")[1], 10)
    : DEFAULT_PORT;

  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );

  app.use(createRouter());

  const httpsOpts = await getHttpsOptions();

  if (httpsOpts) {
    https.createServer(httpsOpts, app).listen(port, () => {
      console.log(`File server running at https://localhost:${port}`);
      console.log("Endpoints:");
      console.log(`  GET https://localhost:${port}/api/health`);
      console.log(
        `  GET https://localhost:${port}/api/tree?root=/path/to/folder`,
      );
      console.log(
        `  GET https://localhost:${port}/api/file?root=/path&path=relative/file`,
      );
    });
  } else {
    app.listen(port, () => {
      console.log(`File server running at http://localhost:${port} (no HTTPS)`);
    });
  }
}

main().catch((err) => {
  console.error("Failed to start file server:", err);
  process.exit(1);
});
