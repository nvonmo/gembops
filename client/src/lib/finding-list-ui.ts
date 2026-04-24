/**
 * Shared list UI for findings (Hallazgos, Seguimiento, diálogos con miniaturas).
 * Thumbs: 64px mobile / 80px sm+; touch-manipulation + focus ring for accessibility.
 */

export const findingListThumbFrame =
  "size-16 sm:size-20 rounded-md border border-border overflow-hidden bg-muted shrink-0";

/** Use for <button> thumbnails (image / video open). */
export const findingListThumbButtonClass =
  `${findingListThumbFrame} cursor-pointer hover:opacity-80 active:opacity-95 transition-opacity p-0 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`;

/** Use for clickable <div> wrapping an img (legacy pattern in cards). */
export const findingListThumbClickableClass =
  `${findingListThumbFrame} cursor-pointer hover:opacity-80 active:opacity-95 transition-opacity touch-manipulation`;

/** “+N” more-attachments control: same footprint as thumbs. */
export const findingListThumbMoreClass =
  `${findingListThumbFrame} flex items-center justify-center text-xs font-medium text-muted-foreground hover:bg-muted/80 cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`;

export const FINDING_LIST_THUMB_IMG_SIZE = 80;

/** Primary row action (e.g. Cerrar): ≥44px tap height on mobile (aligns with shadcn sm on sm+). */
export const findingListPrimaryActionButtonClass =
  "min-h-11 px-3 text-xs touch-manipulation sm:min-h-8";

/** Ghost actions on finding cards: comfortable tap target on narrow screens. */
export const findingCardGhostButtonClass = "min-h-11 touch-manipulation sm:min-h-8";
