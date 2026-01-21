/* src/worker.js */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/scope' && request.method === 'POST') {
      // TODO: Replace stub with D1 voter-file matching and quality scoring.
      const payload = {
        scope: 'public',
        match_quality: 'none',
      };
      return new Response(JSON.stringify(payload), {
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
