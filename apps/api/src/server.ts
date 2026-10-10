import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { SubmissionService } from "@colorverse/application";
import { DomainError } from "@colorverse/domain";
import { SqlCourseRepository, withoutDraft } from "./course-repository";
import { PrivateMedia } from "./private-media";
import type { CourseDatabase } from "./database";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export interface CourseServerOptions {
  db: CourseDatabase;
  mediaRoot: string;
  origins: string[];
  development: boolean;
}
async function readBody(req: IncomingMessage, limit: number) {
  if (Number(req.headers["content-length"] || 0) > limit) {
    req.resume();
    throw new DomainError("QUOTA_EXCEEDED", "请求内容超过限制");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new DomainError("QUOTA_EXCEEDED", "请求内容超过限制");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export function createCourseServer(options: CourseServerOptions) {
  const repository = new SqlCourseRepository(options.db),
    service = new SubmissionService(repository, hash),
    media = new PrivateMedia(options.mediaRoot, options.db);
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  };
  return createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Cookie");
    try {
      const path = new URL(req.url ?? "/", "http://localhost").pathname,
        method = req.method ?? "GET";
      const write = !["GET", "HEAD"].includes(method);
      if (write && !options.origins.includes(String(req.headers.origin ?? "")))
        throw new DomainError("FORBIDDEN", "请求来源无效");
      const body = async () =>
        JSON.parse(
          (await readBody(req, 128 * 1024)).toString("utf8"),
        ) as unknown;
      if (path === "/api/v1/health" && method === "GET")
        return json(res, 200, {
          status: "ok",
          development: options.development,
        });
      if (
        path === "/api/v1/dev/accounts" &&
        method === "GET" &&
        options.development
      ) {
        const { rows } = await options.db.query(
          "SELECT id,display_name FROM users WHERE auth_issuer='development' AND status='active' ORDER BY id",
        );
        return json(res, 200, {
          accounts: rows.map((r) => ({
            id: r.id,
            displayName: r.display_name,
          })),
        });
      }
      if (
        path === "/api/v1/dev/login" &&
        method === "POST" &&
        options.development
      ) {
        const input = z.strictObject({ userId: z.uuid() }).parse(await body());
        const { rows } = await options.db.query(
          "SELECT id FROM users WHERE id=$1 AND auth_issuer='development' AND status='active'",
          [input.userId],
        );
        if (!rows.length) throw new DomainError("FORBIDDEN", "测试账户不存在");
        const token = randomBytes(32).toString("hex"),
          csrf = randomBytes(24).toString("hex");
        await options.db.query(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)",
          [
            hash(token),
            input.userId,
            csrf,
            new Date(Date.now() + 8 * 3600000).toISOString(),
          ],
        );
        res.setHeader(
          "Set-Cookie",
          `colorverse_session=${token}; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=28800`,
        );
        return json(res, 200, {
          user: await repository.user(input.userId),
          csrfToken: csrf,
          development: true,
        });
      }
      const token = req.headers.cookie
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("colorverse_session="))
        ?.slice("colorverse_session=".length);
      const session = token
        ? await options.db.query(
            "SELECT s.user_id,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now() AND u.status='active'",
            [hash(token)],
          )
        : { rows: [] };
      if (!session.rows[0])
        throw new DomainError("UNAUTHENTICATED", "请先登录课程账户");
      const userId = String(session.rows[0].user_id);
      if (write && req.headers["x-csrf-token"] !== session.rows[0].csrf_token)
        throw new DomainError("FORBIDDEN", "登录已变化，请重新载入后操作");
      if (path === "/api/v1/me" && method === "GET")
        return json(res, 200, {
          user: await repository.user(userId),
          csrfToken: session.rows[0].csrf_token,
          development: options.development,
        });
      if (path === "/api/v1/logout" && method === "POST") {
        await options.db.query("DELETE FROM sessions WHERE token_hash=$1", [
          hash(token!),
        ]);
        res.setHeader(
          "Set-Cookie",
          "colorverse_session=; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=0",
        );
        return json(res, 200, { ok: true });
      }
      if (path === "/api/v1/classes" && method === "GET")
        return json(res, 200, { classes: await repository.classes(userId) });
      if (path === "/api/v1/assets" && method === "POST")
        return json(
          res,
          201,
          await media.upload(
            userId,
            await readBody(req, 20 * 1024 * 1024),
            String(req.headers["x-content-sha256"] ?? ""),
          ),
        );
      const ids = path.split("/");
      if (ids.length >= 5) z.uuid().parse(ids[4]);
      if (ids[3] === "assets" && ids[5] === "display" && method === "GET") {
        const a = await repository.authorizedAsset(userId, ids[4]);
        const bytes = await media.display(a.storageKey);
        res.writeHead(200, {
          "Content-Type": "image/webp",
          "Content-Length": bytes.length,
        });
        return res.end(bytes);
      }
      if (ids[3] === "classes" && ids[5] === "assignments") {
        if (method === "GET")
          return json(res, 200, {
            assignments: await repository.assignments(userId, ids[4]),
          });
        if (method === "POST")
          return json(
            res,
            201,
            await service.createAssignment(userId, ids[4], await body()),
          );
      }
      if (ids[3] === "assignments" && ids[5] === "submissions") {
        if (method === "POST")
          return json(res, 201, await service.open(userId, ids[4]));
        if (method === "GET")
          return json(res, 200, {
            submissions: await repository.summaries(userId, ids[4]),
          });
      }
      if (ids[3] === "submissions") {
        if (ids.length === 5 && method === "GET")
          return json(res, 200, await repository.detail(userId, ids[4]));
        if (ids[5] === "draft" && method === "PUT") {
          const input = z
            .strictObject({
              expectedRevision: z.number().int().nonnegative(),
              draft: z.unknown(),
            })
            .parse(await body());
          return json(
            res,
            200,
            await service.saveDraft(
              userId,
              ids[4],
              input.expectedRevision,
              input.draft,
            ),
          );
        }
        if (ids[5] === "submit" && method === "POST") {
          const input = z
            .strictObject({ expectedRevision: z.number().int().nonnegative() })
            .parse(await body());
          return json(
            res,
            200,
            await service.submit(
              userId,
              ids[4],
              input.expectedRevision,
              String(req.headers["idempotency-key"] ?? ""),
            ),
          );
        }
        if (
          ids[5] === "versions" &&
          ids[7] === "reviews" &&
          method === "POST"
        ) {
          z.uuid().parse(ids[6]);
          const result = await service.review(
            userId,
            ids[4],
            ids[6],
            await body(),
          );
          return json(res, 201, {
            ...result,
            submission: withoutDraft(result.submission),
          });
        }
      }
      throw new DomainError("NOT_FOUND", "接口不存在");
    } catch (error) {
      const invalid =
        error instanceof z.ZodError || error instanceof SyntaxError;
      const pgError = error as { code?: string };
      const code = invalid
        ? "VALIDATION_FAILED"
        : error instanceof DomainError
          ? error.code
          : pgError.code === "23505"
            ? "REVISION_CONFLICT"
            : "INTERNAL_ERROR";
      const status =
        code === "UNAUTHENTICATED"
          ? 401
          : code === "FORBIDDEN"
            ? 403
            : code === "NOT_FOUND"
              ? 404
              : code === "REVISION_CONFLICT"
                ? 409
                : code === "QUOTA_EXCEEDED"
                  ? 413
                  : code === "INTERNAL_ERROR"
                    ? 500
                    : 422;
      const message = invalid
        ? "输入格式不正确，请检查必填项"
        : error instanceof DomainError
          ? error.message
          : code === "REVISION_CONFLICT"
            ? "作业已更新，请重新载入"
            : "暂时无法完成，请稍后重试";
      json(res, status, { error: { code, message, requestId } });
    }
  });
}
