export const FORGET_SESSION_PATH = "/auth/forget-session";

export async function forgetWebSession(): Promise<boolean> {
  try {
    const response = await fetch(FORGET_SESSION_PATH, {
      method: "POST",
      credentials: "same-origin",
    });
    return response.ok;
  } catch {
    return false;
  }
}
