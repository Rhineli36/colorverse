import { resolve } from "node:path";
import { createCourseDatabase, migrateCourses } from "./database";
import { seedDevelopmentCourse } from "./seed";
import { createCourseServer } from "./server";
// This entry point deliberately cannot expose development identities publicly.
if (process.env.NODE_ENV === "production")
  throw new Error(
    "Production course login and private object storage must be configured before deployment; development login is disabled.",
  );
const directory = resolve(process.env.COURSE_DATA_DIR || "work/course-server");
const db = await createCourseDatabase({
  connectionString: process.env.DATABASE_URL,
  dataDir: resolve(directory, "postgres"),
});
await migrateCourses(db);
await seedDevelopmentCourse(db);
const port = Number(process.env.COURSE_API_PORT || 3001);
const origins = (
  process.env.COURSE_WEB_ORIGINS ||
  "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174"
).split(",");
const server = createCourseServer({
  db,
  mediaRoot: resolve(directory, "private-media"),
  origins,
  development: true,
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `COLORVERSE course development API: http://127.0.0.1:${port} (local test accounts only)`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => void db.close().then(() => process.exit(0)));
  });
