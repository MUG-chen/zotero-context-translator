# Stable Drag Origin Design

## Problem

The translation card begins inside Zotero's native text-selection popup. After translation starts, the card's contents and height change. Zotero may then recalculate the native popup position between the card's `pointerdown` event and the first `pointermove` that crosses the drag threshold.

The plugin currently records the card position on `pointerdown`, but reads the rectangle again when the threshold is crossed. That second rectangle can contain Zotero's newly calculated position, so the detached card jumps to the side of the screen before following the pointer.

## Required Behavior

- Clicking Translate must keep the card embedded.
- Movements below the existing four-pixel threshold must not detach the card.
- Once a deliberate titlebar drag crosses the threshold, the card must detach from the position visible when the pointer was pressed.
- The same point within the titlebar must remain under the pointer while dragging.
- Zotero reflow or repositioning between `pointerdown` and `pointermove` must not change the drag origin.
- Existing viewport clamping, detached resizing, close behavior, and selection preservation must remain unchanged.

## Design

At `pointerdown`, store one immutable drag snapshot:

- pointer identifier;
- initial pointer coordinates;
- the card's initial rectangle, including width and height;
- the pointer's horizontal and vertical offset from the card's top-left corner;
- pending-detachment state.

Before the threshold is crossed, the card remains embedded. On the first qualifying `pointermove`, detach using the saved rectangle rather than querying the embedded card again. Position the detached card from the live pointer coordinates minus the saved grab offsets. Every later movement uses the same calculation and the existing viewport clamp.

The detach routine accepts the saved rectangle as an optional geometry source. This keeps the transition atomic: size and starting position come from the same visual frame, before Zotero can move the native popup.

## Alternatives Rejected

1. Detach on `pointerdown`: avoids reflow but turns ordinary clicks into detachments and weakens the existing threshold behavior.
2. Suppress Zotero popup repositioning: depends on Zotero's internal React layout and would be fragile across Zotero updates.
3. Continue using `initialLeft + pointerDelta`: better than re-reading the rectangle, but retaining explicit grab offsets more directly guarantees that the grabbed titlebar point stays under the pointer.

## Regression Test

The test will mount an embedded card, record a starting rectangle on `pointerdown`, then simulate Zotero moving the embedded card before the threshold-crossing `pointermove`. It will assert that the detached card:

- is appended to the reader document body;
- retains the original width and height;
- is positioned from the original grab point plus the actual pointer movement, not from Zotero's intervening position.

The production mutation this test catches is any renewed `getBoundingClientRect()` dependency at threshold crossing that replaces the `pointerdown` geometry.

## Acceptance

- The focused regression test fails before the production change and passes after it.
- The complete test suite passes.
- The built XPI contains the required plugin files and no tests, private paths, credentials, or paper files.
- Manual Zotero verification: start a translation, drag the titlebar while the model is loading or after the result appears, and confirm the card begins moving from its visible press location without jumping to a screen edge.
