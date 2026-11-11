export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Import the bundled Express app
// @ts-ignore - The file is generated during build
import appBundle from './_app.cjs';

// Extract the express app instance robustly depending on how CJS exports map to ESM
const app = (appBundle as any).default || (appBundle as any).app || appBundle;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
