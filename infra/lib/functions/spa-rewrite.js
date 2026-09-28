function handler(event) {
  var request = event.request;
  var segments = request.uri.split('/');
  var lastSegment = segments[segments.length - 1];

  // SPA fallback: only the last path segment tells extension vs. route,
  // so a request like '/v1.2/products' isn't mistaken for a static asset.
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }

  return request;
}
