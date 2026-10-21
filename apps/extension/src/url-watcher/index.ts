export interface UrlWatcherDeps {
  win: Window;
  readPageUrl: () => string | null;
  onChange: () => void;
}

export interface UrlWatcher {
  check: () => void;
  stop: () => void;
}

export function watchPageUrl(deps: UrlWatcherDeps): UrlWatcher {
  const { win } = deps;
  const candidate: unknown = Reflect.get(win, "navigation");
  const navigation = candidate instanceof EventTarget ? candidate : null;
  let last = deps.readPageUrl();

  function check(): void {
    const current = deps.readPageUrl();
    if (current !== last) {
      last = current;
      deps.onChange();
    }
  }

  navigation?.addEventListener("currententrychange", check);
  win.addEventListener("popstate", check);
  win.addEventListener("hashchange", check);

  return {
    check,
    stop: () => {
      navigation?.removeEventListener("currententrychange", check);
      win.removeEventListener("popstate", check);
      win.removeEventListener("hashchange", check);
    },
  };
}
