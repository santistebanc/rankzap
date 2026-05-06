import { chromium, devices } from "playwright";

const baseUrl = "http://127.0.0.1:4173/";

async function captureDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: "/tmp/voter-home-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "Create a poll" }).click();
  await page.waitForURL(/\/[^/]+\/admin$/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "/tmp/voter-admin-desktop.png", fullPage: true });

  const adminUrl = page.url();
  const voteUrl = adminUrl.replace(/\/admin$/, "");
  await page.goto(voteUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: "/tmp/voter-vote-desktop.png", fullPage: true });

  await page.close();
}

async function captureMobile(browser) {
  const page = await browser.newPage({
    ...devices["iPhone 13"],
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: "/tmp/voter-home-mobile.png", fullPage: true });
  await page.close();
}

const browser = await chromium.launch();

try {
  await captureDesktop(browser);
  await captureMobile(browser);
  console.log("Saved screenshots to /tmp");
} finally {
  await browser.close();
}
