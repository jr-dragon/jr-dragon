# Sheet and File Tree

These components use HeroUI v3 controls and theme tokens with React Aria behavior. Their compound APIs follow the public [HeroUI Pro Sheet](https://heroui.pro/docs/react/components/sheet) and [File Tree](https://heroui.pro/docs/react/components/file-tree) documentation. The implementation is local and does not require `@heroui-pro/react`.

Visit `/components/` for interactive examples. From Astro, hydrate a React wrapper with `client:load`; keep the compound parts within the same React island. Import the site's global CSS so Tailwind and `@heroui/styles` are available. Component CSS is imported by the component modules.

## Sheet

```tsx
import { Button } from "@heroui/react";
import { Sheet } from "./sheet";

export function Example() {
  return (
    <Sheet placement="bottom">
      <Sheet.Trigger><Button>Open Sheet</Button></Sheet.Trigger>
      <Sheet.Backdrop variant="opaque">
        <Sheet.Content className="mx-auto max-w-[420px]">
          <Sheet.Dialog>
            <Sheet.Handle />
            <Sheet.CloseTrigger />
            <Sheet.Header><Sheet.Heading>Sheet title</Sheet.Heading></Sheet.Header>
            <Sheet.Body>Content</Sheet.Body>
            <Sheet.Footer><Sheet.Close><Button>Done</Button></Sheet.Close></Sheet.Footer>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}
```

The root accepts `isOpen`, `defaultOpen`, `onOpenChange`, `placement`, `isDismissable`, `isDetached`, `isModal`, `isNested`, `isHandleOnly`, `snapPoints`, `activeSnapPoint`, `onActiveSnapPointChange`, `fadeFromIndex`, `closeThreshold`, `shouldScaleBackground`, `onDrag`, `onRelease`, `onClose`, `onAnimationEnd`, and `shouldAutoFocus`. Defaults match the public reference. Snap points accept viewport ratios such as `0.5`, pixel numbers such as `320`, and strings such as `"320px"` or `"50%"`.

`Backdrop`, `Content`, `Dialog`, and `Heading` expose the corresponding React Aria props. `CloseTrigger` accepts HeroUI `CloseButton` props. `Header`, `Body`, and `Footer` accept div props. Trigger and Close each wrap a single React Aria pressable child, preserving its existing `onPress` handler. Handle accepts `preventCycle` to disable click cycling. Use `NestedRoot` inside a parent sheet for automatic parent scaling. Non-modal sheets leave background interaction and page scrolling available.

Wrap page content in an element with `data-sheet-wrapper` when using `shouldScaleBackground`. Keep the sheet's portal outside that element (the default portal is in `document.body`). Use `data-sheet-no-drag` on custom interactive regions to exclude them from dragging. Scrolling descendants consume their own gestures until reaching an edge.

## File Tree

```tsx
import { FileTree } from "./file-tree";

export function Files() {
  return (
    <FileTree aria-label="Project files" defaultExpandedKeys={["src"]} selectionMode="multiple">
      <FileTree.Section>
        <FileTree.Header>Project</FileTree.Header>
        <FileTree.Item id="src" title="src">
          <FileTree.Item id="index" title="index.astro" />
        </FileTree.Item>
      </FileTree.Section>
    </FileTree>
  );
}
```

The root adds `size` (`sm`, `md`, `lg`; default `md`), `showGuideLines` (`true`, `false`, `"hover"`; default `true`), and `reduceMotion` (default `false`) to React Aria Tree props. Item adds required `title`, optional `icon` (a node or a render function receiving `isExpanded`, `hasChildItems`, and `allowsDragging`), and `dragIcon` (a node or `false`). For rich titles, provide `textValue` for typeahead and accessible naming. Put `FileTree.Indicator` directly inside an Item to replace its chevron. Section and Header forward their React Aria props.

Dynamic collections use React Aria `Collection`. `useFileTree({ items, isLeaf? })` returns `expandableKeys`, `leaves`, and `filterTree(predicate)`; filtering preserves ancestors of matching leaves without modifying the source. Nodes use string `id` values and optional `children` arrays.

`useFileTreeDrag({ tree, getItems?, onMove? })` takes the object returned by React Aria `useTreeData` and returns `dragAndDropHooks` for the root. It moves existing nodes and their descendants within that tree. Nodes with children, or an explicit `children: []` value, accept drops on them; leaves accept drops before or after them. Moves into a selected node's own descendants are rejected. `getItems` customizes drag data, and `onMove` runs after a valid move. The preview includes a complete dynamic example, including keyboard drag controls.

## Validation

Run `bun run test:components`, `bun run astro check`, and `bun run build`. Component tests cover controlled state, focus restoration, dismissal, placements, nesting, snap points, dragging, static and dynamic collections, filtering, and subtree moves. Public previews inform the styling; licensed source parity and physical-device behavior are not established by these checks.
