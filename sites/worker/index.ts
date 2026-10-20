// The Site's single entry. The platform calls fetch(request, env) and expects
// a Response. Everything testable lives in app.ts; this file is the shape the
// host loads.

import { handleFetch, type SitesEnv } from './app.ts';

export default {
  async fetch(request: Request, env: SitesEnv): Promise<Response> {
    return handleFetch(request, env);
  },
};

export { handleFetch };
