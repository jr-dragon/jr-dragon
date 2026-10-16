import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { parseCourseChapterId } from "./utils/course";

const blog = defineCollection({
	loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			tags: z.array(z.string()).optional(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: image().optional(),
			heroImageFrom: z.url({ protocol: /^https?$/ }).optional(),
		}),
});

const course = defineCollection({
	loader: glob({
		base: "./src/content/course",
		// Only translations directly inside a chapter are collection entries.
		pattern: "*/*/*.{md,mdx,mdoc}",
		// Read external code files on each build instead of caching their rendered HTML.
		deferRender: true,
		generateId: ({ entry }) => {
			const id = entry.replace(/\.(md|mdx|mdoc)$/, "");
			parseCourseChapterId(id);
			return id;
		},
	}),
	schema: z.object({
		title: z.string().trim().min(1),
		description: z.string().optional(),
		codebase: z.string().trim().min(1).optional(),
	}),
});

export const collections = { blog, course };
