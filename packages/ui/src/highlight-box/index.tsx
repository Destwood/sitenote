import type { AnchorRect } from "../placement";
import { Z_INDEX } from "../z-index";

export interface HighlightBoxProps {
  rect: AnchorRect;
}

export function HighlightBox({ rect }: HighlightBoxProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="sitenote-highlight"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: Z_INDEX.highlight,
      }}
      className="pointer-events-none fixed box-border rounded-sm border-2 border-blue-700 bg-blue-700/10"
    />
  );
}
