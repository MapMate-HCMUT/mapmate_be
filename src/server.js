import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

try {
  await connectDB();
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Backend running at http://localhost:${env.port}`);
  });
} catch (err) {
  console.error('Failed to start server:', err.message);
  process.exit(1);
}
