import { handleSaveSettings } from "./handler.ts";

Deno.serve((request) => handleSaveSettings(request, Deno.env.toObject(), fetch));
