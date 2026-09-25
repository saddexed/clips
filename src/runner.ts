const port = process.env.PORT?.trim();
const startArgs = ["bun", "run", "start"];
if (port) {
  startArgs.push("-p", port);
}

const web = Bun.spawn(startArgs, {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

const worker = Bun.spawn(["bun", "run", "worker:start"], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

function cleanup() {
  try {
    web.kill();
  } catch {}
  try {
    worker.kill();
  } catch {}
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

await Promise.all([web.exited, worker.exited]);

export {};
