import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const app = new Hono();

// M0: 관통 배포 검증용. 지도/일정 API는 M1~M3에서 여기 붙는다.
app.get("/healthz", (c) => c.json({ status: "ok", service: "mungchilog-server" }));

app.use("/*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

const port = Number(process.env.PORT ?? 3000);
console.log(`mungchilog server listening on :${port}`);

serve({ fetch: app.fetch, port });
