import type {
  CourseUser,
  CourseClass,
  Assignment,
  Submission,
  SubmissionDraft,
  SubmissionDetail,
  SubmissionSummary,
  SubmissionReceipt,
  AssignmentInput,
  CourseReview,
} from "@colorverse/contracts";
export const courseApiBase =
  import.meta.env.VITE_COURSE_API_URL || (import.meta.env.DEV ? "/api/v1" : "");
export interface UploadedCourseImage {
  id: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
}
export class CourseApi {
  csrf = "";
  async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const binary = body instanceof File;
    const response = await fetch(courseApiBase + path, {
      method,
      credentials: "include",
      headers: {
        ...(body && !binary ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { "X-CSRF-Token": this.csrf } : {}),
        ...headers,
      },
      body:
        body === undefined ? undefined : binary ? body : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        data?.error?.message || "课程服务暂时无法连接，请稍后再试",
      );
    return data as T;
  }
  async session() {
    const data = await this.request<{
      user: CourseUser;
      csrfToken: string;
      development: boolean;
    }>("/me");
    this.csrf = data.csrfToken;
    return data;
  }
  async login(userId: string) {
    const data = await this.request<{
      user: CourseUser;
      csrfToken: string;
      development: boolean;
    }>("/dev/login", "POST", { userId });
    this.csrf = data.csrfToken;
    return data;
  }
  classes() {
    return this.request<{ classes: CourseClass[] }>("/classes");
  }
  assignments(id: string) {
    return this.request<{ assignments: Assignment[] }>(
      `/classes/${id}/assignments`,
    );
  }
  open(id: string) {
    return this.request<Submission>(
      `/assignments/${id}/submissions`,
      "POST",
      {},
    );
  }
  detail(id: string) {
    return this.request<SubmissionDetail>(`/submissions/${id}`);
  }
  summaries(id: string) {
    return this.request<{ submissions: SubmissionSummary[] }>(
      `/assignments/${id}/submissions`,
    );
  }
  save(id: string, revision: number, draft: SubmissionDraft) {
    return this.request<Submission>(`/submissions/${id}/draft`, "PUT", {
      expectedRevision: revision,
      draft,
    });
  }
  submit(id: string, revision: number, key: string) {
    return this.request<SubmissionReceipt>(
      `/submissions/${id}/submit`,
      "POST",
      { expectedRevision: revision },
      { "Idempotency-Key": key },
    );
  }
  review(
    id: string,
    versionId: string,
    revision: number,
    decision: "graded" | "returned",
    score: number | null,
    comment: string,
  ) {
    return this.request<{ submission: Submission; review: CourseReview }>(
      `/submissions/${id}/versions/${versionId}/reviews`,
      "POST",
      { expectedRevision: revision, decision, score, comment },
    );
  }
  create(classId: string, assignment: AssignmentInput) {
    return this.request<Assignment>(
      `/classes/${classId}/assignments`,
      "POST",
      assignment,
    );
  }
  async upload(file: File) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return this.request<UploadedCourseImage>("/assets", "POST", file, {
      "X-Content-Sha256": hash,
    });
  }
  display(id: string) {
    return `${courseApiBase}/assets/${id}/display`;
  }
}
