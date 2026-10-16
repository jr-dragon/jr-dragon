export function parseCourseChapterId(id: string) {
	const match = /^([^/]+)\/(\d+)-([^/]+)\/([^/]+)$/.exec(id);
	if (!match) {
		throw new Error(
			`Invalid course chapter "${id}". Expected {course_name}/{number}-{chapter_name}/{locale}.`,
		);
	}

	const [, courseName, prefix, slug, locale] = match;
	const order = Number(prefix);
	if (!Number.isSafeInteger(order)) {
		throw new Error(`Invalid chapter number in "${id}".`);
	}

	let language: string;
	try {
		[language] = Intl.getCanonicalLocales(locale);
	} catch {
		throw new Error(`Invalid locale "${locale}" in "${id}".`);
	}

	const directory = `${prefix}-${slug}`;
	const courseHref = `/course/${encodeURIComponent(courseName)}/`;
	return {
		courseName,
		directory,
		slug,
		order,
		locale,
		language,
		courseHref,
		href: `${courseHref}${encodeURIComponent(slug)}/${encodeURIComponent(locale)}/`,
	};
}

export function groupCourseChapters<T extends { id: string }>(entries: T[]) {
	type Translation = ReturnType<typeof parseCourseChapterId> & { entry: T };
	type Chapter = {
		directory: string;
		slug: string;
		order: number;
		translations: Translation[];
	};
	const courses = new Map<string, Chapter[]>();
	for (const entry of entries) {
		const translation = { ...parseCourseChapterId(entry.id), entry };
		const { courseName, directory, slug, order } = translation;
		const chapters = courses.get(courseName) ?? [];
		let chapter = chapters.find((chapter) => chapter.directory === directory);
		if (!chapter) {
			if (chapters.some((chapter) => chapter.order === order)) {
				throw new Error(`Duplicate chapter number ${order} in course "${courseName}".`);
			}
			if (chapters.some((chapter) => chapter.slug === slug)) {
				throw new Error(`Duplicate chapter route "${slug}" in course "${courseName}".`);
			}
			chapter = { directory, slug, order, translations: [] };
			chapters.push(chapter);
		}
		if (chapter.translations.some(({ language }) => language === translation.language)) {
			throw new Error(`Duplicate locale "${translation.locale}" in chapter "${courseName}/${directory}".`);
		}
		chapter.translations.push(translation);
		courses.set(courseName, chapters);
	}

	return Array.from(courses, ([name, chapters]) => ({
		name,
		href: `/course/${encodeURIComponent(name)}/`,
		chapters: chapters.sort((a, b) => a.order - b.order).map((chapter) => ({
			...chapter,
			translations: chapter.translations.sort((a, b) => a.locale.localeCompare(b.locale)),
		})),
	}));
}

export function getCourseChapterPages<T extends { id: string }>(entries: T[]) {
	return groupCourseChapters(entries).flatMap((course) => {
		const translations = course.chapters.flatMap((chapter) => chapter.translations);
		return course.chapters.flatMap((chapter) => chapter.translations.map((translation) => {
			const localizedChapters = translations.filter(({ language }) => language === translation.language);
			const index = localizedChapters.indexOf(translation);
			return {
				translation,
				translations: chapter.translations,
				previous: localizedChapters[index - 1],
				next: localizedChapters[index + 1],
			};
		}));
	});
}
