import { handleHierarchy } from "./handler.ts";

Deno.serve((request) => handleHierarchy(request, Deno.env.toObject(), fetch));
