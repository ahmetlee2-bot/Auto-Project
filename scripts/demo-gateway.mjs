import http from "node:http";
import https from "node:https";

const port = Number(process.env.DEMO_GATEWAY_PORT ?? 8080);
const frontendTarget = new URL(process.env.DEMO_FRONTEND_TARGET ?? "http://127.0.0.1:3000");
const backendTarget = new URL(process.env.DEMO_BACKEND_TARGET ?? "http://127.0.0.1:8000");
const demoUsername = process.env.DEMO_USERNAME ?? "demo";
const demoPassword = process.env.DEMO_PASSWORD ?? "autonow-demo";
const authHeader = `Basic ${Buffer.from(`${demoUsername}:${demoPassword}`).toString("base64")}`;

const server = http.createServer((request, response) => {
  if (!isAuthorized(request)) {
    response.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="AUTONOW Demo"',
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Authentication required.");
    return;
  }

  if (request.url === "/_demo/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const target = shouldUseBackend(request.url ?? "") ? backendTarget : frontendTarget;
  proxyRequest(request, response, target);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AUTONOW demo gateway listening on http://0.0.0.0:${port}`);
  console.log(`Protected demo credentials username='${demoUsername}' password='${demoPassword}'`);
  console.log(`Frontend target: ${frontendTarget.toString()}`);
  console.log(`Backend target: ${backendTarget.toString()}`);
});


function isAuthorized(request) {
  const header = request.headers.authorization ?? "";
  return header === authHeader;
}


function shouldUseBackend(urlPath) {
  return urlPath.startsWith("/api/") || urlPath === "/health";
}


function proxyRequest(clientRequest, clientResponse, target) {
  const transport = target.protocol === "https:" ? https : http;
  const headers = { ...clientRequest.headers, host: target.host };

  const upstreamRequest = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: clientRequest.method,
      path: clientRequest.url,
      headers,
    },
    (upstreamResponse) => {
      clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(clientResponse);
    },
  );

  upstreamRequest.on("error", (error) => {
    clientResponse.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    clientResponse.end(`Gateway upstream error: ${error.message}`);
  });

  clientRequest.pipe(upstreamRequest);
}
