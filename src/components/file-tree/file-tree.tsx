import { Children, createContext, isValidElement, useContext, type CSSProperties, type ReactNode, type Ref } from "react";
import { Button } from "@heroui/react";
import { ChevronRight, GripVertical } from "lucide-react";
import { Tree, TreeItem, TreeItemContent, TreeSection, TreeHeader, type TreeProps, type TreeItemProps, type TreeItemRenderProps, type TreeSectionProps, type TreeHeaderProps } from "react-aria-components/Tree";
import "./file-tree.css";

type Size = "sm" | "md" | "lg";
export interface FileTreeProps<T extends object> extends TreeProps<T> {
	ref?: Ref<HTMLDivElement>;
	reduceMotion?: boolean;
	showGuideLines?: boolean | "hover";
	size?: Size;
}
export type FileTreeItemRenderProps = Pick<TreeItemRenderProps, "isExpanded" | "hasChildItems" | "allowsDragging">;
export interface FileTreeItemProps<T = object> extends Omit<TreeItemProps<T>, "textValue" | "children"> {
	children?: ReactNode;
	ref?: Ref<HTMLDivElement>;
	title: ReactNode;
	textValue?: string;
	icon?: ReactNode | ((props: FileTreeItemRenderProps) => ReactNode);
	dragIcon?: ReactNode | false;
}
export interface FileTreeIndicatorProps { children?: ReactNode; className?: string }
export type FileTreeSectionProps<T> = TreeSectionProps<T> & { ref?: Ref<HTMLDivElement> };
export type FileTreeHeaderProps = TreeHeaderProps;

const TreeOptions = createContext<{ size: Size; showGuideLines: boolean | "hover" }>({ size: "md", showGuideLines: true });

function FileTreeRoot<T extends object>({ size = "md", showGuideLines = true, reduceMotion = false, className, ...props }: FileTreeProps<T>) {
	return <TreeOptions.Provider value={{ size, showGuideLines }}>
		<Tree {...props} data-reduce-motion={reduceMotion || undefined} className={(state) => ["file-tree", `file-tree--${size}`, typeof className === "function" ? className(state) : className].filter(Boolean).join(" ")} />
	</TreeOptions.Provider>;
}

function FileTreeIndicator({ children, className = "" }: FileTreeIndicatorProps) {
	return <span data-slot="file-tree-indicator" className={`file-tree__indicator ${className}`} aria-hidden="true">{children ?? <ChevronRight size={14} />}</span>;
}

function FileTreeItem<T>({ title, textValue, icon, dragIcon, children, className, style, ...props }: FileTreeItemProps<T>) {
	const { size, showGuideLines } = useContext(TreeOptions);
	const parts = Children.toArray(children);
	const indicator = parts.find((child) => isValidElement(child) && child.type === FileTreeIndicator);
	const nested = parts.filter((child) => !(isValidElement(child) && child.type === FileTreeIndicator));
	return <TreeItem {...props} data-slot="file-tree-item" style={(state) => ({ "--tree-item-level": state.level, ...(typeof style === "function" ? style(state) : style) } as CSSProperties)} textValue={textValue ?? (typeof title === "string" ? title : props["aria-label"] ?? "")} className={(state) => ["file-tree__item", `file-tree__item--${size}`, typeof className === "function" ? className(state) : className].filter(Boolean).join(" ")}>
		<TreeItemContent>{(state) => <div data-slot="file-tree-item-content" className="file-tree__item-content">
			{Array.from({ length: state.level - 1 }, (_, level) => <span key={level} aria-hidden="true" className={`file-tree__guide-line${showGuideLines === "hover" ? " file-tree__guide-line--hover" : showGuideLines === false ? " file-tree__guide-line--none" : ""}`} style={{ "--guide-level": level } as CSSProperties} />)}
			{state.hasChildItems && <Button slot="chevron" className="file-tree__chevron" isIconOnly variant="ghost" size="sm">{indicator ?? <FileTreeIndicator />}</Button>}
			{icon && <span className="file-tree__icon" aria-hidden="true">{typeof icon === "function" ? icon(state) : icon}</span>}
			<span className="file-tree__label">{title}</span>
			{state.allowsDragging && dragIcon !== false && <Button slot="drag" className="file-tree__drag-handle" aria-label={`Drag ${textValue ?? (typeof title === "string" ? title : "item")}`} isIconOnly size="sm" variant="ghost">{dragIcon ?? <GripVertical size={14} />}</Button>}
		</div>}</TreeItemContent>
		{nested}
	</TreeItem>;
}

function FileTreeSection<T>({ className = "", ...props }: FileTreeSectionProps<T>) {
	return <TreeSection {...props} className={`file-tree__section ${className}`} />;
}
function FileTreeHeader({ className, ...props }: FileTreeHeaderProps) {
	return <TreeHeader {...props} className={`file-tree__section-header ${className ?? ""}`} />;
}

export const FileTree = Object.assign(FileTreeRoot, { Item: FileTreeItem, Indicator: FileTreeIndicator, Section: FileTreeSection, Header: FileTreeHeader });
