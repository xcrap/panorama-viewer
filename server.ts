import index from "./index.html";

const isProd = process.env.NODE_ENV === "production";
const explicitPort = process.env.PORT ? Number(process.env.PORT) : null;

function serve(port: number) {
  return Bun.serve({
    port,
    routes: {
      "/*": index,
    },
    development: isProd ? false : { hmr: true, console: true },
  });
}

function start() {
  // An explicit PORT is honoured exactly; otherwise take the first free port from 3000.
  if (explicitPort !== null) return serve(explicitPort);
  for (let port = 3000; port < 3020; port++) {
    try {
      return serve(port);
    } catch (err) {
      if ((err as { code?: string }).code !== "EADDRINUSE") throw err;
    }
  }
  return serve(0);
}

const server = start();
console.log(`Panorama viewer running at ${server.url}`);
