import { handleSearchIssues } from "./handler.ts";

Deno.serve((request) => handleSearchIssues(request, Deno.env.toObject(), fetch));
