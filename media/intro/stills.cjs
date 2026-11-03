const { chromium } = require("playwright");
(async () => {
const [, , page_url, out, ...times] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(page_url);
await page.waitForFunction(() => window.ready === true);
for (const t of times) {
  await page.evaluate((x) => window.render(x), Number(t));
  await page.screenshot({ path: `${out}/still-${t}.jpg`, type: "jpeg", quality: 85 });
}
console.log("errors:", errors.length ? errors.join("\n") : "none");
await browser.close();
})();
