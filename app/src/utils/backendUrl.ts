/**
 * Automatically resolves the backend API & WebSocket base URL.
 * - Prioritizes VITE_BACKEND_URL environment variable if provided.
 * - In local development (Vite on port 5173), routes to http://localhost:8080.
 * - In production (e.g. deployed monolithically on Render), defaults to window.location.origin.
 */
export function getBackendUrl(): string {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, port, origin } = window.location;
    // Local Vite dev server proxying to Express backend
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port !== '8080') {
      return `http://${hostname}:8080`;
    }
    // Production on Render or same-origin deployment
    return origin;
  }
  return 'http://localhost:8080';
}
