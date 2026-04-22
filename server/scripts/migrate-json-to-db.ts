import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/db.js";
import type { AppState } from "../src/types.js";

function resolveLegacyStatePath() {
  const cwdPath = path.resolve(process.cwd(), "server", "data", "app-state.json");
  const nestedPath = path.resolve(process.cwd(), "server", "server", "data", "app-state.json");
  return { cwdPath, nestedPath };
}

function parseEta(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function readLegacyState(): Promise<AppState> {
  const { cwdPath, nestedPath } = resolveLegacyStatePath();

  for (const candidate of [cwdPath, nestedPath]) {
    try {
      const raw = await readFile(candidate, "utf8");
      return JSON.parse(raw) as AppState;
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error("Could not find legacy app-state.json in server/data or server/server/data");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const state = await readLegacyState();
  const userEmail = process.env.SEED_USER_EMAIL ?? "demo@task-web.local";
  const userPasswordHash = process.env.SEED_USER_PASSWORD_HASH ?? "local-demo-no-login";
  const userNickname = process.env.SEED_USER_NICKNAME ?? "Demo User";

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: { nickname: userNickname },
    create: {
      email: userEmail,
      passwordHash: userPasswordHash,
      nickname: userNickname
    }
  });

  await prisma.aiGenerationLog.deleteMany({ where: { userId: user.id } });
  await prisma.taskProgressLog.deleteMany({ where: { task: { userId: user.id } } });
  await prisma.taskMilestone.deleteMany({ where: { task: { userId: user.id } } });
  await prisma.task.deleteMany({ where: { userId: user.id } });
  await prisma.inspirationConversation.deleteMany({ where: { inspiration: { userId: user.id } } });
  await prisma.inspirationMilestone.deleteMany({ where: { inspiration: { userId: user.id } } });
  await prisma.inspiration.deleteMany({ where: { userId: user.id } });

  for (const bubble of state.inspiration.bubbles) {
    const inspiration = await prisma.inspiration.create({
      data: {
        userId: user.id,
        sourceText: bubble.title,
        title: bubble.title,
        taskDescription: bubble.taskDescription,
        eta: parseEta(bubble.eta),
        energy: bubble.energy,
        state: bubble.state,
        tags: bubble.tags,
        createdAt: new Date(bubble.createdAt),
        updatedAt: new Date(bubble.createdAt)
      }
    });

    if (bubble.milestones.length > 0) {
      await prisma.inspirationMilestone.createMany({
        data: bubble.milestones.map((milestone, index) => ({
          inspirationId: inspiration.id,
          title: milestone.title,
          weight: milestone.weight,
          sortOrder: index
        }))
      });
    }
  }

  for (const task of state.tasks) {
    const createdTask = await prisma.task.create({
      data: {
        userId: user.id,
        label: task.label,
        title: task.title,
        detail: task.detail,
        phase: task.phase,
        progress: task.progress,
        eta: task.eta,
        ownerNote: task.ownerNote,
        mode: task.mode,
        accent: task.accent,
        rotting: task.rotting,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.lastTouchedAt),
        lastTouchedAt: new Date(task.lastTouchedAt),
        completedAt: task.completedAt ? new Date(task.completedAt) : null,
        completionReflection: task.completionReflection ?? null
      }
    });

    if (task.milestones.length > 0) {
      await prisma.taskMilestone.createMany({
        data: task.milestones.map((milestone, index) => ({
          taskId: createdTask.id,
          title: milestone.title,
          weight: milestone.weight,
          sortOrder: index
        }))
      });
    }

    if (task.progressLogs.length > 0) {
      await prisma.taskProgressLog.createMany({
        data: task.progressLogs.map((log) => ({
          taskId: createdTask.id,
          summary: log.summary,
          progressBefore: log.progressBefore,
          progressAfter: log.progressAfter,
          increase: log.increase,
          createdAt: new Date(log.date)
        }))
      });
    }
  }

  console.log(
    `JSON migration completed. Seeded user ${user.email}, ${state.inspiration.bubbles.length} inspirations, ${state.tasks.length} tasks.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
