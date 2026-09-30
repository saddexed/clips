import { expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("settings persist scalar and array values and reset to defaults", async () => {
  const dbFile = path.join(tmpdir(), `clips-settings-${crypto.randomUUID()}.sqlite`);
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, path.join(import.meta.dir, "settings.fixture.ts")],
      env: { ...process.env, DB: dbFile },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(0);
  } finally {
    await unlink(dbFile).catch(() => {});
  }
});
