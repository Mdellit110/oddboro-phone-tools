// Sample Odds, chats, an ask and two goals, so a fresh test office has
// something for the phone to show. `phone.mjs seed` runs it with the test
// office's env and ODDBORO_LEDGER pointing at packages/ledger. Every job is
// turned off, so the office starts no run. It does nothing if the office
// already has Odds.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ledger = process.env.ODDBORO_LEDGER!;
const home = process.env.ODDBORO_HOME!;
const from = (f: string) => import(pathToFileURL(join(ledger, 'src', f)).href);
const L = await from('index.ts');
const { db } = await from('db.ts');
const { MANAGERS, managerPortrait, hire, hireManager, roster, asks, followUps, goalProgress, goals, jobs, staffGoals, threads } = L;

if ((await roster()).length) {
  console.log('This test office has Odds already. Nothing seeded.');
  process.exit(0);
}

const cindy = await hireManager({ preset: 'cindy' });
const preset = async (id: string, role: string) => {
  const m = MANAGERS.find((p: { id: string }) => p.id === id);
  return hire({
    name: m.name,
    role,
    room: 'workspace',
    remit: `${m.name} helps with the launch.`,
    desk: 'Sample.',
    variant: 'look',
    portrait: 'look',
    look: m.look,
    portraitPx: managerPortrait(id)
  });
};
const jamal = await preset('jamal', 'Analyst');
const ziva = await preset('ziva', 'Writer');
await db.update(jobs).set({ enabled: false });

// Chats, so Messages and a call have lines to show.
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const chats: [{ id: string }, [string, string][]][] = [
  [cindy, [['owner', "How's the plan coming along?"], ['staff', 'Numbers are in and Ziva drafted the email. It waits on your yes.']]],
  [jamal, [['staff', 'Morning. The sign-ups sheet is up to date.'], ['owner', "Can you pull last quarter's numbers?"]]],
  [ziva, [['staff', 'The launch email is drafted. I held it for your yes.']]]
];
for (const [odd, lines] of chats) {
  const dir = join(home, 'staff', odd.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'chat.jsonl'),
    lines.map(([who, text], i) => JSON.stringify({ at: ago(lines.length - i), from: who, text })).join('\n') + '\n'
  );
}

// Two goals, one with work handed on and back today and an ask waiting on the owner.
const today = (min: number) => new Date(Date.now() - min * 60_000);
const [q1] = await db
  .insert(goals)
  .values({ title: 'Launch the Q1 plan', why: 'Sign-ups doubled after each newsletter.', doneWhen: 'the launch email is out and the plan is live.', horizon: 'ongoing', area: 'work', createdAt: today(300) })
  .returning();
const [inbox] = await db.insert(goals).values({ title: 'Inbox at zero', horizon: 'ongoing', area: 'home', createdAt: today(320) }).returning();
await db.insert(staffGoals).values([
  { staffId: cindy.id, goalId: q1.id, part: 'Leads the plan' },
  { staffId: jamal.id, goalId: q1.id, part: 'Numbers' },
  { staffId: ziva.id, goalId: q1.id, part: 'The launch email' },
  { staffId: ziva.id, goalId: inbox.id, part: 'Sorts the inbox' }
]);
await db.insert(goalProgress).values([
  { goalId: q1.id, staffId: cindy.id, health: 'on_track', note: 'Numbers in, email drafted.' },
  { goalId: inbox.id, staffId: ziva.id, health: 'slipping', note: 'New mail outpaces the sorting.' }
]);
const [t1] = await db.insert(threads).values({ title: q1.title, goalId: q1.id, hubId: cindy.id, holderId: cindy.id, status: 'open' }).returning();
await db.insert(threads).values([
  { title: 'Plan outline', goalId: q1.id, hubId: cindy.id, holderId: cindy.id, status: 'done' },
  { title: inbox.title, goalId: inbox.id, hubId: ziva.id, holderId: ziva.id, status: 'done' },
  { title: 'Inbox rules', goalId: inbox.id, hubId: ziva.id, holderId: ziva.id, status: 'open' }
]);
const done = (start: Date, end: Date) => ({ startedAt: start, doneAt: end, outcome: 'done' as const });
const [h1] = await db
  .insert(followUps)
  .values({
    staffId: jamal.id, kind: 'hand_off', threadId: t1.id, createdAt: today(120),
    handOff: { from: cindy.id, title: 'Sign-ups by week, Q4', brief: "Can you pull last quarter's sign-ups by week?" },
    result: 'Done. Weeks 6 and 9 spiked, both after the newsletter.',
    ...done(today(119), today(100))
  })
  .returning();
await db.insert(followUps).values({
  staffId: cindy.id, kind: 'handed_back', threadId: t1.id, createdAt: today(100),
  note: 'Done. Weeks 6 and 9 spiked, both after the newsletter.',
  handOff: { from: jamal.id, title: 'Sign-ups by week, Q4', brief: '', id: h1.id, outcome: 'done' },
  result: 'Good catch. Ziva will draft a launch email.',
  ...done(today(95), today(94))
});
const [h2] = await db
  .insert(followUps)
  .values({
    staffId: ziva.id, kind: 'hand_off', threadId: t1.id, createdAt: today(90),
    handOff: { from: cindy.id, title: 'Draft the launch email', brief: 'Draft a launch email we can send like the newsletter.' },
    result: 'Drafted. It needs your yes before it goes.',
    startedAt: today(89), doneAt: today(60), outcome: 'waiting'
  })
  .returning();
await db.insert(asks).values({
  staffId: ziva.id, kind: 'approval', title: 'Send the launch email',
  why: 'To the newsletter list.', ifApproved: 'I send it from the newsletter account.',
  threadId: t1.id, handOffId: h2.id, createdAt: today(60)
});
console.log(`Seeded 3 Odds (${cindy.name}, ${jamal.name}, ${ziva.name}), their chats, 2 goals and 1 ask.`);
process.exit(0);
