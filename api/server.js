import { createServer } from '../server/http.js';

// Vercel accepts an exported native HTTP server, including upgrade handlers.
// Do not call listen() here; Vercel owns the listener.
export default createServer();
