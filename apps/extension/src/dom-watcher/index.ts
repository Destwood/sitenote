export const DOM_SETTLE_DELAY_MS = 250;
export const DOM_SETTLE_MAX_WAIT_MS = 2000;

export interface DomWatcherDeps {
  root: Node;
  isOwn: (node: Node) => boolean;
  onSettled: () => void;
  delay?: number;
  maxWait?: number;
}

export function watchDom(deps: DomWatcherDeps): () => void {
  const delay = deps.delay ?? DOM_SETTLE_DELAY_MS;
  const maxWait = deps.maxWait ?? DOM_SETTLE_MAX_WAIT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstAt = 0;

  function isRelevant(record: MutationRecord): boolean {
    if (deps.isOwn(record.target)) {
      return false;
    }
    if (record.type === "childList") {
      const changed = [...record.addedNodes, ...record.removedNodes];
      return changed.length === 0 || !changed.every((node) => deps.isOwn(node));
    }
    return true;
  }

  function fire(): void {
    timer = null;
    deps.onSettled();
  }

  function schedule(): void {
    const now = Date.now();
    if (timer === null) {
      firstAt = now;
    } else {
      clearTimeout(timer);
    }
    timer = setTimeout(fire, Math.min(delay, Math.max(0, firstAt + maxWait - now)));
  }

  const observer = new MutationObserver((records) => {
    if (records.some(isRelevant)) {
      schedule();
    }
  });
  observer.observe(deps.root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });

  return () => {
    observer.disconnect();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
