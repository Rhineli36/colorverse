import { createServer } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { handleRequest, type WorkerEnvironment } from "../../worker/src/index";

export async function staticAssets(root: string) {
  const directory = await realpath(root);
  return {
    async fetch(request: Request) {
      if (!["GET", "HEAD"].includes(request.method))
        return new Response("Method not allowed", { status: 405 });
      let path: string;
      try {
        path = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response("Invalid path", { status: 400 });
      }
      if (
        path.includes("\\") ||
        path.includes("\0") ||
        path.split("/").some((p) => p.startsWith(".") || p === "..")
      )
        return new Response("Not found", { status: 404 });
      const file = resolve(directory, "." + path);
      if (file !== directory && !file.startsWith(directory + sep))
        return new Response("Not found", { status: 404 });
      let target = file;
      try {
        target = await realpath(file);
        if (target !== directory && !target.startsWith(directory + sep))
          return new Response("Not found", { status: 404 });
      } catch {
        if (path.startsWith("/assets/") || extname(path))
          return new Response("Not found", { status: 404 });
        target = resolve(directory, "index.html");
      }
      if (target === directory) target = resolve(directory, "index.html");
      try {
        const bytes = await readFile(target),
          extension = extname(target);
        const mime: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json",
          ".webp": "image/webp",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
        };
        return new Response(request.method === "HEAD" ? null : bytes, {
          headers: {
            "Content-Type": mime[extension] ?? "application/octet-stream",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": path.startsWith("/assets/")
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  };
}
export function createPortableServer(
  env: WorkerEnvironment,
  origin: string,
  handler = handleRequest,
) {
  const base = new URL(origin);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new Error("INVALID_PUBLIC_ORIGIN");
  return createServer(async (req, res) => {
    try {
      if (!req.url?.startsWith("/") || req.url.startsWith("//")) {
        res.writeHead(400);
        res.end();
        return;
      }
      if (Number(req.headers["content-length"]) > 8388608 + 16384) {
        res.writeHead(413);
        res.end();
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(",") : value);
      const options: RequestInit & { duplex?: "half" } = {
        method: req.method,
        headers,
      };
      if (!["GET", "HEAD"].includes(req.method ?? "GET")) {
        options.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
        options.duplex = "half";
      }
      const response = await handler(
        new Request(new URL(req.url, base), options),
        env,
      );
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      );
      if (!response.body || req.method === "HEAD") {
        res.end();
        return;
      }
      const body = Readable.fromWeb(
        response.body as NodeReadableStream<Uint8Array>,
      );
      res.on("close", () => body.destroy());
      body.on("error", () => res.destroy());
      body.pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(503, { "Cache-Control": "no-store" });
      res.end();
    }
  });
}
