# Context Translator

The Zotero Context Translator presents context-aware academic translations without interrupting PDF reading.

## Language

**Selection Translation Trigger**:
An ephemeral compact action attached below Zotero's current text-selection popup. It captures that selection and starts a translation only when explicitly clicked. A later selection in the same paper replaces only the trigger; a selection in another paper ends the previous paper's Active Translation Card.
_Avoid_: Mini translation card, translation bar, floating translator

**Active Translation Card**:
The single full translation card whose translation has been explicitly triggered. Its loading, success, and error states are independent of later text selections in the same paper. Clicking another Selection Translation Trigger reuses the card: its position and width persist; a user-set height persists, while an Auto-fit height resets compactly and grows for the new result.
_Avoid_: Current selection card, pinned card, persistent window

**Triggered Selection Snapshot**:
The immutable text, document identity, geometry, and context reference captured when a Selection Translation Trigger is clicked. Translation, copy, retry, and context analysis use this snapshot rather than any later text selection.
_Avoid_: Current selection, pending selection, live selection

**Anchored Translation Card**:
The initial placement of an Active Translation Card near the Selection Translation Trigger. It belongs to the PDF reader's persistent layer rather than Zotero's ephemeral text-selection popup.
_Avoid_: Embedded Translation Card, attached window, annotation card

**Detached Translation Card**:
A translation card the reader has moved away from its anchored position.
_Avoid_: Separate popup, moved card

**Auto-fit**:
The detached card's default sizing mode, where visible result content may increase—but never automatically decrease—its height while its width and chosen position remain stable.
_Avoid_: Automatic resize

**User-sized**:
The detached card's sizing mode after the reader explicitly resizes it; later content respects that size for the current card's lifetime.
_Avoid_: Fixed height, locked card
