import { expect, it, vi } from "vitest";
import { gatewayRequest } from "../apps/worker/src/domain-gateway";
function setup() {
  return {
    CLASSROOM: {
      fetch: vi.fn(
        async () =>
          new Response("classroom", {
            headers: { "Content-Type": "text/javascript" },
          }),
      ),
    },
    COMPETITION: { fetch: vi.fn(async () => new Response("competition")) },
    REVIEW_SUBJECTS: JSON.stringify(["judge"]),
    REVIEW_CLASS_IDS: JSON.stringify(["review-class"]),
  };
}
const token = (sub: string) =>
  "Bearer e30." + btoa(JSON.stringify({ sub })) + ".test";
it("keeps review/exhibition and review APIs on frozen service without redirecting classroom", async () => {
  const env = setup();
  for (const path of [
    "/review",
    "/review/",
    "/review/release.json",
    "/exhibition/assets/a.js",
  ]) {
    expect(
      await (
        await gatewayRequest(
          new Request("https://colorverse.de5.net" + path),
          env,
        )
      ).text(),
    ).toBe("competition");
  }
  for (const path of [
    "/",
    "/color-mystery/lab/color-weight",
    "/release.json",
    "/reviewing",
  ]) {
    expect(
      await (
        await gatewayRequest(
          new Request("https://colorverse.de5.net" + path),
          env,
        )
      ).text(),
    ).toBe("classroom");
  }
  for (const path of [
    "/api/v1/cloud/session",
    "/api/v1/cloud/classes/review-class/planets",
  ]) {
    expect(
      await (
        await gatewayRequest(
          new Request("https://colorverse.de5.net" + path, {
            headers: { Authorization: token("judge") },
          }),
          env,
        )
      ).text(),
    ).toBe("competition");
  }
  expect(
    await (
      await gatewayRequest(
        new Request("https://colorverse.de5.net/api/v1/cloud/session", {
          headers: {
            Authorization: token("student"),
            Referer: "https://colorverse.de5.net/review/",
          },
        }),
        env,
      )
    ).text(),
  ).toBe("classroom");
});
it("preserves the original URL, request body and Origin; falls back only for absent hashed chunks", async () => {
  const env = setup(),
    r = new Request(
      "https://colorverse.de5.net/api/v1/cloud/account/password",
      {
        method: "POST",
        headers: { Origin: "https://colorverse.de5.net" },
        body: "{}",
      },
    );
  await gatewayRequest(r, env);
  expect(env.CLASSROOM.fetch).toHaveBeenCalledWith(r);
  expect(await r.text()).toBe("{}");
  env.CLASSROOM.fetch.mockImplementationOnce(
    async () =>
      new Response("SPA", { headers: { "Content-Type": "text/html" } }),
  );
  expect(
    await (
      await gatewayRequest(
        new Request("https://colorverse.de5.net/assets/old.js"),
        env,
      )
    ).text(),
  ).toBe("competition");
});
it("keeps legacy page-relative images on old assets and never treats a root navigation as review", async () => {
  const env = setup(),
    headers = { Referer: "https://colorverse.de5.net/review/" };
  expect(
    await (
      await gatewayRequest(
        new Request("https://colorverse.de5.net/competition/manifest.json", {
          headers,
        }),
        env,
      )
    ).text(),
  ).toBe("competition");
  expect(
    await (
      await gatewayRequest(
        new Request("https://colorverse.de5.net/", { headers }),
        env,
      )
    ).text(),
  ).toBe("classroom");
  expect(
    await (
      await gatewayRequest(
        new Request("https://colorverse.de5.net/api/v1/cloud/session", {
          headers: { Authorization: "Bearer invalid" },
        }),
        env,
      )
    ).text(),
  ).toBe("classroom");
});
