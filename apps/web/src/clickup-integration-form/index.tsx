"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ChangeEvent, type SyntheticEvent } from "react";

import {
  disconnectClickUp,
  loadClickUpHierarchy,
  saveClickUpSettings,
  type ClickUpConnection,
  type ClickUpFailure,
  type ClickUpItem,
} from "../clickup-api";
import {
  ERROR_CLASS,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../form-controls";
import { getSupabaseBrowserClient } from "../supabase-browser";

const DISCONNECT_CONFIRMATION = "Disconnect ClickUp? Tasks already created stay in ClickUp.";

interface ClickUpIntegrationFormProps {
  workspaceId: string;
  connection: ClickUpConnection | null;
}

export function ClickUpIntegrationForm({ workspaceId, connection }: ClickUpIntegrationFormProps) {
  const router = useRouter();
  const ids = {
    token: useId(),
    team: useId(),
    space: useId(),
    list: useId(),
  };
  const [token, setToken] = useState("");
  const [teams, setTeams] = useState<ClickUpItem[] | null>(null);
  const [spaces, setSpaces] = useState<ClickUpItem[]>([]);
  const [lists, setLists] = useState<ClickUpItem[]>([]);
  const [teamId, setTeamId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [listId, setListId] = useState("");
  const [error, setError] = useState<ClickUpFailure | null>(null);
  const [pending, setPending] = useState(false);

  const tokenOrUndefined = token.length > 0 ? token : undefined;
  const selectedTeam = teams?.find((team) => team.id === teamId);
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  const selectedList = lists.find((list) => list.id === listId);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  function loadTeams(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const outcome = await loadClickUpHierarchy(getSupabaseBrowserClient(), {
        workspaceId,
        token: tokenOrUndefined,
      });
      if (!outcome.ok) {
        setError(outcome);
        return;
      }
      setTeams(outcome.data.teams);
      setTeamId("");
      setSpaces([]);
      setSpaceId("");
      setLists([]);
      setListId("");
    });
  }

  function chooseTeam(event: ChangeEvent<HTMLSelectElement>) {
    const nextTeamId = event.target.value;
    setTeamId(nextTeamId);
    setSpaces([]);
    setSpaceId("");
    setLists([]);
    setListId("");
    if (nextTeamId === "") {
      return;
    }
    void run(async () => {
      const outcome = await loadClickUpHierarchy(getSupabaseBrowserClient(), {
        workspaceId,
        token: tokenOrUndefined,
        teamId: nextTeamId,
      });
      if (!outcome.ok) {
        setError(outcome);
        return;
      }
      setSpaces(outcome.data.spaces ?? []);
    });
  }

  function chooseSpace(event: ChangeEvent<HTMLSelectElement>) {
    const nextSpaceId = event.target.value;
    setSpaceId(nextSpaceId);
    setLists([]);
    setListId("");
    if (nextSpaceId === "" || teamId === "") {
      return;
    }
    void run(async () => {
      const outcome = await loadClickUpHierarchy(getSupabaseBrowserClient(), {
        workspaceId,
        token: tokenOrUndefined,
        teamId,
        spaceId: nextSpaceId,
      });
      if (!outcome.ok) {
        setError(outcome);
        return;
      }
      setLists(outcome.data.lists ?? []);
    });
  }

  function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedTeam === undefined || selectedSpace === undefined || selectedList === undefined) {
      return;
    }
    void run(async () => {
      const outcome = await saveClickUpSettings(getSupabaseBrowserClient(), {
        workspaceId,
        token: tokenOrUndefined,
        teamId: selectedTeam.id,
        teamName: selectedTeam.name,
        spaceId: selectedSpace.id,
        spaceName: selectedSpace.name,
        listId: selectedList.id,
        listName: selectedList.name,
      });
      if (!outcome.ok) {
        setError(outcome);
        return;
      }
      setToken("");
      setTeams(null);
      router.refresh();
    });
  }

  function disconnect() {
    if (!window.confirm(DISCONNECT_CONFIRMATION)) {
      return;
    }
    void run(async () => {
      const outcome = await disconnectClickUp(getSupabaseBrowserClient(), workspaceId);
      if (!outcome.ok) {
        setError(outcome);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {connection === null ? null : (
        <section aria-labelledby={`${ids.token}-status`} className="flex flex-col gap-3">
          <h2 id={`${ids.token}-status`} className="text-lg font-semibold">
            Connected
          </h2>
          <p className="text-neutral-700">
            Tasks go to {connection.listName} in {connection.spaceName} ({connection.teamName}).
          </p>
          <div>
            <button
              type="button"
              onClick={disconnect}
              disabled={pending}
              className={SECONDARY_BUTTON_CLASS}
            >
              Disconnect
            </button>
          </div>
        </section>
      )}

      <form onSubmit={loadTeams} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {connection === null ? "Connect ClickUp" : "Change the list"}
        </h2>
        <label
          htmlFor={ids.token}
          className="flex flex-col gap-1 text-sm font-medium text-neutral-800"
        >
          {connection === null ? "Personal token" : "Replace the personal token (optional)"}
          <input
            id={ids.token}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
            }}
            className={INPUT_CLASS}
          />
        </label>
        <button type="submit" disabled={pending} className={`${SECONDARY_BUTTON_CLASS} w-fit`}>
          Load teams
        </button>
      </form>

      {teams === null ? null : (
        <div className="flex flex-col gap-4">
          <label
            htmlFor={ids.team}
            className="flex flex-col gap-1 text-sm font-medium text-neutral-800"
          >
            Team
            <select id={ids.team} value={teamId} onChange={chooseTeam} className={INPUT_CLASS}>
              <option value="">Choose a team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label
            htmlFor={ids.space}
            className="flex flex-col gap-1 text-sm font-medium text-neutral-800"
          >
            Space
            <select
              id={ids.space}
              value={spaceId}
              onChange={chooseSpace}
              disabled={spaces.length === 0}
              className={INPUT_CLASS}
            >
              <option value="">Choose a space</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
          <label
            htmlFor={ids.list}
            className="flex flex-col gap-1 text-sm font-medium text-neutral-800"
          >
            List
            <select
              id={ids.list}
              value={listId}
              onChange={(event) => {
                setListId(event.target.value);
              }}
              disabled={lists.length === 0}
              className={INPUT_CLASS}
            >
              <option value="">Choose a list</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={save}>
            <button
              type="submit"
              disabled={pending || selectedList === undefined}
              className={`${PRIMARY_BUTTON_CLASS} w-fit`}
            >
              Save ClickUp list
            </button>
          </form>
        </div>
      )}

      {error === null ? null : (
        <p role="alert" data-error-code={error.code} className={ERROR_CLASS}>
          {error.message}
        </p>
      )}
    </div>
  );
}
