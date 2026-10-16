import { cloneElement, createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentPropsWithRef, type CSSProperties, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from "react";
import { CloseButton, type CloseButtonProps } from "@heroui/react";
import { Modal, ModalOverlay, type ModalOverlayProps, type ModalRenderProps } from "react-aria-components/Modal";
import { Dialog, OverlayTriggerStateContext, type DialogProps } from "react-aria-components/Dialog";
import { Heading } from "react-aria-components/Heading";
import { Button, type ButtonProps } from "react-aria-components/Button";
import { FocusScope, Overlay, useOverlay, mergeProps } from "react-aria";
import { filterDOMProps } from "@react-aria/utils";
import { useOverlayTriggerState } from "react-stately";
import { backdropOpacity, closestSnap, directionSign, isVertical, scrollOwnsGesture, snapOffsets, type SheetPlacement, type SnapPoint } from "./sheet-gesture";
import "./sheet.css";

export interface SheetProps {
	children: ReactNode;
	isOpen?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	placement?: SheetPlacement;
	isDismissable?: boolean;
	isDetached?: boolean;
	isModal?: boolean;
	isNested?: boolean;
	isHandleOnly?: boolean;
	snapPoints?: SnapPoint[];
	activeSnapPoint?: SnapPoint | null;
	onActiveSnapPointChange?: (snapPoint: SnapPoint | null) => void;
	fadeFromIndex?: number;
	closeThreshold?: number;
	shouldScaleBackground?: boolean;
	onDrag?: (event: PointerEvent, percentageDragged: number) => void;
	onRelease?: (event: PointerEvent, open: boolean) => void;
	onClose?: () => void;
	onAnimationEnd?: (open: boolean) => void;
	shouldAutoFocus?: boolean;
}
export interface SheetBackdropProps extends Omit<ModalOverlayProps, "isOpen" | "onOpenChange"> {
	ref?: React.Ref<HTMLDivElement>;
	variant?: "opaque" | "blur" | "transparent";
}
export type SheetContentProps = Omit<ComponentPropsWithRef<typeof Modal>, "isOpen" | "onOpenChange">;
export type SheetDialogProps = DialogProps & { ref?: React.Ref<HTMLElement> };
export type SheetHeadingProps = ComponentPropsWithRef<typeof Heading>;
export type SheetLayoutProps = ComponentPropsWithRef<"div">;
export type SheetHandleProps = ButtonProps & { ref?: React.Ref<HTMLButtonElement>; preventCycle?: boolean };
export type SheetTriggerProps = { children: ReactElement<ButtonProps> };
export type SheetCloseTriggerProps = CloseButtonProps;

interface SheetContextValue {
	options: SheetProps;
	state: ReturnType<typeof useOverlayTriggerState>;
	drawerRef: React.RefObject<HTMLDivElement | null>;
	backdropRef: React.RefObject<HTMLDivElement | null>;
	snap: SnapPoint | null;
	setSnap: (point: SnapPoint | null) => void;
	childCount: number;
	setChildCount: React.Dispatch<React.SetStateAction<number>>;
	suppressClick: React.RefObject<boolean>;
}
const SheetContext = createContext<SheetContextValue | null>(null);
const PresenceContext = createContext<ModalRenderProps | null>(null);
function useSheet() {
	const context = useContext(SheetContext);
	if (!context) throw new Error("Sheet parts must be rendered inside Sheet.");
	return context;
}
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
	if (typeof ref === "function") ref(value);
	else if (ref) ref.current = value;
}

function SheetRoot({ children, placement = "bottom", isDismissable = true, isDetached = false, isModal = true, isHandleOnly = false, closeThreshold = .25, shouldAutoFocus = false, ...props }: SheetProps) {
	const parent = useContext(SheetContext);
	const options = { ...props, children, placement, isDismissable, isDetached, isModal, isHandleOnly, closeThreshold, shouldAutoFocus };
	const state = useOverlayTriggerState({ isOpen: props.isOpen, defaultOpen: props.defaultOpen, onOpenChange: props.onOpenChange });
	const drawerRef = useRef<HTMLDivElement>(null);
	const backdropRef = useRef<HTMLDivElement>(null);
	const [internalSnap, setInternalSnap] = useState<SnapPoint | null>(props.snapPoints?.[0] ?? null);
	const snap = props.activeSnapPoint !== undefined ? props.activeSnapPoint : internalSnap;
	const setSnap = useCallback((point: SnapPoint | null) => {
		if (props.activeSnapPoint === undefined) setInternalSnap(point);
		props.onActiveSnapPointChange?.(point);
	}, [props.activeSnapPoint, props.onActiveSnapPointChange]);
	const [childCount, setChildCount] = useState(0);
	const suppressClick = useRef(false);
	const previousOpen = useRef(state.isOpen);
	const callbacks = useRef(options);
	callbacks.current = options;
	useEffect(() => {
		if (previousOpen.current && !state.isOpen) callbacks.current.onClose?.();
		previousOpen.current = state.isOpen;
	}, [state.isOpen]);
	const parentSetChildCount = parent?.setChildCount;
	const nested = props.isNested ?? Boolean(parent);
	useEffect(() => {
		if (!nested || !state.isOpen || !parentSetChildCount) return;
		parentSetChildCount((count) => count + 1);
		return () => parentSetChildCount((count) => count - 1);
	}, [nested, state.isOpen, parentSetChildCount]);
	useEffect(() => {
		if (!state.isOpen || !props.shouldScaleBackground) return;
		const wrapper = document.querySelector<HTMLElement>("[data-sheet-wrapper]");
		if (!wrapper) return;
		const previous = wrapper.getAttribute("data-sheet-scaled");
		wrapper.setAttribute("data-sheet-scaled", "true");
		return () => { if (previous === null) wrapper.removeAttribute("data-sheet-scaled"); else wrapper.setAttribute("data-sheet-scaled", previous); };
	}, [state.isOpen, props.shouldScaleBackground]);
	return <SheetContext.Provider value={{ options, state, drawerRef, backdropRef, snap, setSnap, childCount, setChildCount, suppressClick }}><OverlayTriggerStateContext.Provider value={state}>{children}</OverlayTriggerStateContext.Provider></SheetContext.Provider>;
}

function SheetTrigger({ children }: SheetTriggerProps) {
	const { state } = useSheet();
	return cloneElement(children, mergeProps(children.props, { onPress: state.open, "aria-haspopup": "dialog", "aria-expanded": state.isOpen }));
}
function SheetClose({ children }: SheetTriggerProps) {
	const { state } = useSheet();
	return cloneElement(children, mergeProps(children.props, { onPress: state.close }));
}
function SheetBackdrop({ variant = "opaque", className, ref, ...props }: SheetBackdropProps) {
	const context = useSheet();
	const { state, options, backdropRef } = context;
	const setRef = useCallback((element: HTMLDivElement | null) => { backdropRef.current = element; assignRef(ref, element); }, [backdropRef, ref]);
	const mergedClassName: ModalOverlayProps["className"] = (renderProps) => `sheet__backdrop sheet__backdrop--${variant} ${typeof className === "function" ? className(renderProps) : className ?? ""}`;
	if (!options.isModal) return <NonModalBackdrop {...props} ref={setRef} className={mergedClassName} />;
	return <ModalOverlay {...props} ref={setRef} className={mergedClassName} isOpen={state.isOpen} onOpenChange={state.setOpen} isDismissable={options.isDismissable && (props.isDismissable ?? true)} isKeyboardDismissDisabled={!options.isDismissable || props.isKeyboardDismissDisabled}>
		{(renderProps) => <PresenceContext.Provider value={renderProps}>{typeof props.children === "function" ? props.children(renderProps) : props.children}</PresenceContext.Provider>}
	</ModalOverlay>;
}

/** A non-modal sheet leaves page scrolling and background controls available. */
function NonModalBackdrop({ ref, children, className, style, onEnter, onExit, UNSTABLE_portalContainer, isDismissable, isKeyboardDismissDisabled, shouldCloseOnInteractOutside, ...props }: Omit<SheetBackdropProps, "variant">) {
	const { state, options, drawerRef } = useSheet();
	const [present, setPresent] = useState(state.isOpen);
	const [entering, setEntering] = useState(state.isOpen);
	const localRef = useRef<HTMLDivElement>(null);
	const lifecycle = useRef({ onEnter, onExit, onAnimationEnd: options.onAnimationEnd });
	lifecycle.current = { onEnter, onExit, onAnimationEnd: options.onAnimationEnd };
	const { overlayProps } = useOverlay({ isOpen: state.isOpen, onClose: state.close, isDismissable: options.isDismissable && (isDismissable ?? true), isKeyboardDismissDisabled: !options.isDismissable || isKeyboardDismissDisabled, shouldCloseOnInteractOutside }, drawerRef);
	useEffect(() => {
		if (state.isOpen) { setPresent(true); setEntering(true); }
	}, [state.isOpen]);
	useEffect(() => {
		const element = localRef.current;
		if (!present || !element) return;
		let cancelled = false;
		const open = state.isOpen;
		async function finishAnimation() {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			if (cancelled) return;
			await Promise.all([
				...(element!.getAnimations?.({ subtree: true }) ?? []).map((animation) => animation.finished.catch(() => {})),
				open ? lifecycle.current.onEnter?.(element!) : lifecycle.current.onExit?.(element!),
			]);
			if (cancelled) return;
			setEntering(false);
			if (!open) setPresent(false);
			lifecycle.current.onAnimationEnd?.(open);
		}
		void finishAnimation();
		return () => { cancelled = true; };
	}, [state.isOpen, present]);
	if (!present && !state.isOpen) return null;
	const renderProps = { isEntering: entering && state.isOpen, isExiting: !state.isOpen, state, defaultClassName: "", defaultStyle: {}, defaultChildren: null };
	return <Overlay portalContainer={UNSTABLE_portalContainer as HTMLElement | undefined}><FocusScope restoreFocus>
		<div {...filterDOMProps(props, { global: true })} {...overlayProps} ref={(element) => { localRef.current = element; assignRef(ref, element); }} data-non-modal="true" data-entering={renderProps.isEntering || undefined} data-exiting={renderProps.isExiting || undefined} className={typeof className === "function" ? className(renderProps) : className} style={typeof style === "function" ? style(renderProps) : style}>
			<PresenceContext.Provider value={renderProps}>{typeof children === "function" ? children(renderProps) : children}</PresenceContext.Provider>
		</div>
	</FocusScope></Overlay>;
}

function SheetContent({ children, className, style, ref, render: renderElement, ...props }: SheetContentProps) {
	const { options, state, drawerRef, backdropRef, snap, setSnap, childCount, suppressClick } = useSheet();
	const presence = useContext(PresenceContext);
	const placement = options.placement!;
	const vertical = isVertical(placement);
	const sign = directionSign(placement);
	const points = options.snapPoints ?? [];
	const [extent, setExtent] = useState(0);
	const [viewport, setViewport] = useState(0);
	const offsets = snapOffsets(points, viewport, extent);
	const activeIndex = points.indexOf(snap!);
	const offset = activeIndex < 0 ? 0 : offsets[activeIndex] ?? 0;
	const [dragOffset, setDragOffset] = useState<number | null>(null);
	const gesture = useRef<{ id: number; start: number; cross: number; time: number; offset: number; target: Element; dragging: boolean } | null>(null);
	const suppressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const callbackRef = useRef(options);
	callbackRef.current = options;
	const setRef = useCallback((element: HTMLDivElement | null) => { drawerRef.current = element; assignRef(ref, element); }, [drawerRef, ref]);
	useEffect(() => {
		const element = drawerRef.current;
		if (!element) return;
		const measure = () => {
			setExtent(vertical ? element.offsetHeight : element.offsetWidth);
			setViewport(vertical ? (window.visualViewport?.height ?? window.innerHeight) : (window.visualViewport?.width ?? window.innerWidth));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		window.addEventListener("resize", measure);
		window.visualViewport?.addEventListener("resize", measure);
		return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure); };
	}, [drawerRef, vertical]);
	useEffect(() => {
		const backdrop = backdropRef.current;
		backdrop?.style.setProperty("--sheet-backdrop-opacity", String(backdropOpacity(dragOffset ?? offset, offsets, options.fadeFromIndex ?? points.length - 1)));
	}, [offset, dragOffset, options.fadeFromIndex, backdropRef, offsets.join(",")]);
	useEffect(() => () => clearTimeout(suppressTimer.current), []);
	useEffect(() => {
		const drawer = drawerRef.current;
		if (!drawer) return;
		// A non-passive touch listener lets a sheet drag cancel native scrolling,
		// while scrollable descendants retain gestures they can still consume.
		const preventNativeScroll = (event: TouchEvent) => {
			const current = gesture.current;
			const touch = event.touches[0];
			if (!current || !touch || !event.cancelable) return;
			const delta = (vertical ? touch.clientY : touch.clientX) - current.start;
			const cross = (vertical ? touch.clientX : touch.clientY) - current.cross;
			if (current.dragging || (Math.abs(delta) > 6 && Math.abs(delta) > Math.abs(cross) && !scrollOwnsGesture(current.target, drawer, vertical, delta))) event.preventDefault();
		};
		drawer.addEventListener("touchmove", preventNativeScroll, { passive: false });
		return () => drawer.removeEventListener("touchmove", preventNativeScroll);
	}, [drawerRef, vertical]);
	useEffect(() => {
		if (!state.isOpen) { gesture.current = null; setDragOffset(null); }
	}, [state.isOpen]);
	const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!event.isPrimary || event.button !== 0 || childCount || !state.isOpen || !(event.target instanceof Element)) return;
		if (event.target.closest("[data-sheet-drawer]") !== drawerRef.current) return;
		const handle = event.target.closest(".sheet__handle");
		if (options.isHandleOnly && !handle) return;
		if (!handle && event.target.closest("button, a, input, textarea, select, [contenteditable=true], [data-sheet-no-drag]")) return;
		gesture.current = { id: event.pointerId, start: vertical ? event.clientY : event.clientX, cross: vertical ? event.clientX : event.clientY, time: event.timeStamp, offset, target: event.target, dragging: false };
	};
	const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = gesture.current;
		const drawer = drawerRef.current;
		if (!current || !drawer || current.id !== event.pointerId) return;
		const delta = ((vertical ? event.clientY : event.clientX) - current.start) * sign;
		const cross = (vertical ? event.clientX : event.clientY) - current.cross;
		if (!current.dragging) {
			if (Math.abs(delta) < 6) return;
			if (Math.abs(cross) > Math.abs(delta) || scrollOwnsGesture(current.target, drawer, vertical, delta * sign)) { gesture.current = null; return; }
			current.dragging = true;
			drawer.setPointerCapture?.(event.pointerId);
		}
		event.preventDefault();
		const minimum = offsets.length ? Math.min(...offsets) : 0;
		const maximum = options.isDismissable ? extent : (offsets.length ? Math.max(...offsets) : 0);
		const next = Math.min(maximum, Math.max(minimum, current.offset + delta));
		setDragOffset(next);
		options.onDrag?.(event.nativeEvent, Math.max(0, Math.min(1, (next - current.offset) / Math.max(1, extent - current.offset))));
	};
	const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
		const current = gesture.current;
		if (!current || current.id !== event.pointerId) return;
		gesture.current = null;
		if (!current.dragging) return;
		const drawer = drawerRef.current;
		if (drawer?.hasPointerCapture?.(event.pointerId)) drawer.releasePointerCapture(event.pointerId);
		suppressClick.current = true;
		clearTimeout(suppressTimer.current);
		suppressTimer.current = setTimeout(() => { suppressClick.current = false; }, 0);
		const delta = ((vertical ? event.clientY : event.clientX) - current.start) * sign;
		const velocity = delta / Math.max(1, event.timeStamp - current.time);
		const finalOffset = Math.max(0, current.offset + delta);
		let open = true;
		if (!cancelled) {
			const lowest = offsets.length ? Math.max(...offsets) : 0;
			const visible = Math.max(1, extent - lowest);
			open = !(options.isDismissable && (finalOffset > lowest + visible * options.closeThreshold! || (velocity > .5 && finalOffset > lowest + 10)));
			if (!open) state.close();
			else if (offsets.length) setSnap(points[closestSnap(finalOffset, offsets, velocity)]);
		}
		setDragOffset(null);
		options.onRelease?.(event.nativeEvent, open);
	};
	const gestureProps: HTMLAttributes<HTMLDivElement> = {
		onPointerDownCapture: pointerDown,
		onPointerMoveCapture: pointerMove,
		onPointerUpCapture: (event) => finish(event),
		onPointerCancelCapture: (event) => finish(event, true),
		onClickCapture: (event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } },
		onAnimationEnd: (event) => { if (options.isModal && event.target === drawerRef.current) callbackRef.current.onAnimationEnd?.(state.isOpen); },
	};
	const contentClass: SheetContentProps["className"] = (renderProps) => `sheet__content sheet__content--${placement} ${dragOffset !== null ? "sheet-dragging" : ""} ${typeof className === "function" ? className(renderProps) : className ?? ""}`;
	const contentStyle: SheetContentProps["style"] = (renderProps) => ({ "--snap-point-height": `${(dragOffset ?? offset) * sign}px`, "--sheet-nested-scale": childCount ? .96 : 1, "--sheet-nested-offset": childCount ? `${-16 * sign}px` : "0px", ...(typeof style === "function" ? style(renderProps) : style) } as CSSProperties);
	const attributes = { "data-sheet-drawer": "", "data-sheet-detached": options.isDetached || undefined, "data-sheet-snap-points": points.length ? "true" : undefined, "data-sheet-handle-only": options.isHandleOnly || undefined };
	const content = (renderProps: ModalRenderProps) => typeof children === "function" ? children({ ...renderProps, defaultChildren: null }) : children;
	if (!options.isModal) {
		const renderProps = { ...presence!, defaultClassName: "", defaultStyle: {} };
		const domProps = { ...filterDOMProps(props, { global: true, events: true }), ...attributes, ...gestureProps, ref: setRef, "data-entering": presence?.isEntering || undefined, "data-exiting": presence?.isExiting || undefined, className: contentClass(renderProps), style: contentStyle(renderProps), children: content(renderProps) };
		return renderElement ? renderElement(domProps, renderProps) : <div {...domProps} />;
	}
	return <Modal {...props} {...attributes} ref={setRef} className={contentClass} style={contentStyle} render={(domProps, renderProps) => renderElement ? renderElement(mergeProps(domProps, gestureProps), renderProps) : <div {...mergeProps(domProps, gestureProps)} />}>{content}</Modal>;
}

function SheetDialog({ className = "", ref, render, ...props }: SheetDialogProps) {
	const { options } = useSheet();
	const setRef = useCallback((element: HTMLElement | null) => {
		assignRef(ref, element);
		if (element && options.shouldAutoFocus) queueMicrotask(() => element.querySelector<HTMLElement>("[autofocus], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), a[href], [tabindex='0']")?.focus());
	}, [ref, options.shouldAutoFocus]);
	return <Dialog {...props} ref={setRef} className={`sheet__dialog sheet__dialog--${options.placement} ${className}`} render={(domProps, renderProps) => render ? render({ ...domProps, "aria-modal": options.isModal || undefined }, renderProps) : <section {...domProps} aria-modal={options.isModal || undefined} />} />;
}
function SheetHeading({ className = "", ...props }: SheetHeadingProps) { return <Heading slot="title" {...props} className={`sheet__heading ${className}`} />; }
function SheetHeader({ className = "", ...props }: SheetLayoutProps) { return <div {...props} className={`sheet__header ${className}`} />; }
function SheetBody({ className = "", ...props }: SheetLayoutProps) { return <div {...props} className={`sheet__body ${className}`} />; }
function SheetFooter({ className = "", ...props }: SheetLayoutProps) { return <div {...props} className={`sheet__footer ${className}`} />; }
function SheetHandle({ preventCycle = false, className, onPress, children, ...props }: SheetHandleProps) {
	const { options, state, snap, setSnap, suppressClick } = useSheet();
	return <Button aria-label="Drag sheet" {...props} className={(renderProps) => `sheet__handle ${typeof className === "function" ? className(renderProps) : className ?? ""}`} onPress={(event) => {
		if (suppressClick.current) return;
		onPress?.(event);
		if (preventCycle) return;
		const points = options.snapPoints ?? [];
		const index = points.indexOf(snap!);
		if (points.length && index < points.length - 1) setSnap(points[index + 1]);
		else if (options.isDismissable) state.close();
		else if (points.length) setSnap(points[0]);
	}}>{children ?? <span className="sheet__handle-bar" />}</Button>;
}
function SheetCloseTrigger({ className, onPress, ...props }: SheetCloseTriggerProps) {
	const { state } = useSheet();
	return <CloseButton {...props} className={(renderProps) => `sheet__close-trigger ${typeof className === "function" ? className(renderProps) : className ?? ""}`} onPress={(event) => { onPress?.(event); state.close(); }} />;
}
function SheetNestedRoot(props: SheetProps) {
	useSheet();
	return <SheetRoot {...props} isNested />;
}

export const Sheet = Object.assign(SheetRoot, { Trigger: SheetTrigger, Close: SheetClose, Backdrop: SheetBackdrop, Content: SheetContent, Dialog: SheetDialog, Header: SheetHeader, Heading: SheetHeading, Body: SheetBody, Footer: SheetFooter, Handle: SheetHandle, CloseTrigger: SheetCloseTrigger, NestedRoot: SheetNestedRoot });
