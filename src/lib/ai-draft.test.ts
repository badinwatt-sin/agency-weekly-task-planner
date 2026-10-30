import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, cleanDraft, docxXmlToText, extractJson } from "./ai-draft";

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";
const P1 = "33333333-3333-4333-8333-333333333333";
const T1 = "44444444-4444-4444-8444-444444444444";
const known = {
  memberIds: new Set([M1, M2]),
  projectIds: new Set([P1]),
  tasks: new Map([[T1, { title: "Client deck", status: "todo" as const, version: 3 }]]),
};

test("extractJson reads plain, fenced and wrapped replies", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('Sure. {"a":3} Hope this helps.'), { a: 3 });
  assert.throws(() => extractJson("no json here"));
});

test("cleanDraft keeps valid items and drops or repairs invented ones", () => {
  const d = cleanDraft(
    {
      summary: ["• Deck sent", "• Quotes due Friday"],
      people: [{ member_id: M1, update: "Deck sent" }, { member_id: "someone-else", update: "x" }, { member_id: M2, update: "" }],
      new_tasks: [
        { title: "Collect quotes", owner_id: M2, supporter_ids: [M1, M2, "x"], priority: "high", due_date: "2026-11-06", week: "this", status: "todo", project_id: P1, notes: "Friday" },
        { title: "Explore tool", owner_id: "bogus", priority: "urgent", due_date: "Friday", week: "someday", status: "blocked", project_id: "nope" },
        { title: "   " },
      ],
      task_updates: [
        { task_id: T1, status: "doing", note: "Client reviewing" },
        { task_id: T1, status: "todo", note: "" }, // same status, no note → dropped
        { task_id: "missing", status: "done", note: "x" },
      ],
    },
    known,
  );
  assert.equal(d.summary, "• Deck sent\n• Quotes due Friday");
  assert.deepEqual(d.people, [{ member_id: M1, update: "Deck sent" }]);
  assert.equal(d.new_tasks.length, 2);
  assert.deepEqual(d.new_tasks[0].supporter_ids, [M1]); // owner and unknown ids removed
  assert.equal(d.new_tasks[0].project_id, P1);
  const t = d.new_tasks[1];
  assert.deepEqual([t.owner_id, t.priority, t.due_date, t.week, t.status, t.project_id], [null, "medium", null, "this", "todo", null]);
  assert.equal(d.task_updates.length, 1);
  assert.deepEqual(d.task_updates[0], { include: true, task_id: T1, task_title: "Client deck", current_status: "todo", version: 3, status: "doing", note: "Client reviewing" });
});

test("cleanDraft survives junk", () => {
  for (const junk of [null, 42, "text", [], { people: "nope", new_tasks: {} }]) {
    const d = cleanDraft(junk, known);
    assert.equal(d.people.length + d.new_tasks.length + d.task_updates.length, 0);
  }
});

test("prompt gives Claude the team, open tasks, dates and the notes", () => {
  const p = buildPrompt({
    meetingDate: "2026-10-30",
    members: [{ id: M1, full_name: "Test Person One", display_name: "Nui", role: "member" }],
    projects: [{ id: P1, name: "General" }],
    openTasks: [{ id: T1, title: "Client deck", owner_id: M1, status: "todo", planned_week: "2026-10-26", due_date: null }],
    notes: "นุ่ย: ส่ง deck แล้ว",
    imageCount: 2,
  });
  assert.match(p, /Meeting date: 2026-10-30 \(Friday\)/);
  assert.match(p, /starts Monday 2026-10-26; the following week starts 2026-11-02/);
  assert.ok(p.includes(`${M1}: Test Person One (also called Nui)`));
  assert.ok(p.includes(`${T1} | Client deck | owner ${M1} | todo | week 2026-10-26 | due -`));
  assert.ok(p.includes("นุ่ย: ส่ง deck แล้ว"));
  assert.match(p, /2 image\(s\) are attached/);
});

test("Word XML becomes one line per paragraph, entities decoded", () => {
  const xml = `<w:document><w:body><w:p><w:r><w:t>Nok: </w:t></w:r><w:r><w:t xml:space="preserve">ส่งรายงานแล้ว &amp; รอตรวจ</w:t></w:r></w:p><w:p></w:p><w:p><w:r><w:t>Ton: budget &lt;Thu&gt; &#x2713;</w:t></w:r></w:p></w:body></w:document>`;
  assert.equal(docxXmlToText(xml), "Nok: ส่งรายงานแล้ว & รอตรวจ\nTon: budget <Thu> ✓");
});
