// Renders the page's timeline to one H.264 file per scene (same size, rate and settings).
// usage: node render.cjs <page url> <out dir> <workers>
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { renameSync } = require("node:fs");
const [, , url, out, workersArg] = process.argv;
const FPS = 30;

async function renderChunk(browser, name, a, b) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true);
  const tmp = `${out}/${name}.tmp.mp4`;
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), tmp], { stdio: ["pipe", "inherit", "inherit"] });
  const f0 = Math.round(a * FPS), f1 = Math.round(b * FPS);
  for (let f = f0; f < f1; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  await page.close();
  if (code !== 0) throw new Error(`${name}: ffmpeg exited ${code}`);
  renameSync(tmp, `${out}/${name}.mp4`);
  console.log("done", name, f1 - f0, "frames");
}

(async () => {
  const browser = await chromium.launch();
  const probe = await browser.newPage();
  await probe.goto(url);
  await probe.waitForFunction(() => window.ready === true);
  const scenes = await probe.evaluate(() => window.SCENES);
  await probe.close();
  const jobs = scenes.map(([id, a, b]) => [id, a, b]);
  const workers = Number(workersArg || 3);
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < jobs.length) {
      const [id, a, b] = jobs[next++];
      await renderChunk(browser, id, a, b);
    }
  }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
