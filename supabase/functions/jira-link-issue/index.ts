import { handleLinkIssue } from "./handler.ts";

Deno.serve((request) => handleLinkIssue(request, Deno.env.toObject(), fetch));
