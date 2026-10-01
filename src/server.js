import app from "./app.js";
import { connectDB } from "./config/db.js";

const port = process.env.PORT || 3000;

try {
  await connectDB();
  app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
  });
} catch (err) {
  console.error("Failed to start server:", err.message);
  process.exit(1);
}
