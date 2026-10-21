import { FOCUS_RING } from "../control-classes";
import { placeAbove, type AnchorRect } from "../placement";
import { useViewport } from "../viewport";
import { Z_INDEX } from "../z-index";

export const SELECTION_BUTTON_SIZE = { width: 96, height: 32 };

export interface SelectionButtonProps {
  rect: AnchorRect;
  onClick: () => void;
}

export function SelectionButton({ rect, onClick }: SelectionButtonProps) {
  const viewport = useViewport();
  const { left, top } = placeAbove(rect, SELECTION_BUTTON_SIZE, viewport);

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
      style={{ left, top, ...SELECTION_BUTTON_SIZE, zIndex: Z_INDEX.selectionButton }}
      className={`fixed box-border inline-flex cursor-pointer items-center justify-center rounded-md bg-neutral-900 font-sans text-sm font-semibold text-white shadow-lg hover:bg-neutral-700 ${FOCUS_RING}`}
    >
      Comment
    </button>
  );
}
