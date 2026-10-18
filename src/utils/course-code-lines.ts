export interface CourseCodeLine {
	number: number;
	content: string;
	diff?: "+" | "-";
}

export function mergeCourseCodeLines(source: string, start: number, body: string): CourseCodeLine[] {
	const original = source === "" ? [] : source.split("\n").map((content, index) => ({ number: start + index, content }));
	let nextLine = 1;
	const inserted: CourseCodeLine[] = body === "" ? [] : body.replace(/\r\n?/g, "\n").split("\n").map((line) => {
		let content = line;
		const explicit = /^#L([^\s]*)(?:[ \t]|$)/.exec(content);
		if (explicit) {
			if (!/^\d+$/.test(explicit[1])) throw new Error("Inserted line numbers must use #L followed by a positive integer.");
			nextLine = Number(explicit[1]);
			content = content.slice(explicit[0].length);
		}
		if (!Number.isSafeInteger(nextLine) || nextLine < 1) throw new Error("Inserted line numbers must be positive safe integers.");
		const marker = /^[ \t]*([+-])(?:[ \t]|$)/.exec(content);
		const diff = marker?.[1] as CourseCodeLine["diff"];
		if (marker) content = content.slice(marker[0].length);
		return { number: nextLine++, content, ...(diff && { diff }) };
	});
	// Stable sorting keeps authored lines above the source when numbers overlap.
	return [...inserted, ...original].sort((a, b) => a.number - b.number);
}
