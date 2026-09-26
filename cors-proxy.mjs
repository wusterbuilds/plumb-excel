import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import path from "node:path";
import os from "node:os";

const PORT = 8080;

const certDir = path.join(os.homedir(), ".office-addin-dev-certs");
const certPath = path.join(certDir, "localhost.crt");
const keyPath = path.join(certDir, "localhost.key");

function handleRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const protocol = req.socket.encrypted ? "https" : "http";
  const reqUrl = new URL(req.url, `${protocol}://localhost:${PORT}`);
  const targetUrl = reqUrl.searchParams.get("url");

  if (!targetUrl) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing ?url= parameter");
    return;
  }

  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid target URL");
    return;
  }

  const transport = target.protocol === "https:" ? https : http;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;

  const proxyReq = transport.request(
    target,
    {
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const proxyHeaders = { ...proxyRes.headers };
      proxyHeaders["access-control-allow-origin"] = "*";
      delete proxyHeaders["x-frame-options"];
      delete proxyHeaders["content-security-policy"];
      res.writeHead(proxyRes.statusCode, proxyHeaders);
      proxyRes.pipe(res, { end: true });
    },
  );

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(proxyReq, { end: true });
}

const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

if (hasCerts) {
  const tlsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  const server = https.createServer(tlsOptions, handleRequest);
  server.listen(PORT, () => {
    console.log(`CORS proxy running at https://localhost:${PORT} (TLS)`);
    console.log(`Usage: https://localhost:${PORT}/?url=<encoded_url>`);
  });
} else {
  console.warn("Office Add-in dev certs not found — falling back to HTTP.");
  console.warn(`Expected: ${certPath}`);
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`CORS proxy running at http://localhost:${PORT}`);
    console.log(`Usage: http://localhost:${PORT}/?url=<encoded_url>`);
  });
}
