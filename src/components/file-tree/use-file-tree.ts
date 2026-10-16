import { useMemo } from "react";

export interface TreeNode { id: string; children?: TreeNode[] }
export interface UseFileTreeOptions<T extends TreeNode> { items: T[]; isLeaf?: (node: T) => boolean }

export function collectTree<T extends TreeNode>({ items, isLeaf = (node) => !node.children?.length }: UseFileTreeOptions<T>) {
	const expandableKeys: string[] = [];
	const leaves: T[] = [];
	function visit(nodes: T[]) {
		for (const node of nodes) {
			if (isLeaf(node)) leaves.push(node);
			else {
				expandableKeys.push(node.id);
				visit((node.children ?? []) as T[]);
			}
		}
	}
	visit(items);
	function filterTree(predicate: (node: T) => boolean): T[] {
		function filter(nodes: T[]): T[] {
			return nodes.flatMap((node) => {
				if (isLeaf(node)) return predicate(node) ? [node] : [];
				const children = filter((node.children ?? []) as T[]);
				return children.length ? [{ ...node, children }] : [];
			});
		}
		return filter(items);
	}
	return { expandableKeys, leaves, filterTree };
}

export function useFileTree<T extends TreeNode>({ items, isLeaf }: UseFileTreeOptions<T>) {
	return useMemo(() => collectTree({ items, isLeaf }), [items, isLeaf]);
}
