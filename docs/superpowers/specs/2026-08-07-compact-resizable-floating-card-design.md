# Compact, Host-Aligned Translation Card Design

## Goal

Keep the translation card visually attached to Zotero's native annotation popup while a translation is requested and rendered. Reduce the card's default footprint for paper reading, and allow deliberate resizing only after the user drags the card out into a standalone floating window.

## Root Cause

The current translate-button handler calls `#detachFromHost()` immediately after starting the request. Detachment moves the card from Zotero's popup container into the reader document body, where its fixed 440 px width is independent of the annotation toolbar. This creates the visible width mismatch. The same stylesheet fixes the card width and maximum height without a resize affordance.

## Considered Approaches

1. **Keep the current detach-on-translate behavior and only reduce dimensions.** Small change, but it preserves the width mismatch and unnecessary movement.
2. **Never detach the card.** Maintains perfect host alignment, but removes the existing ability to move the translation aside when it obscures the paper.
3. **Keep the card embedded through translation; detach only after an intentional title-bar drag.** This preserves the harmonious annotation-popup layout by default and retains a movable, resizable reading aid when requested. This is the selected approach.

## Interaction Design

1. Selecting PDF text opens the translation card inside Zotero's native annotation popup.
2. Clicking `翻译` starts exactly one request without moving or reparenting the card.
3. Loading, partial output, completed translation, error, retry, copy, source expansion, and close all remain in the same embedded card.
4. A title-bar drag crossing the existing 4 px movement threshold detaches the card at its current screen coordinates. A click or tiny pointer movement does not detach it.
5. Only the detached card exposes native bottom-right resizing. The embedded card follows the host width and cannot be independently resized.
6. Closing and reopening a selection starts from the compact default size; user-resized dimensions are session-local and are not persisted.

## Compact Visual Scale

- Default standalone width: 380 px instead of 440 px.
- Maximum height: 520 px instead of 620 px, always capped by the reader viewport.
- Detached resize bounds: minimum 320 × 240 px; maximum remains the available viewport minus 12 px margins.
- Base text: 12 px instead of 13 px.
- Translation text: 14 px instead of 15 px, retaining a relaxed line height for Chinese readability.
- Title bar, source card, action button, status row, internal gaps, and footer padding are reduced proportionally.
- Interactive controls retain at least a 36 px hit target; the visual compaction must not reduce accessibility.
- Light theme, dark theme, focus rings, loading animation, and the established color palette remain unchanged.

## Layout and Resize Rules

- Embedded mode uses `width: 100%` within Zotero's host, with a compact 380 px preferred/max width so the host and card size together.
- Detached mode uses the current measured embedded rectangle as its initial position and size, preventing a jump at the detach boundary.
- Detached mode sets `resize: both` and `overflow: hidden`; internal result content remains the scrolling region.
- Resize completion and viewport resize both clamp the card's position and dimensions inside the reader viewport.
- Source expansion may increase internal content demand but must not enlarge the outer card beyond its current or viewport-limited size.

## Data and Error Boundaries

- Translation API behavior, context indexing, retry policy, caching, prompts, and response parsing are unchanged.
- Selection alone still makes zero API calls.
- The translate button still normalizes the internal mode to `sentence` and remains disabled during an active request.
- Detaching and resizing are presentation-only operations and must never start or cancel a request.

## Test and Acceptance Strategy

Automated tests must prove the following through a red-green cycle:

- Clicking `翻译` keeps the card parented to the Zotero host and retains the embedded class.
- The translation handler still fires exactly once before any layout transition.
- Crossing the drag threshold detaches the card once and preserves its measured position and dimensions.
- Embedded CSS has no resize affordance; detached CSS has `resize: both`, compact defaults, and minimum dimensions.
- Detached resize/viewport changes cannot leave any edge outside the 12 px viewport margin.
- Existing close, copy, retry, source expansion, no-auto-translation, and accessibility tests remain green.

Acceptance in Zotero 9 uses both short and long selections:

1. The card and native annotation popup remain aligned before, during, and after translation.
2. The compact card occupies materially less paper area while all text remains readable.
3. Dragging the title bar produces one standalone card without a size jump.
4. The detached card can be resized from the bottom-right and remains usable at its minimum size.
5. The card remains within the reader viewport after resizing, source expansion, and reader-window resizing.

The full Node test suite, production XPI build, manifest/runtime audit, and isolated Zotero acceptance must pass before release.

## Scope

This change does not persist window geometry, add preferences for font size, change translation semantics, or alter Zotero's annotation toolbar.
