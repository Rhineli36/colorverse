import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createCourseDatabase } from "../apps/api/src/database";
import { learningTasks } from "../apps/worker/src/learning";
import { classroomNotifications } from "../apps/worker/src/notifications";
import { OfflineExperienceStore } from "../apps/web/src/features/competition/offline-store";
import "fake-indexeddb/auto";
import { deleteDB } from "idb";
describe("published assignment mail and incoming feedback", () => {
  it("allows teacher publication, delivers the class assignment and only the recipient feedback", async () => {
    const db = await createCourseDatabase();
    const [cls, other, student, peer, planet] = Array.from({ length: 5 }, () =>
      randomUUID(),
    );
    try {
      await db.exec(
        `CREATE SCHEMA colorverse;CREATE TABLE colorverse.learning_task_settings(class_id uuid,task_id text,published boolean,require_explanation boolean,allow_peer_review boolean,show_intent_to_peers boolean,revision int,updated_at timestamptz DEFAULT now(),PRIMARY KEY(class_id,task_id));CREATE TABLE colorverse.users(id uuid,display_name text);CREATE TABLE colorverse.enrollments(id uuid,user_id uuid,class_id uuid,status text);CREATE TABLE colorverse.planets(id uuid,owner_enrollment_id uuid,document jsonb);CREATE TABLE colorverse.showcase_works(id uuid,title text,withdrawn_at timestamptz);CREATE TABLE colorverse.classroom_interactions(id uuid,planet_id uuid,actor_enrollment_id uuid,work_id uuid,kind text,content text,created_at timestamptz DEFAULT now());`,
      );
      await db.query("INSERT INTO colorverse.users VALUES($1,'同伴')", [peer]);
      await db.query(
        "INSERT INTO colorverse.enrollments VALUES($1,$1,$2,'active'),($3,$3,$2,'active')",
        [student, cls, peer],
      );
      await db.query("INSERT INTO colorverse.planets VALUES($1,$2,$3)", [
        planet,
        student,
        JSON.stringify({ metadata: { name: "我的星球" } }),
      ]);
      const policy = {
        taskId: "T01",
        revision: 0,
        published: true,
        requireExplanation: true,
        allowPeerReview: true,
        showIntentToPeers: true,
      };
      await expect(
        learningTasks(db, { role: "student" }, cls, "PUT", policy),
      ).rejects.toMatchObject({ status: 403 });
      await learningTasks(db, { role: "teacher" }, cls, "PUT", policy);
      await expect(
        learningTasks(db, { role: "teacher" }, cls, "PUT", policy),
      ).rejects.toMatchObject({ status: 409 });
      await db.query(
        "INSERT INTO colorverse.classroom_interactions(id,planet_id,actor_enrollment_id,kind,content) VALUES($1,$2,$3,'comment','来拜访一下！')",
        [randomUUID(), planet, peer],
      );
      const a = await classroomNotifications(db, { id: student }, cls),
        b = await classroomNotifications(db, { id: peer }, cls),
        c = await classroomNotifications(db, { id: student }, other);
      expect(a.notifications.map((n) => n.kind).sort()).toEqual([
        "assignment",
        "comment",
      ]);
      expect(b.notifications.map((n) => n.kind)).toEqual(["assignment"]);
      expect(c.notifications).toHaveLength(0);
      expect(a.notifications.find((n) => n.kind === "comment")).toMatchObject({
        planetId: planet,
        workId: null,
        content: "来拜访一下！",
      });
    } finally {
      await db.close();
    }
  }, 15000);
  it("keeps offline publication and per-role read markers after reopen and prevents student publication", async () => {
    await deleteDB("colorverse-judges-offline-v1");
    let store = new OfflineExperienceStore();
    await expect(store.publishAssignment(0, "student", "T01")).rejects.toThrow(
      "教师",
    );
    let s = await store.publishAssignment(0, "teacher", "T01");
    const id = s.assignments[0].id;
    s = await store.readNotification(s.revision, "teacher", id);
    await store.close();
    store = new OfflineExperienceStore();
    s = await store.load();
    expect(s.assignments[0].taskId).toBe("T01");
    expect(s.readNotifications).toContain("teacher:" + id);
    expect(s.readNotifications).not.toContain("student:" + id);
    await store.close();
    await deleteDB("colorverse-judges-offline-v1");
  });
});
