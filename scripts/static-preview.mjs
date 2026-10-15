import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(
    process.argv.slice(2).find((a) => a !== "--open") ??
      fileURLToPath(new URL(".", import.meta.url)),
  ),
  port = 5198;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
};
const server = http.createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const path = decodeURIComponent(
        new URL(req.url, "http://127.0.0.1").pathname,
      ),
      file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
      throw new Error("NOT_FOUND");
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end("File not found");
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(
    `Static exhibition: http://127.0.0.1:${port} (no classroom backend)`,
  );
  if (process.argv.includes("--open")) {
    const url = `http://127.0.0.1:${port}`;
    const child =
      process.platform === "win32"
        ? spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
            windowsHide: true,
            stdio: "ignore",
          })
        : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
            stdio: "ignore",
          });
    child.on("error", () => console.log(`Open ${url} in your browser.`));
  }
});
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? "Port 5198 is occupied. Close the previous preview and retry."
      : "Preview server failed.",
  );
  process.exitCode = 1;
});
