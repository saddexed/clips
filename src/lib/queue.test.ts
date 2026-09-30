import { expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function runScenario(scenario: string) {
  const dbFile = path.join(tmpdir(), `clips-queue-${crypto.randomUUID()}.sqlite`);
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, path.join(import.meta.dir, "queue.fixture.ts"), scenario],
      env: { ...process.env, DB: dbFile },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      throw new Error(new TextDecoder().decode(result.stderr));
    }
    expect(result.exitCode).toBe(0);
  } finally {
    await unlink(dbFile).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

test("pausing an active video yields to the next job without changing FIFO or retries", async () => {
  await runScenario("individual");
});

test("global pause holds new jobs, individual resume overrides it, and a new pause resets overrides", async () => {
  await runScenario("global");
});
