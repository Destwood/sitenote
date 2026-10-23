import { handleNotifyEmail } from "./handler.ts";

Deno.serve((request) => handleNotifyEmail(request, Deno.env.toObject(), fetch));
