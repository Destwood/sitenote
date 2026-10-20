export interface HelloOverlayProps {
  title?: string;
}

export function HelloOverlay({ title = "Sitenote" }: HelloOverlayProps) {
  return (
    <div
      role="status"
      data-testid="sitenote-hello"
      className="fixed right-4 bottom-4 z-2147483647 rounded-lg border border-neutral-200 bg-white px-4 py-3 font-sans text-sm text-neutral-900 shadow-lg"
    >
      <p className="font-semibold">{title}</p>
      <p className="text-neutral-600">Overlay is running</p>
    </div>
  );
}
