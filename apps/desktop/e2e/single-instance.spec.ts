import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

let work: string;
test.beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'travelbook-e2e-single-'));
});
test.afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

test('a second launch on the same user data exits and leaves the first window alone', async () => {
  const userData = join(work, 'user data');
  const app = await launchApp(userData);
  try {
    const page = await app.firstWindow();
    await expect(page.locator('h1')).toHaveText('travelbook');
    const execPath = await app.evaluate(() => process.execPath);

    // The same command line as the first instance (same app folder, same user data).
    const env = { ...process.env } as Record<string, string>;
    delete env['ELECTRON_RUN_AS_NODE'];
    const second = spawn(
      execPath,
      [join(import.meta.dirname, '..'), `--user-data-dir=${userData}`],
      {
        env,
        stdio: 'ignore',
      },
    );
    const exit = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        second.kill('SIGKILL');
        reject(new Error('The second instance did not exit'));
      }, 20_000);
      second.once('error', reject);
      second.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    expect(exit).toBe(0);

    // Still one window, still alive, and not minimized: the first instance was asked to focus it.
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(await page.locator('h1').textContent()).toBe('travelbook');
  } finally {
    await app.close();
  }
});
