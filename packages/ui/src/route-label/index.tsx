import { abbreviateRoute } from "@sitenote/core";
import { Fragment, useState } from "react";

import { FOCUS_RING } from "../control-classes";

export function routeDisplayText(route: string): string {
  return `/${abbreviateRoute(route)
    .map((segment) => segment.text)
    .join("/")}`;
}

export interface RouteLabelProps {
  route: string;
  onCopy: (route: string) => void;
  className?: string;
}

export function RouteLabel({ route, onCopy, className }: RouteLabelProps) {
  const segments = abbreviateRoute(route);
  const [expanded, setExpanded] = useState<Readonly<Record<number, boolean>>>({});
  const copyLabel = `Copy route ${route}`;

  function toggle(index: number) {
    setExpanded((current) => ({ ...current, [index]: !current[index] }));
  }

  return (
    <span className={`break-all ${className ?? ""}`}>
      {segments.length === 0 ? (
        <button
          type="button"
          aria-label={copyLabel}
          onClick={() => {
            onCopy(route);
          }}
          className={`rounded-sm hover:underline ${FOCUS_RING}`}
        >
          /
        </button>
      ) : (
        segments.map((segment, index) => (
          <Fragment key={index}>
            /
            {segment.dynamic ? (
              <button
                type="button"
                aria-pressed={expanded[index] === true}
                title={expanded[index] === true ? "Hide full value" : "Show full value"}
                onClick={() => {
                  toggle(index);
                }}
                className={`rounded-sm bg-neutral-100 px-1 font-mono ${FOCUS_RING}`}
              >
                {expanded[index] === true ? segment.full : segment.text}
              </button>
            ) : (
              <button
                type="button"
                aria-label={copyLabel}
                onClick={() => {
                  onCopy(route);
                }}
                className={`rounded-sm hover:underline ${FOCUS_RING}`}
              >
                {segment.text}
              </button>
            )}
          </Fragment>
        ))
      )}
    </span>
  );
}
