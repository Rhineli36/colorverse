import LearningContent from "./learning-content.json";
export const AssignmentCatalog = LearningContent.tasks.map((task, i) => ({
  ...task,
  image: `competition/student-${i + 1}-work-1.webp`,
}));
export type AssignmentPublication = {
  id: string;
  taskId: string;
  publishedAt: string;
};
export type ClassroomNotification = {
  id: string;
  kind: "assignment" | "like" | "emoji" | "comment";
  title: string;
  createdAt: string;
  taskId?: string;
  planetId?: string;
  workId?: string | null;
  content?: string;
};
