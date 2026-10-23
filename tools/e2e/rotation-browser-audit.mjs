#!/usr/bin/env node
// Remote-only, UI-driven BBGM smoke audit. Run against a disposable dev server:
//   BBGM_E2E_BASE_URL=http://127.0.0.1:3000 node tools/e2e/rotation-browser-audit.mjs
// The BrowserContext is isolated and destroyed on exit. The base URL is restricted
// to loopback so this harness cannot touch a deployed game or a user's real saves.
// Increase BBGM_E2E_MAX_SCHEDULE_ACTIONS (up to 500) to exercise more schedule UI actions.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const baseRaw = process.env.BBGM_E2E_BASE_URL;
if (!baseRaw) {
	throw new Error("Set BBGM_E2E_BASE_URL to the remote Cloud dev server's loopback URL.");
}

const baseURL = new URL(baseRaw);
if (
	!/^https?:$/.test(baseURL.protocol) ||
	!new Set(["localhost", "127.0.0.1", "[::1]"]).has(baseURL.hostname)
) {
	throw new Error("Safety stop: BBGM_E2E_BASE_URL must use localhost, 127.0.0.1, or [::1].");
}

const outputDir = resolve(
	process.env.BBGM_E2E_ARTIFACT_DIR ?? join(tmpdir(), `bbgm-e2e-${Date.now()}`),
);
const maxScheduleActions = Number(process.env.BBGM_E2E_MAX_SCHEDULE_ACTIONS ?? 5);
if (!Number.isInteger(maxScheduleActions) || maxScheduleActions < 1 || maxScheduleActions > 500) {
	throw new Error("BBGM_E2E_MAX_SCHEDULE_ACTIONS must be an integer from 1 to 500.");
}
await mkdir(outputDir, { recursive: true });

const report = {
	baseURL: baseURL.origin,
	isolatedBrowserContext: true,
	uiOnly: true,
	steps: [],
	consoleErrors: [],
	pageErrors: [],
	gamesSimulated: 0,
	daysAdvanced: 0,
	artifacts: [],
};
let browser;
let context;
let page;

const screenshot = async (name) => {
	const path = join(outputDir, `${name}.png`);
	await page.screenshot({ path, fullPage: true, animations: "disabled" });
	report.artifacts.push(path);
};
const step = async (name, action) => {
	await action();
	report.steps.push(name);
	console.log(`PASS ${name}`);
};
const waitForValue = async (selector, value) => {
	await page.waitForFunction(
		({ selector: s, expected }) => document.querySelector(s)?.value === expected,
		{ selector, expected: value },
		{ timeout: 15_000 },
	);
};

try {
	browser = await chromium.launch({
		headless: process.env.BBGM_E2E_HEADFUL !== "1",
		...(process.env.BBGM_CHROMIUM_EXECUTABLE
			? { executablePath: process.env.BBGM_CHROMIUM_EXECUTABLE }
			: {}),
	});
	context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		acceptDownloads: false,
	});
	page = await context.newPage();
	page.setDefaultTimeout(20_000);
	page.on("console", (message) => {
		if (message.type() === "error") {
			report.consoleErrors.push(message.text());
		}
	});
	page.on("pageerror", (error) => report.pageErrors.push(error.message));

	await step("open dashboard", async () => {
		await page.goto(baseURL.href, { waitUntil: "domcontentloaded" });
		await page.locator('a[href="/new_league/random"]').waitFor({ state: "visible" });
		await screenshot("01-dashboard");
	});

	await step("create a disposable random-player league through the UI", async () => {
		await page.locator('a[href="/new_league/random"]').click();
		await page.getByRole("button", { name: /create league/i }).waitFor({ state: "visible", timeout: 120_000 });
		await page.getByRole("button", { name: /create league/i }).click();
		await page.waitForURL(/\/l\/\d+(?:\/|$)/, { timeout: 180_000 });
		await screenshot("02-disposable-league");
	});

	const leagueId = page.url().match(/\/l\/(\d+)/)?.[1];
	if (!leagueId) {
		throw new Error(`Could not identify the newly created league from the UI route: ${page.url()}`);
	}

	await step("open the league Roster from the UI", async () => {
		const rosterLink = page.locator(`a[href^="/l/${leagueId}/roster"]`).first();
		await rosterLink.waitFor({ state: "visible" });
		await rosterLink.click();
		await page.getByRole("combobox", { name: "Rotation depth" }).waitFor({ state: "visible" });
		await page.getByRole("combobox", { name: "Core reliance" }).waitFor({ state: "visible" });
		await screenshot("03-roster-auto");
	});

	await step("change Core and Depth and verify they persist after reload", async () => {
		await page.getByRole("combobox", { name: "Rotation depth" }).selectOption("long");
		await waitForValue('[aria-label="Rotation depth"]', "long");
		await page.getByRole("combobox", { name: "Core reliance" }).selectOption("high");
		await waitForValue('[aria-label="Core reliance"]', "high");
		await page.reload();
		await waitForValue('[aria-label="Rotation depth"]', "long");
		await waitForValue('[aria-label="Core reliance"]', "high");
		await screenshot("04-core-depth-persisted");
	});

	await step("save a valid Custom plan and verify it survives reload", async () => {
		const minutes = page.locator('input[aria-label^="Planned minutes for "]');
		const count = await minutes.count();
		if (count < 6) {
			throw new Error(`Expected a complete roster table, found ${count} planned-minute inputs.`);
		}
		// A deliberately simple valid 240-minute plan gives the UI a deterministic
		// persistence check without touching worker APIs or hidden app state.
		for (let i = 0; i < count; i++) {
			await minutes.nth(i).fill(i < 5 ? "48" : "0");
		}
		if (!(await page.locator("body").innerText()).includes("Total 240 / 240")) {
			throw new Error("The edited Custom plan did not show the required 240 / 240 total.");
		}
		await page.getByText("Custom plan", { exact: true }).waitFor({ state: "visible" });
		await page.getByText("Saved", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
		await page.reload();
		await page.getByText("Custom plan", { exact: true }).waitFor({ state: "visible" });
		const reloadedMinutes = page.locator('input[aria-label^="Planned minutes for "]');
		for (let i = 0; i < count; i++) {
			const expected = i < 5 ? "48" : "0";
			const actual = await reloadedMinutes.nth(i).inputValue();
			if (actual !== expected) {
				throw new Error(`Custom plan persistence mismatch at roster row ${i}: ${actual} != ${expected}`);
			}
		}
		await screenshot("05-custom-plan-reloaded");
		await page.getByRole("button", { name: "Auto Minutes", exact: true }).click();
		await page.getByText("Auto plan", { exact: true }).waitFor({ state: "visible" });
	});

	await step("save Lock and Current Override using the Roster controls", async () => {
		const locks = page.locator('input[aria-label^="Prevent injury minutes increase for "]');
		if ((await locks.count()) < 2) {
			throw new Error("Roster does not expose the expected injury-protection controls.");
		}
		await locks.nth(0).check();
		const explain = page.getByRole("button", { name: /^Explain minutes for / }).nth(1);
		await explain.click();
		const override = page.locator('input[aria-label^="Current minutes override for "]');
		await override.waitFor({ state: "visible" });
		await override.fill("24");
		await override.press("Enter");
		await page.waitForTimeout(750);
		await page.reload();
		const reloadedLocks = page.locator('input[aria-label^="Prevent injury minutes increase for "]');
		if (!(await reloadedLocks.nth(0).isChecked())) {
			throw new Error("Prevent injury increase Lock did not persist after reload.");
		}
		await page.getByRole("button", { name: /^Explain minutes for / }).nth(1).click();
		const reloadedOverride = page.locator('input[aria-label^="Current minutes override for "]');
		await reloadedOverride.waitFor({ state: "visible" });
		if ((await reloadedOverride.inputValue()) !== "24") {
			throw new Error("Current Override did not persist after reload.");
		}
		await screenshot("06-lock-override-reloaded");
	});

	await step("open Schedule and simulate complete games through the UI", async () => {
		await page.locator(`a[href="/l/${leagueId}/schedule"]`).click();
		let actions = 0;
		while (actions < maxScheduleActions) {
			const simGame = page.getByRole("button", { name: /sim\s*game/i }).first();
			const simToDay = page.getByRole("button", { name: "Sim to day", exact: true });
			if ((await simGame.count()) > 0 && (await simGame.isVisible()) && (await simGame.isEnabled())) {
				await simGame.click();
				report.gamesSimulated++;
			} else if ((await simToDay.count()) > 0 && (await simToDay.isVisible()) && (await simToDay.isEnabled())) {
				await simToDay.click();
				report.daysAdvanced++;
			} else {
				break;
			}
			actions++;
			await page.waitForTimeout(1_000);
		}
		if (report.gamesSimulated === 0) {
			throw new Error("No complete game was available to simulate; verify league phase and Schedule UI.");
		}
		await screenshot("07-simulated-game-results");
	});

	const visibleResults = await page.locator("body").innerText();
	report.visibleResultsExcerpt = visibleResults.slice(-12_000);
	report.pageErrors = [...new Set(report.pageErrors)];
	await writeFile(join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify({ status: "PASS", outputDir, ...report }, null, 2));
} catch (error) {
	report.failure = String(error?.stack ?? error);
	try {
		await screenshot("failure");
	} catch {
		// Preserve the original failure if the browser was already gone.
	}
	await writeFile(join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
	console.error(JSON.stringify({ status: "FAIL", outputDir, ...report }, null, 2));
	process.exitCode = 1;
} finally {
	await context?.close().catch(() => {});
	await browser?.close().catch(() => {});
}
