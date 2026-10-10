import type { CourseDatabase } from "./database";
import { uid } from "@colorverse/fixtures";
export const courseDemo = {
  student: uid(81001),
  otherStudent: uid(81002),
  teacher: uid(81003),
  outsider: uid(81004),
  classId: uid(82001),
  otherClassId: uid(82002),
  assignmentId: uid(83001),
};
export async function seedDevelopmentCourse(db: CourseDatabase) {
  await db.transaction(async (sql) => {
    for (const [id, name] of [
      [courseDemo.student, "测试学生 · 林同学"],
      [courseDemo.otherStudent, "测试学生 · 许同学"],
      [courseDemo.teacher, "测试教师 · 色彩老师"],
      [courseDemo.outsider, "测试教师 · 其他班级"],
    ])
      await sql.query(
        "INSERT INTO users(id,auth_issuer,auth_subject,display_name) VALUES($1::uuid,'development',$1::text,$2) ON CONFLICT(id) DO NOTHING",
        [id, name],
      );
    await sql.query(
      "INSERT INTO courses(id,title,created_by) VALUES($1,'设计色彩',$2) ON CONFLICT(id) DO NOTHING",
      [uid(82000), courseDemo.teacher],
    );
    for (const [id, title] of [
      [courseDemo.classId, "设计色彩 · 测试班级"],
      [courseDemo.otherClassId, "设计色彩 · 另一个班级"],
    ])
      await sql.query(
        "INSERT INTO classes(id,course_id,title,term,timezone) VALUES($1,$2,$3,'2026秋','Asia/Shanghai') ON CONFLICT(id) DO NOTHING",
        [id, uid(82000), title],
      );
    const members = [
      [uid(84001), courseDemo.student, courseDemo.classId, "student"],
      [uid(84002), courseDemo.otherStudent, courseDemo.classId, "student"],
      [uid(84003), courseDemo.teacher, courseDemo.classId, "teacher"],
      [uid(84004), courseDemo.outsider, courseDemo.otherClassId, "teacher"],
    ];
    for (const [id, user, classId, role] of members) {
      await sql.query(
        "INSERT INTO enrollments(id,user_id,class_id,role) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
        [id, user, classId, role],
      );
      if (role === "student")
        await sql.query(
          "INSERT INTO planets(id,owner_enrollment_id) VALUES($1,$2) ON CONFLICT(owner_enrollment_id) DO NOTHING",
          [
            uid(
              role === "student" && user === courseDemo.student ? 85001 : 85002,
            ),
            id,
          ],
        );
    }
    const due = new Date(Date.now() + 7 * 86400000).toISOString(),
      late = new Date(Date.now() + 10 * 86400000).toISOString();
    await sql.query(
      "INSERT INTO assignments(id,class_id,title,instructions,module,due_at,late_until,max_score,status) VALUES($1,$2,'色彩情绪：一幅画的三种表达','提交一张最终作品，可附过程图。写下你的配色选择与创作感受。','色彩与情绪',$3,$4,100,'published') ON CONFLICT(id) DO NOTHING",
      [courseDemo.assignmentId, courseDemo.classId, due, late],
    );
  });
}
