interface CourseConfig {
	titles: {
		en: string;
		"zh-Hant": string;
	};
}

export const courses: Record<string, CourseConfig> = {
	"build-redis-from-scratch": {
		titles: {
			en: "Olivine: Building a Redis-Compatible Service in Go.",
			"zh-Hant": "Olivine：以 Go 建構與 Redis 相容的服務",
		},
	},
};

export function getCourseTitle(slug: string, locale = "zh-Hant") {
	const course = Object.hasOwn(courses, slug) ? courses[slug] : undefined;
	const language = locale.toLowerCase().split("-")[0] === "zh" ? "zh-Hant" : "en";
	return course?.titles[language] ?? slug;
}
