import { handleCreateTask } from "./handler.ts";

Deno.serve((request) => handleCreateTask(request, Deno.env.toObject(), fetch));
