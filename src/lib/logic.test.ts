// Run with: npm test   (Node's built-in test runner via tsx)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, formatWeek, isIsoDate, isoWeekNumber, monthEnd, monthGrid, todayIso, weekStart, weeksInRange,
} from "./dates";
import { filterTasks, isOverdue, isUpcoming, parseFilters, taskListHref } from "./filters";
import {
  countByStatus, inDashboardScope, monthlySeries, statusByMember, weeklySeries, workloadByOwner, yearSummary,
} from "./stats";
import type { Task, WeekMove } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";

let n = 0;
function task(p: Partial<Task>): Task {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title: `Task ${n}`, description: null, project_id: null, owner_id: A, status: "todo", priority: "medium",
    planned_week: "2026-10-26", start_date: null, due_date: null, completed_on: null, effort_points: null,
    notes: null, links: [], meeting_id: null, carry_over_count: 0, is_sample: false, archived_at: null,
    version: 1, created_by: A, created_at: "2026-10-26T00:00:00Z", updated_by: A, updated_at: "2026-10-26T00:00:00Z",
    supporter_ids: [], ...p,
  };
}

test("dates: weeks start on Monday, across month and year boundaries", () => {
  assert.equal(weekStart("2026-10-30"), "2026-10-26"); // Friday
  assert.equal(weekStart("2026-11-01"), "2026-10-26"); // Sunday belongs to previous Monday
  assert.equal(weekStart("2026-10-26"), "2026-10-26");
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(isoWeekNumber("2026-10-26"), 44);
  assert.equal(isoWeekNumber("2026-12-28"), 53);
  assert.deepEqual(weeksInRange("2026-10-28", "2026-11-10"), ["2026-10-26", "2026-11-02", "2026-11-09"]);
  assert.equal(formatWeek("2026-10-26"), "Week 44 · 26 Oct – 1 Nov 2026");
});

test("dates: today follows the agency time zone, not the server's", () => {
  // 18:30 UTC on 30 Oct is already 31 Oct in Bangkok (UTC+7)
  assert.equal(todayIso(new Date("2026-10-30T18:30:00Z"), "Asia/Bangkok"), "2026-10-31");
  assert.equal(todayIso(new Date("2026-10-30T16:59:00Z"), "Asia/Bangkok"), "2026-10-30");
});

test("dates: validation and calendar grid", () => {
  assert.ok(isIsoDate("2026-10-30"));
  assert.ok(!isIsoDate("2026-02-30"));
  assert.ok(!isIsoDate("30/10/2026"));
  const grid = monthGrid("2026-10");
  assert.equal(grid[0][0], "2026-09-28");
  assert.ok(grid.every((w) => w.length === 7));
  assert.equal(grid.at(-1)!.at(-1), "2026-11-01");
});

test("filters: overdue and upcoming use the agency date and ignore done work", () => {
  const today = "2026-10-30";
  assert.ok(isOverdue({ status: "todo", due_date: "2026-10-29" }, today));
  assert.ok(!isOverdue({ status: "done", due_date: "2026-10-29" }, today));
  assert.ok(!isOverdue({ status: "todo", due_date: "2026-10-30" }, today)); // due today is not overdue
  assert.ok(isUpcoming({ status: "doing", due_date: "2026-10-30" }, today));
  assert.ok(isUpcoming({ status: "doing", due_date: "2026-11-06" }, today));
  assert.ok(!isUpcoming({ status: "doing", due_date: "2026-11-07" }, today));
});

test("filters: parse rejects unsafe values and round-trips into drill-down links", () => {
  const f = parseFilters({ owner: "'; drop table", status: "todo,bogus,done", priority: "urgent", from: "2026-13-01", q: "  brief " });
  assert.equal(f.owner, undefined);
  assert.deepEqual(f.status, ["todo", "done"]);
  assert.equal(f.priority, undefined);
  assert.equal(f.from, undefined);
  assert.equal(f.q, "brief");
  const href = taskListHref({ owner: A, status: ["todo"], dateField: "planned", from: "2026-10-26", to: "2026-11-01", withMoved: true });
  const back = parseFilters(Object.fromEntries(new URLSearchParams(href.split("?")[1])));
  assert.deepEqual(back, { owner: A, status: ["todo"], dateField: "planned", from: "2026-10-26", to: "2026-11-01", withMoved: true });
});

test("filters: combinations narrow results correctly", () => {
  const today = "2026-10-30";
  const tasks = [
    task({ title: "Campaign brief", owner_id: A, project_id: P, priority: "high", due_date: "2026-10-28" }),
    task({ title: "Supplier quotes", owner_id: B, status: "doing", due_date: "2026-11-02" }),
    task({ title: "Unassigned idea", owner_id: null, status: "backlog", planned_week: null }),
    task({ title: "Old done", owner_id: A, status: "done", completed_on: "2026-10-27", due_date: "2026-10-20" }),
  ];
  assert.equal(filterTasks(tasks, { owner: A }, today).length, 2);
  assert.equal(filterTasks(tasks, { owner: "none" }, today).length, 1);
  assert.equal(filterTasks(tasks, { project: P, priority: "high" }, today).length, 1);
  assert.equal(filterTasks(tasks, { q: "SUPPLIER" }, today).length, 1);
  assert.equal(filterTasks(tasks, { overdue: true }, today).length, 1);
  assert.equal(filterTasks(tasks, { upcoming: true }, today).length, 1);
  assert.equal(filterTasks(tasks, { status: ["backlog", "done"] }, today).length, 2);
  assert.equal(filterTasks(tasks, { dateField: "due", from: "2026-10-25", to: "2026-10-31" }, today).length, 1);
  assert.equal(filterTasks(tasks, { dateField: "completed", from: "2026-10-26", to: "2026-11-01" }, today).length, 1);
});

test("stats: counts and effort are separate; unestimated tasks are reported, not guessed", () => {
  const tasks = [
    task({ status: "todo", effort_points: 5 }),
    task({ status: "todo", effort_points: null }),
    task({ status: "done", effort_points: 1, completed_on: "2026-10-27" }),
  ];
  const s = countByStatus(tasks);
  assert.deepEqual(s.todo, { count: 2, effort: 5, unestimated: 1 });
  assert.deepEqual(s.done, { count: 1, effort: 1, unestimated: 0 });
  assert.deepEqual(s.backlog, { count: 0, effort: 0, unestimated: 0 });
});

test("stats: status by member includes people with no tasks and unassigned work", () => {
  const tasks = [task({ owner_id: A, status: "doing" }), task({ owner_id: null, status: "backlog", planned_week: null })];
  const rows = statusByMember(tasks, [{ id: A }, { id: B }]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.memberId === A)!.byStatus.doing.count, 1);
  assert.equal(rows.find((r) => r.memberId === B)!.total.count, 0);
  assert.equal(rows.find((r) => r.memberId === null)!.byStatus.backlog.count, 1);
});

test("stats: weekly planned includes carried-over work; carried-out counted once per task", () => {
  const w1 = "2026-10-19";
  const w2 = "2026-10-26";
  const carried = task({ planned_week: w2, status: "doing", carry_over_count: 1, effort_points: 3 });
  const doneW1 = task({ planned_week: w1, status: "done", completed_on: "2026-10-23", effort_points: 2 });
  const plannedW2 = task({ planned_week: w2, status: "todo" });
  const moves: WeekMove[] = [
    { task_id: carried.id, from_week: w1, to_week: w2, status_at_move: "doing", moved_at: "2026-10-26T01:00:00Z" },
  ];
  const [s1, s2] = weeklySeries([carried, doneW1, plannedW2], moves, [w1, w2]);
  assert.equal(s1.planned.count, 2); // done task + task later carried out
  assert.equal(s1.planned.effort, 5);
  assert.equal(s1.completed.count, 1);
  assert.equal(s1.carriedOut, 1);
  assert.equal(s2.planned.count, 2); // carried task + new task
  assert.equal(s2.completed.count, 0);
  assert.equal(s2.carriedOut, 0);
});

test("stats: monthly buckets by the Monday of the planned week", () => {
  const t1 = task({ planned_week: "2026-09-28", status: "done", completed_on: "2026-10-01" });
  const t2 = task({ planned_week: "2026-10-26", status: "todo" });
  const [sep, oct] = monthlySeries([t1, t2], [], ["2026-09", "2026-10"]);
  assert.equal(sep.planned.count, 1);
  assert.equal(sep.completed.count, 0);
  assert.equal(oct.planned.count, 1);
  assert.equal(oct.completed.count, 1);
});

test("stats: workload counts only open work and flags overdue", () => {
  const today = "2026-10-30";
  const rows = workloadByOwner(
    [
      task({ owner_id: A, status: "todo", effort_points: 3, due_date: "2026-10-01" }),
      task({ owner_id: A, status: "doing", effort_points: null }),
      task({ owner_id: A, status: "done", effort_points: 8 }),
      task({ owner_id: A, status: "backlog", planned_week: null, effort_points: 8 }),
    ],
    [{ id: A }, { id: B }],
    today,
  );
  const a = rows.find((r) => r.memberId === A)!;
  assert.deepEqual(a.open, { count: 2, effort: 3, unestimated: 1 });
  assert.equal(a.overdue, 1);
  assert.equal(rows.find((r) => r.memberId === B)!.open.count, 0);
});

test("stats: dashboard scope and year summary", () => {
  const today = "2026-10-30";
  assert.ok(inDashboardScope(task({ status: "backlog", planned_week: null }), "2026-10-26", "2026-11-01"));
  assert.ok(!inDashboardScope(task({ status: "todo", planned_week: "2026-10-19" }), "2026-10-26", "2026-11-01"));
  const y = yearSummary(
    [
      task({ status: "done", completed_on: "2026-03-04", planned_week: "2026-03-02" }),
      task({ status: "doing", planned_week: "2026-10-26", due_date: "2026-10-29" }),
      task({ status: "todo", planned_week: "2025-12-29", due_date: "2025-12-31" }),
    ],
    [],
    2026,
    today,
  );
  assert.equal(y.completed.count, 1);
  assert.equal(y.ongoing.count, 1);
  assert.equal(y.overdue.count, 1); // the 2025 overdue task belongs to 2025
  assert.equal(y.months[2].completed.count, 1);
  assert.equal(y.months.length, 12);
});
