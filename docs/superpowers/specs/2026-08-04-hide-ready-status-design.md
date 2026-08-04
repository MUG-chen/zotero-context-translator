# Hide Ready Status Design

## Goal

Remove the redundant `选择一种翻译方式` row from the initial floating-card state without removing useful progress, success, or error feedback.

## Behavior

- When the card state is `ready`, hide the complete status row, including its dot and reserved layout space.
- Keep the single `翻译` button visible and enabled.
- Do not trigger translation automatically; selection alone must still produce zero API requests.
- When state changes to `loading`, `result`, or `error`, show the existing status row and its existing state-specific text.
- Preserve close, drag, source expansion, copy, retry, context indexing, and translation behavior.

## Implementation Boundary

`FloatingView.render()` controls visibility through the existing status state. `populateDialog()` exposes the status-row node to `render()`. No API, prompt, cache, or Reader integration code changes are required.

## Verification

- A focused test must fail before implementation because the ready status row is currently visible.
- The ready state hides `.zct-status-row` and does not display `选择一种翻译方式`.
- Loading, result, and error states show `.zct-status-row` again.
- The single `翻译` button and zero-mode-button contract remain unchanged.
- The full suite, XPI audit, and isolated Zotero 9.0.6 acceptance must pass.

## Release

Ship the change as version `0.1.5` and preserve all earlier release artifacts.
