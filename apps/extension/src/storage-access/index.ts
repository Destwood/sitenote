export interface RestrictableArea {
  setAccessLevel: (options: { accessLevel: "TRUSTED_CONTEXTS" }) => Promise<void>;
}

export async function restrictToTrustedContexts(area: RestrictableArea): Promise<boolean> {
  try {
    await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    return true;
  } catch {
    return false;
  }
}
