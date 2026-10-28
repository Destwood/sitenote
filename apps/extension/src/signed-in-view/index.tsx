import { useState } from "react";

import { AccountPanel } from "../account-panel";
import { AllowedSitesPanel } from "../allowed-sites-panel";
import { LINK_BUTTON_CLASS } from "../form-controls";
import { type AuthState } from "../messages";
import { NotificationsRow } from "../notifications-panel";
import { SitePanel } from "../site-panel";

type SignedInState = Extract<AuthState, { status: "signedIn" }>;

interface SignedInViewProps {
  user: SignedInState["user"];
  webUrl: string;
  onSignedOut: (state: AuthState) => void;
}

export function SignedInView({ user, webUrl, onSignedOut }: SignedInViewProps) {
  const [screen, setScreen] = useState<"main" | "manage">("main");
  const [siteVersion, setSiteVersion] = useState(0);

  if (screen === "manage") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Allowed sites</h2>
          <button
            type="button"
            onClick={() => {
              setScreen("main");
            }}
            className={LINK_BUTTON_CLASS}
          >
            Back
          </button>
        </div>
        <AllowedSitesPanel
          onChanged={() => {
            setSiteVersion((version) => version + 1);
          }}
        />
        <AccountPanel user={user} webUrl={webUrl} onSignedOut={onSignedOut} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SitePanel
        key={siteVersion}
        webUrl={webUrl}
        onManageSites={() => {
          setScreen("manage");
        }}
      />
      <NotificationsRow webUrl={webUrl} />
      <AccountPanel user={user} webUrl={webUrl} onSignedOut={onSignedOut} />
    </div>
  );
}
