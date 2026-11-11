// Netlify Function: every /api/* request lands here.
import { handle } from '../../server/router.js';

export default (req) => handle(req);

export const config = { path: '/api/*' };
