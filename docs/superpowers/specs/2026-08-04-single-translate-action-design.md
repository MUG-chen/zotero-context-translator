# Single Translate Action Design

## Goal

Remove the four translation-mode choices from the floating card and replace them with one explicit `翻译` action. Selecting PDF text must remain free of API calls; the API is called only after the user presses the single action.

## User Interface

- Remove `词语`, `整句`, `段落`, and `解释` buttons.
- Render one full-width primary `翻译` button in the existing action area.
- Do not expose mode selection, selected-mode styling, `data-mode`, or `aria-pressed` state.
- Disable the button while a translation request is active and present the existing loading state in the same floating card.
- Preserve close, drag, source expansion, copy, retry, status, and result presentation.

## Data Flow

1. A PDF text selection opens the floating card and starts background context indexing.
2. No API request is made at selection time.
3. Pressing `翻译` invokes the existing translation handler exactly once with the unified internal mode `sentence`.
4. The existing context pipeline supplies title, abstract, section path, nearby paragraphs, and confirmed terminology.
5. The card detaches from Zotero's native selection popup only after the action fires, preserving the current event order.
6. Retry reuses the same selection and unified internal mode.

The internal translation pipeline continues accepting a mode parameter for compatibility and focused unit tests, but the production UI no longer exposes mode choice.

## Error and Cost Boundaries

- Mere selection, popup creation, source expansion, dragging, closing, and copying must not call the API.
- Repeated clicks during loading are prevented by disabling the single button.
- Existing timeout, retry, partial-result, and sanitized error behavior remains unchanged.

## Accessibility

- The action remains a native `button` with the visible name `翻译`.
- It keeps at least a 36 px hit target and visible keyboard focus styling.
- The action container is no longer presented as a translation-mode group.

## Verification

- A focused view test must fail before implementation because the old UI exposes four `[data-mode]` buttons.
- After implementation, the floating card contains one translate button and zero mode buttons.
- One click invokes translation once with `sentence`, before the embedded card detaches.
- Rendering loading/result/error states does not recreate the button or restore mode controls.
- The plugin test continues proving no API call occurs until the explicit action is invoked.
- The full suite, package build, manifest audit, and isolated Zotero 9.0.6 reader acceptance must pass before release.

## Release

Ship the change as version `0.1.4`, preserving all previous release artifacts.
