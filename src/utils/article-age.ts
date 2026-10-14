export function isArticleOutdated(pubDate: Date, updatedDate?: Date, now = new Date()): boolean {
	const lastModifiedDate = updatedDate ?? pubDate;
	const oneYearAgo = new Date(now);
	oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
	return lastModifiedDate.getTime() < oneYearAgo.getTime();
}
