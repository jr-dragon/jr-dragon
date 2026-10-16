import assert from "node:assert/strict";
import { test } from "node:test";
import { getCourseChapterPages, groupCourseChapters, parseCourseChapterId } from "./course";

test("removes the chapter order prefix from the route and preserves the locale", () => {
	const chapter = parseCourseChapterId("build-redis-from-scratch/00-overview/zh-Hant");
	assert.equal(chapter.order, 0);
	assert.equal(chapter.slug, "overview");
	assert.equal(chapter.locale, "zh-Hant");
	assert.equal(chapter.href, "/course/build-redis-from-scratch/overview/zh-Hant/");
});

test("groups translations into chapters and sorts chapters numerically", () => {
	const entries = [
		{ id: "intro/10-end/en" },
		{ id: "other/01-hello_world/ja" },
		{ id: "intro/2-middle/zh-Hant" },
		{ id: "intro/00-start/zh-Hant" },
		{ id: "intro/00-start/en" },
	];
	const courses = groupCourseChapters(entries);
	assert.deepEqual(courses[0].chapters.map(({ order }) => order), [0, 2, 10]);
	assert.deepEqual(courses[0].chapters[0].translations.map(({ locale }) => locale), ["en", "zh-Hant"]);
	assert.equal(courses[1].chapters[0].translations[0].entry, entries[1]);
	assert.equal(courses[1].chapters[0].translations[0].href, "/course/other/hello_world/ja/");
	assert.equal(entries[0].id, "intro/10-end/en");
});

test("preserves course and chapter names and encodes URL segments", () => {
	const chapter = parseCourseChapterId("程式 入門/01-Hello_world/zh-Hant");
	assert.equal(chapter.courseName, "程式 入門");
	assert.equal(chapter.slug, "Hello_world");
	assert.equal(chapter.href, `/course/${encodeURIComponent("程式 入門")}/Hello_world/zh-Hant/`);
});

test("rejects malformed paths, invalid locales, and unsafe order numbers", () => {
	for (const id of [
		"01-root/en", "intro/hello/en", "intro/01-/en", "intro/01-hello",
		"intro/nested/01-hello/en", "intro/9007199254740992-hello/en", "intro/01-hello/zh_Hant",
	]) {
		assert.throws(() => parseCourseChapterId(id), /Invalid/);
	}
});

test("rejects conflicting chapter orders, routes, and equivalent locale names", () => {
	assert.throws(() => groupCourseChapters([
		{ id: "intro/01-first/en" }, { id: "intro/1-second/zh-Hant" },
	]), /Duplicate chapter number 1/);
	assert.throws(() => groupCourseChapters([
		{ id: "intro/01-first/en" }, { id: "intro/2-first/zh-Hant" },
	]), /Duplicate chapter route/);
	assert.throws(() => groupCourseChapters([
		{ id: "intro/01-first/zh-Hant" }, { id: "intro/01-first/zh-hant" },
	]), /Duplicate locale/);
	assert.equal(groupCourseChapters([{ id: "a/01-first/en" }, { id: "b/1-first/en" }]).length, 2);
	assert.deepEqual(groupCourseChapters([]), []);
});

test("navigates only between chapters with a matching translation in the same course", () => {
	const pages = getCourseChapterPages([
		{ id: "intro/10-end/en" },
		{ id: "intro/2-middle/zh-Hant" },
		{ id: "intro/00-start/en" },
		{ id: "intro/00-start/zh-Hant" },
		{ id: "other/01-start/en" },
	]);
	assert.equal(pages.length, 5);
	const firstEnglish = pages.find(({ translation }) => translation.entry.id === "intro/00-start/en")!;
	assert.equal(firstEnglish.previous, undefined);
	assert.equal(firstEnglish.next?.href, "/course/intro/end/en/");
	assert.equal(firstEnglish.translations.length, 2);
	const middleChinese = pages.find(({ translation }) => translation.entry.id === "intro/2-middle/zh-Hant")!;
	assert.equal(middleChinese.previous?.href, "/course/intro/start/zh-Hant/");
	assert.equal(middleChinese.next, undefined);
	const other = pages.find(({ translation }) => translation.courseName === "other")!;
	assert.equal(other.previous, undefined);
	assert.equal(other.next, undefined);
});
