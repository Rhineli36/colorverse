import {
  app,
  BrowserWindow,
  dialog,
  net,
  protocol,
  session,
  screen,
  shell,
} from "electron";
import { stat, mkdir, appendFile } from "node:fs/promises";
import { join, resolve, sep, extname } from "node:path";
import { pathToFileURL } from "node:url";

const testing = process.env.COLORVERSE_DESKTOP_TEST === "1";
app.setName("色彩星球");
app.setPath(
  "userData",
  testing && process.env.COLORVERSE_TEST_USER_DATA
    ? resolve(process.env.COLORVERSE_TEST_USER_DATA)
    : join(app.getPath("appData"), "ColorverseOffline"),
);
if (testing) {
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", "9250");
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "colorverse",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
const origin = "colorverse://app/";
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
// Pixi's shader/uniform generators use Function; renderer Node access remains disabled.
const csp =
  "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'";
let window;
async function log(message) {
  try {
    await mkdir(app.getPath("userData"), { recursive: true });
    await appendFile(
      join(app.getPath("userData"), "desktop.log"),
      `${new Date().toISOString()} ${message}\n`,
    );
  } catch {
    /* A diagnostic failure must not stop the exhibition. */
  }
}
const internal = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "colorverse:" && u.host === "app";
  } catch {
    return false;
  }
};
function openReference(url) {
  try {
    const u = new URL(url);
    if (["https:", "http:"].includes(u.protocol))
      void shell.openExternal(u.href);
  } catch {
    /* Ignore malformed links. */
  }
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    if (window && !testing) {
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const site = resolve(app.getAppPath(), "site");
      protocol.handle("colorverse", async (request) => {
        try {
          const url = new URL(request.url);
          if (
            !internal(request.url) ||
            !["GET", "HEAD"].includes(request.method)
          )
            return new Response(null, { status: 403 });
          const pathname = decodeURIComponent(url.pathname);
          if (pathname.includes("\\") || pathname.includes("\0"))
            return new Response(null, { status: 400 });
          const file = resolve(
            site,
            "." + (pathname === "/" ? "/index.html" : pathname),
          );
          if (!file.startsWith(site + sep) || !(await stat(file)).isFile())
            return new Response(null, { status: 404 });
          const response = await net.fetch(pathToFileURL(file).toString(), {
            headers: request.headers,
          });
          const headers = new Headers(response.headers);
          headers.set(
            "Content-Type",
            types[extname(file)] ?? "application/octet-stream",
          );
          headers.set("Content-Security-Policy", csp);
          headers.set("X-Content-Type-Options", "nosniff");
          headers.set("Cache-Control", "no-cache");
          return new Response(
            request.method === "HEAD" ? null : response.body,
            { status: response.status, headers },
          );
        } catch {
          return new Response(null, { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (_details, callback) => callback({ cancel: true }),
      );
      const area = screen.getPrimaryDisplay().workAreaSize;
      window = new BrowserWindow({
        title: "色彩星球",
        width: Math.min(1440, area.width),
        height: Math.min(960, area.height),
        minWidth: Math.min(900, area.width),
        minHeight: Math.min(650, area.height),
        show: false,
        backgroundColor: "#07121e",
        autoHideMenuBar: true,
        icon: join(app.getAppPath(), "icon.png"),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webviewTag: false,
          webSecurity: true,
          spellcheck: false,
        },
      });
      window.removeMenu();
      window.webContents.setWindowOpenHandler(({ url }) => {
        openReference(url);
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (!internal(url)) {
          event.preventDefault();
          openReference(url);
        }
      });
      window.webContents.on("render-process-gone", (_event, details) => {
        void log(`renderer ${details.reason}`);
        dialog.showErrorBox(
          "色彩星球",
          "画面意外关闭，请重新打开程序。已保存的体验数据会保留。",
        );
      });
      window.once("ready-to-show", () => {
        if (!testing) window.show();
      });
      await window.loadURL(origin);
      await log(`started ${app.getVersion()} / ${process.versions.electron}`);
    })
    .catch(async (error) => {
      await log(String(error));
      dialog.showErrorBox(
        "色彩星球启动失败",
        "请重新打开程序。如仍无法启动，请联系项目负责人，并提供本机 ColorverseOffline 目录中的 desktop.log。",
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    void session.defaultSession?.flushStorageData();
  });
}
