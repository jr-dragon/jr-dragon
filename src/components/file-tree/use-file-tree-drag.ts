import { useDragAndDrop, type DragAndDropOptions } from "react-aria-components/useDragAndDrop";
import type { TreeData } from "react-aria-components/useTreeData";
import type { Key, ItemDropTarget } from "react-aria-components/Tree";

export interface UseFileTreeDragOptions<T extends object> {
	tree: TreeData<T>;
	getItems?: DragAndDropOptions<T>["getItems"];
	onMove?: (keys: Set<Key>, target: { key: Key; dropPosition: string }) => void;
}

function hasAncestor<T extends object>(tree: TreeData<T>, key: Key, keys: Set<Key>) {
	let node = tree.getItem(key);
	while (node?.parentKey != null) {
		if (keys.has(node.parentKey)) return true;
		node = tree.getItem(node.parentKey);
	}
	return false;
}

function isBranch<T extends object>(node: ReturnType<TreeData<T>["getItem"]>) {
	return Boolean(node && (node.children?.length || ("children" in node.value && Array.isArray(node.value.children))));
}

/** Move roots of the selection only, preserving subtrees and preventing cycles. */
export function moveTreeItems<T extends object>(tree: TreeData<T>, keys: Set<Key>, target: ItemDropTarget): boolean {
	if (keys.has(target.key) || hasAncestor(tree, target.key, keys)) return false;
	const destination = tree.getItem(target.key);
	if (!destination || (target.dropPosition === "on" && !isBranch(destination))) return false;
	const roots = [...keys].filter((key) => tree.getItem(key) && !hasAncestor(tree, key, keys));
	if (!roots.length) return false;
	if (target.dropPosition === "before") tree.moveBefore(target.key, roots);
	else if (target.dropPosition === "after") tree.moveAfter(target.key, roots);
	else roots.forEach((key, index) => tree.move(key, target.key, (destination.children?.length ?? 0) + index));
	return true;
}

export function useFileTreeDrag<T extends object>({ tree, getItems, onMove }: UseFileTreeDragOptions<T>) {
	return useDragAndDrop<T>({
		getItems: getItems ?? ((keys) => [...keys].map((key) => ({ "text/plain": String(key) }))),
		getAllowedDropOperations: () => ["move"],
		getDropOperation: (target, _types, operations) => {
			if (!operations.includes("move")) return "cancel";
			if (target.type === "item" && target.dropPosition === "on" && !isBranch(tree.getItem(target.key))) return "cancel";
			return "move";
		},
		onMove: ({ keys, target }) => {
			if (moveTreeItems(tree, keys, target)) onMove?.(keys, target);
		},
	});
}
