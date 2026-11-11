import { useEffect, useState } from "react";
import type { StudentAssignment, StudentWork } from "@colorverse/contracts";
import { AssignmentMail } from "./ClassroomMail";
import { InterfaceIcon } from "./InterfaceIcon";
import { ClassroomThumbnail } from "./ClassroomThumbnail";
import type { StudentAssignmentClass } from "./useStudentAssignments";
import "./my-assignments.css";

export type MyAssignmentsView = {
  tab: "missing" | "submitted";
  query: string;
  classId: string;
  sort: string;
};
type AssignmentItem = StudentAssignment & { classroom: StudentAssignmentClass };
type WorkItem = StudentWork & { classroom: StudentAssignmentClass };
function dueTime(date: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(date));
}
export default function MyAssignments({
  classes,
  loading,
  errors,
  onRefresh,
  view,
  onViewChange,
  onBack,
  onSubmit,
  onFreeSubmit,
  onOpenWork,
}: {
  classes: StudentAssignmentClass[];
  loading: boolean;
  errors: string[];
  onRefresh: () => void;
  view: MyAssignmentsView;
  onViewChange: (v: MyAssignmentsView) => void;
  onBack: () => void;
  onSubmit: (item: AssignmentItem) => void;
  onFreeSubmit: (classId?: string) => void;
  onOpenWork: (item: WorkItem) => void;
}) {
  const [task, setTask] = useState<AssignmentItem>();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [view.tab, view.query, view.classId, view.sort]);
  const patch = (value: Partial<MyAssignmentsView>) =>
    onViewChange({ ...view, ...value });
  const assignments = classes.flatMap((classroom) =>
    classroom.assignments.map((a) => ({ ...a, classroom })),
  );
  const works = classes.flatMap((classroom) =>
    classroom.works.map((w) => ({ ...w, classroom })),
  );
  const missing = assignments.filter((a) => !a.latestWorkId);
  const classMatches = (id: string) => !view.classId || view.classId === id;
  const matches = (text: string) =>
    text.toLocaleLowerCase().includes(view.query.trim().toLocaleLowerCase());
  const filteredAssignments = missing.filter(
    (a) =>
      classMatches(a.classroom.classId) &&
      matches(a.definition.title + a.definition.description),
  );
  filteredAssignments.sort((a, b) =>
    view.sort === "newest"
      ? b.publishedAt.localeCompare(a.publishedAt)
      : (a.dueAt ? Date.parse(a.dueAt) : Infinity) -
          (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
        b.publishedAt.localeCompare(a.publishedAt),
  );
  const assignmentFor = (w: WorkItem) =>
    w.classroom.assignments.find((a) => a.id === w.publicationId);
  const filteredWorks = works.filter(
    (w) =>
      classMatches(w.classroom.classId) &&
      matches(w.title + (assignmentFor(w)?.definition.title ?? "")),
  );
  filteredWorks.sort(
    (a, b) =>
      (view.sort === "oldest" ? 1 : -1) *
      (a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id)),
  );
  const visibleWorks = filteredWorks.slice(0, page * 20);
  const groups = [
    {
      label: "已逾期 · 仍可提交",
      kind: "overdue",
      items: filteredAssignments.filter(
        (a) => a.dueAt && Date.parse(a.dueAt) < now,
      ),
    },
    {
      label: "48 小时内截止",
      kind: "soon",
      items: filteredAssignments.filter(
        (a) =>
          a.dueAt &&
          Date.parse(a.dueAt) >= now &&
          Date.parse(a.dueAt) <= now + 48 * 3600000,
      ),
    },
    {
      label: "其他待提交",
      kind: "normal",
      items: filteredAssignments.filter(
        (a) => !a.dueAt || Date.parse(a.dueAt) > now + 48 * 3600000,
      ),
    },
  ];
  return (
    <section className="student-assignments" aria-label="我的作业">
      <header className="student-tasks-heading">
        <div>
          <p className="eyebrow">MY ASSIGNMENTS</p>
          <h1>我的作业</h1>
          <p>要交的作业在这里，交过的作品也能随时回看。</p>
        </div>
        <div className="student-tasks-heading-actions">
          <button disabled={loading} onClick={onRefresh}>
            {loading ? "正在读取…" : "刷新作业"}
          </button>
          <button aria-label="关闭我的作业，返回宇宙" onClick={onBack}>
            ×
          </button>
        </div>
      </header>
      <div className="student-tasks-toolbar">
        <nav aria-label="我的作业分类">
          <button
            aria-pressed={view.tab === "missing"}
            onClick={() => patch({ tab: "missing", sort: "deadline" })}
          >
            待提交{" "}
            <b>
              {!classes.length && (loading || errors.length)
                ? "—"
                : missing.length}
            </b>
            <small>项作业</small>
          </button>
          <button
            aria-pressed={view.tab === "submitted"}
            onClick={() => patch({ tab: "submitted", sort: "newest" })}
          >
            已提交{" "}
            <b>
              {!classes.length && (loading || errors.length)
                ? "—"
                : works.length}
            </b>
            <small>份作品</small>
          </button>
        </nav>
        <div className="student-tasks-filters">
          {classes.length > 1 && (
            <select
              aria-label="筛选作业班级"
              value={view.classId}
              onChange={(e) => patch({ classId: e.target.value })}
            >
              <option value="">全部班级</option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.classTitle}
                </option>
              ))}
            </select>
          )}
          <input
            type="search"
            aria-label="搜索我的作业"
            placeholder={
              view.tab === "missing" ? "搜索待交作业" : "搜索作业或作品名称"
            }
            value={view.query}
            onChange={(e) => patch({ query: e.target.value })}
          />
          <select
            aria-label="作业排序"
            value={view.sort}
            onChange={(e) => patch({ sort: e.target.value })}
          >
            {view.tab === "missing" ? (
              <>
                <option value="deadline">按截止时间</option>
                <option value="newest">按发布时间</option>
              </>
            ) : (
              <>
                <option value="newest">最近提交优先</option>
                <option value="oldest">最早提交优先</option>
              </>
            )}
          </select>
        </div>
        <button
          className="student-task-free-submit"
          disabled={loading}
          onClick={() => onFreeSubmit(view.classId || undefined)}
        >
          <InterfaceIcon name="picture" />
          自由提交作业
        </button>
      </div>
      {loading && (
        <p role="status" className="student-tasks-notice">
          正在核对已发布作业和你的提交记录…
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="student-tasks-error">
          <p>
            部分作业暂未读取成功，保留上次读取的内容；当前数量可能不是最新。
          </p>
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
          <button onClick={onRefresh} disabled={loading}>
            重新读取
          </button>
        </div>
      )}
      {!loading &&
        !errors.length &&
        view.tab === "missing" &&
        !filteredAssignments.length && (
          <div className="student-tasks-empty">
            <InterfaceIcon name="check" />
            <h2>
              {view.query || view.classId
                ? "没有符合条件的待交作业"
                : assignments.length
                  ? "目前没有待交作业"
                  : "老师还没有向你发布作业"}
            </h2>
            <p>
              {view.query || view.classId
                ? "试试其他关键词或班级。"
                : "已交过的作品可在「已提交」中查看。"}
            </p>
          </div>
        )}
      {view.tab === "missing" &&
        groups
          .filter((g) => g.items.length)
          .map((group) => (
            <section
              key={group.kind}
              className={`student-task-group is-${group.kind}`}
              aria-label={group.label}
            >
              <h2>
                <span className="student-task-group-dot" />
                {group.label}
                <small>{group.items.length} 项</small>
              </h2>
              <div className="student-task-rows">
                {group.items.map((a) => (
                  <article
                    key={a.id}
                    className="student-task-row"
                    data-publication-id={a.id}
                  >
                    <ClassroomThumbnail
                      className="student-task-thumbnail"
                      source={a.definition.images?.[0] || a.definition.image}
                      identity={a.id}
                    />
                    <div className="student-task-copy">
                      <h3>{a.definition.title}</h3>
                      <p>{a.definition.deliverables}</p>
                      {classes.length > 1 && (
                        <small>{a.classroom.classTitle}</small>
                      )}
                    </div>
                    <div className="student-task-meta">
                      <span className="student-task-status">
                        {group.kind === "overdue"
                          ? "未提交 · 已逾期"
                          : group.kind === "soon"
                            ? "未提交 · 即将截止"
                            : "未提交"}
                      </span>
                      <p>
                        {a.dueAt ? (
                          <>
                            <time dateTime={a.dueAt}>
                              {dueTime(a.dueAt, a.classroom.timezone)}
                            </time>{" "}
                            截止
                          </>
                        ) : (
                          "未设置截止时间"
                        )}
                      </p>
                      <button
                        className="student-task-requirements"
                        onClick={() => setTask(a)}
                      >
                        查看要求 →
                      </button>
                    </div>
                    <button
                      className="student-task-submit"
                      disabled={loading}
                      onClick={() => onSubmit(a)}
                    >
                      {a.classroom.planetId ? "去提交" : "创建星球后提交"}
                      <InterfaceIcon name="arrow" />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
      {view.tab === "submitted" && (
        <>
          <p className="student-tasks-explanation">
            保留每次提交的作品；同一作业多次提交，只计完成一项课程作业。自主上传作品单独标明。
          </p>
          {!loading && !errors.length && !filteredWorks.length && (
            <div className="student-tasks-empty">
              <InterfaceIcon name="picture" />
              <h2>
                {view.query || view.classId
                  ? "没有符合条件的已交作品"
                  : "你还没有提交作品"}
              </h2>
              <p>提交成功后，作品和教师反馈会出现在这里。</p>
            </div>
          )}
          <div className="student-task-rows">
            {visibleWorks.map((w) => {
              const assignment = assignmentFor(w);
              return (
                <article
                  key={w.id}
                  className={`student-task-row is-submitted ${w.withdrawn ? "is-withdrawn" : ""}`}
                  data-work-id={w.id}
                >
                  <ClassroomThumbnail
                    className="student-task-thumbnail"
                    source={`private:classes/${w.classroom.classId}/works/${w.id}/image`}
                    identity={`${w.id}:${w.submissionRevision}`}
                  />
                  <div className="student-task-copy">
                    <h3>{w.title}</h3>
                    <p>
                      {assignment
                        ? `课程作业 · ${assignment.definition.title}`
                        : w.taskId
                          ? "历史作品 · 尚未关联已发布作业"
                          : "自主上传 · 不计课程作业完成率"}
                    </p>
                    {classes.length > 1 && (
                      <small>{w.classroom.classTitle}</small>
                    )}
                  </div>
                  <div className="student-task-meta">
                    <span
                      className={`student-task-status ${w.status === "reviewed" ? "is-reviewed" : ""}`}
                    >
                      {w.withdrawn
                        ? "已撤下"
                        : w.status === "reviewed"
                          ? "已评价"
                          : w.updated
                            ? "已更新，待复核"
                            : "已提交 · 待评价"}
                    </span>
                    <p>
                      <time dateTime={w.submittedAt}>
                        {dueTime(w.submittedAt, w.classroom.timezone)}
                      </time>{" "}
                      提交
                    </p>
                    {w.status === "reviewed" && (
                      <small>
                        {w.score !== null
                          ? `教师评分 ${w.score} 分`
                          : "已有教师评语 · 暂未评分"}
                      </small>
                    )}
                  </div>
                  <button
                    className="student-task-view"
                    onClick={() => onOpenWork(w)}
                  >
                    查看作品与反馈
                    <InterfaceIcon name="arrow" />
                  </button>
                </article>
              );
            })}
          </div>
          {filteredWorks.length > visibleWorks.length && (
            <button
              className="student-tasks-load-more"
              onClick={() => setPage((n) => n + 1)}
            >
              查看更多已交作品（还有{" "}
              {filteredWorks.length - visibleWorks.length} 份）
            </button>
          )}
        </>
      )}
      <footer className="student-tasks-footer">
        <InterfaceIcon name="planet" />
        <span>完成作业，让你的星球慢慢成长。</span>
      </footer>
      {task && (
        <AssignmentMail
          key={task.id}
          taskId={task.taskId}
          definition={task.definition}
          onClose={() => setTask(undefined)}
          onSubmit={() => {
            onSubmit(task);
            setTask(undefined);
          }}
        />
      )}
    </section>
  );
}
