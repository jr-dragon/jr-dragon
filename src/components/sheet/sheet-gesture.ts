export type SnapPoint = number | string;
export type SheetPlacement = "top" | "bottom" | "left" | "right";

export function snapPointPixels(point: SnapPoint, viewport: number): number {
	if (typeof point === "number") return Math.max(0, point <= 1 ? point * viewport : point);
	const value = Number.parseFloat(point);
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, point.endsWith("%") || point.endsWith("vh") || point.endsWith("vw") ? value * viewport / 100 : value);
}
export function snapOffsets(points: SnapPoint[], viewport: number, extent: number) {
	return points.map((point) => Math.max(0, extent - Math.min(extent, snapPointPixels(point, viewport))));
}
export function closestSnap(offset: number, offsets: number[], velocity = 0) {
	const projected = offset + velocity * 160;
	return offsets.reduce((best, current, index) => Math.abs(current - projected) < Math.abs(offsets[best] - projected) ? index : best, 0);
}
export function backdropOpacity(offset: number, offsets: number[], fadeFromIndex: number) {
	if (!offsets.length) return 1;
	const index = Math.max(0, Math.min(fadeFromIndex, offsets.length - 1));
	const start = index === 0 ? offsets[0] + 1 : offsets[index - 1];
	const end = offsets[index];
	return Math.max(0, Math.min(1, (start - offset) / Math.max(1, start - end)));
}
export function isVertical(placement: SheetPlacement) { return placement === "top" || placement === "bottom"; }
export function directionSign(placement: SheetPlacement) { return placement === "top" || placement === "left" ? -1 : 1; }

/** A scrollable descendant owns a gesture until it reaches the edge in that direction. */
export function scrollOwnsGesture(target: Element, drawer: Element, vertical: boolean, delta: number) {
	for (let node: Element | null = target; node && node !== drawer; node = node.parentElement) {
		if (!(node instanceof HTMLElement)) continue;
		const style = getComputedStyle(node);
		if (!/(auto|scroll)/.test(vertical ? style.overflowY : style.overflowX)) continue;
		const position = vertical ? node.scrollTop : node.scrollLeft;
		const maximum = vertical ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
		if (maximum > 1 && (delta > 0 ? position > 0 : position < maximum - 1)) return true;
	}
	return false;
}
