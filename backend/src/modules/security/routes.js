/** Routes that ask a model, stream a reply, or upload a file. */
export const LIMITED_ROUTES = [
  { method: "POST", path: "/api/rag/ask" },
  { method: "POST", path: "/api/rag/stream" },
  { method: "POST", path: "/api/streaming/chat" },
  { method: "POST", path: /^\/api\/conversations\/threads\/[^/]+\/stream$/ },
  { method: "POST", path: "/api/rag/documents" },
  { method: "POST", path: "/api/documents" },
];

export function routeLabel(route) {
  if (route.path instanceof RegExp) return `${route.method} /api/conversations/threads/:id/stream`;
  return `${route.method} ${route.path}`;
}

export function isLimited(req, routes = LIMITED_ROUTES) {
  return routes.some((route) => {
    if (req.method !== route.method) return false;
    if (route.path instanceof RegExp) return route.path.test(req.path);
    return req.path === route.path;
  });
}
