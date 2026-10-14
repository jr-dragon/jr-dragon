import assert from "node:assert/strict";
import { test } from "node:test";
import { isArticleOutdated } from "./article-age";

const now = new Date("2026-10-14T08:00:00Z");
const pubDate = new Date("2018-05-26T00:00:00Z");

test("falls back to publication date when no update date is supplied", () => {
	assert.equal(isArticleOutdated(pubDate, undefined, now), true);
	assert.equal(isArticleOutdated(new Date("2026-10-01T00:00:00Z"), undefined, now), false);
});

test("warns only after the one-year boundary", () => {
	assert.equal(isArticleOutdated(pubDate, new Date("2025-10-14T07:59:59Z"), now), true);
	assert.equal(isArticleOutdated(pubDate, new Date("2025-10-14T08:00:00Z"), now), false);
	assert.equal(isArticleOutdated(pubDate, new Date("2025-10-14T08:00:01Z"), now), false);
});

test("does not warn for recent or future updates", () => {
	assert.equal(isArticleOutdated(pubDate, new Date("2026-10-01T00:00:00Z"), now), false);
	assert.equal(isArticleOutdated(pubDate, new Date("2027-10-01T00:00:00Z"), now), false);
});

test("uses a calendar year across leap years", () => {
	const leapYearNow = new Date("2024-03-01T08:00:00Z");
	assert.equal(isArticleOutdated(pubDate, new Date("2023-03-01T08:00:00Z"), leapYearNow), false);
	assert.equal(isArticleOutdated(pubDate, new Date("2023-03-01T07:59:59Z"), leapYearNow), true);
});
