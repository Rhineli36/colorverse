import LearningContent from "./learning-content.json";
export const AssignmentCatalog = LearningContent.tasks;
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
