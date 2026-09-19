import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/styles.css", ["styles.css", "text/css"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
  ...["app", "main", "planner", "storage", "demo"].map((name) => [
    `/src/${name}.js`,
    [`src/${name}.js`, "text/javascript"],
  ]),
]);

export function createAppServer() {
  return createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }
    let pathname;
    try {
      pathname = new URL(request.url, "http://localhost").pathname;
    } catch {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }
    const asset = assets.get(pathname);
    if (!asset) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    try {
      const body = await readFile(new URL(`../${asset[0]}`, import.meta.url));
      response.writeHead(200, {
        "Content-Type": `${asset[1]}; charset=utf-8`,
        "Content-Length": body.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      console.error(
        `Application asset unavailable: ${error.code ?? "unknown error"}`,
      );
      response.writeHead(500);
      response.end("Application file unavailable");
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.argv[2] ?? 4174);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error("Укажите порт от 1024 до 65535: npm start -- 4174");
    process.exitCode = 1;
  } else {
    const server = createAppServer();
    server.on("error", (error) => {
      console.error(
        `Сервер не запущен: ${error.code}. Попробуйте другой порт: npm start -- 4175`,
      );
      process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () =>
      console.log(`Sprint Map: http://127.0.0.1:${port}`),
    );
  }
}
