import { createServer } from "node:http";
import { handleIntakeStream } from "./intake_stream_route.js";

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${port}`}`);

  if (req.method === "POST" && url.pathname === "/matter-intake/stream") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const request = new Request(`http://localhost:${port}${url.pathname}`, {
      method: "POST",
      headers: {
        "content-type": req.headers["content-type"] ?? "application/json"
      },
      body: Buffer.concat(chunks)
    });

    const response = await handleIntakeStream(request);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

    if (response.body) {
      for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
        res.write(Buffer.from(part));
      }
    }

    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, () => {
  console.log(`legal ops server listening on http://localhost:${port}`);
});
