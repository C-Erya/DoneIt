import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { dashboardData } from "./data/dashboard.js";
import type { Accent, AppState, BubbleEnergy, BubbleState, TaskMode } from "./types.js";

type DbMilestone = {
  id: string;
  title: string;
  weight: number;
};

type DbProgressLog = {
  id: string;
  summary: string;
  progressBefore: number;
  progressAfter: number;
  increase: number;
  createdAt: Date;
};

type DbInspirationRecord = {
  id: string;
  title: string;
  energy: string;
  tags: string[];
  state: string;
  createdAt: Date;
  taskDescription: string;
  eta: Date | null;
  milestones: DbMilestone[];
};

type DbTaskRecord = {
  id: string;
  label: string;
  title: string;
  detail: string;
  createdAt: Date;
  completedAt: Date | null;
  completionReflection: string | null;
  phase: string;
  progress: number;
  eta: string;
  ownerNote: string;
  mode: string;
  accent: string;
  rotting: boolean;
  lastTouchedAt: Date;
  milestones: DbMilestone[];
  progressLogs: DbProgressLog[];
};

const DATA_DIR = path.resolve(process.cwd(), "server", "data");
const STATE_PATH = path.join(DATA_DIR, "app-state.json");

const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL?.trim() || "demo@task-web.local";
const DEMO_USER_PASSWORD_HASH = process.env.DEMO_USER_PASSWORD_HASH?.trim() || "local-demo-no-login";
const DEMO_USER_NICKNAME = process.env.DEMO_USER_NICKNAME?.trim() || "Demo User";

let cache: AppState | null = null;
let databaseConfigWarningShown = false;

function createInitialState(): AppState {
  return {
    brand: dashboardData.brand,
    inspiration: {
      title: dashboardData.inspiration.title,
      subtitle: dashboardData.inspiration.subtitle,
      pullTabLabel: dashboardData.inspiration.pullTabLabel,
      quickCapturePlaceholder: dashboardData.inspiration.quickCapturePlaceholder,
      bubbles: dashboardData.inspiration.bubbles.map((bubble, index) => ({
        ...bubble,
        energy: bubble.energy as BubbleEnergy,
        state: bubble.state as BubbleState,
        createdAt: new Date(
          Date.now() - (dashboardData.inspiration.bubbles.length - index) * 86400000
        ).toISOString(),
        taskDescription: dashboardData.inspiration.decompositionPreview.taskDescription,
        milestones: dashboardData.inspiration.decompositionPreview.milestones,
        eta: dashboardData.inspiration.decompositionPreview.eta
      })),
      draftTemplate: dashboardData.inspiration.decompositionPreview
    },
    execution: dashboardData.execution,
    tasks: dashboardData.execution.activeTasks.map((task) => ({
      ...task,
      createdAt: new Date().toISOString(),
      completedAt: undefined,
      completionReflection: "",
      mode: task.mode as TaskMode,
      accent: task.accent as Accent,
      lastTouchedAt: new Date().toISOString(),
      milestones: Array.from({ length: task.milestoneCount }).map((_, index) => ({
        id: `${task.id}-m${index + 1}`,
        title: `Milestone ${index + 1}`,
        weight: Math.round(100 / task.milestoneCount)
      })),
      progressLogs: []
    })),
    achievement: {
      title: dashboardData.achievement.title,
      subtitle: dashboardData.achievement.subtitle,
      stars: dashboardData.achievement.nebula.stars.map((star) => ({
        ...star,
        family: star.family as Accent
      }))
    }
  };
}

function hasConfiguredDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return false;
  }

  if (databaseUrl.includes("[YOUR-PASSWORD]")) {
    if (!databaseConfigWarningShown) {
      console.warn("DATABASE_URL still contains [YOUR-PASSWORD]. Falling back to local JSON storage.");
      databaseConfigWarningShown = true;
    }
    return false;
  }

  return true;
}

function parseOptionalDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapStaticState() {
  const initial = createInitialState();
  return {
    brand: initial.brand,
    execution: initial.execution,
    achievement: initial.achievement,
    inspiration: {
      title: initial.inspiration.title,
      subtitle: initial.inspiration.subtitle,
      pullTabLabel: initial.inspiration.pullTabLabel,
      quickCapturePlaceholder: initial.inspiration.quickCapturePlaceholder,
      draftTemplate: initial.inspiration.draftTemplate
    }
  };
}

async function ensureStateFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(STATE_PATH, "utf8");
  } catch {
    const initial = createInitialState();
    await writeFile(STATE_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function ensureDemoUser() {
  return prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { nickname: DEMO_USER_NICKNAME },
    create: {
      email: DEMO_USER_EMAIL,
      passwordHash: DEMO_USER_PASSWORD_HASH,
      nickname: DEMO_USER_NICKNAME
    }
  });
}

async function loadStateFromJson(): Promise<AppState> {
  await ensureStateFile();
  const raw = await readFile(STATE_PATH, "utf8");
  const state = JSON.parse(raw) as AppState;

  let migrated = false;

  state.tasks = state.tasks.map((task) => {
    if (task.progressLogs && task.createdAt) {
      return task;
    }

    migrated = true;
    return {
      ...task,
      createdAt: task.createdAt ?? new Date().toISOString(),
      completedAt: task.completedAt,
      completionReflection: task.completionReflection ?? "",
      progressLogs: []
    };
  });

  state.inspiration.bubbles = state.inspiration.bubbles.map((bubble, index) => {
    if (bubble.createdAt && bubble.taskDescription && bubble.milestones && bubble.eta) {
      return bubble;
    }

    migrated = true;
    return {
      ...bubble,
      createdAt:
        bubble.createdAt ??
        new Date(Date.now() - (state.inspiration.bubbles.length - index) * 86400000).toISOString(),
      taskDescription: bubble.taskDescription ?? state.inspiration.draftTemplate.taskDescription,
      milestones: bubble.milestones ?? state.inspiration.draftTemplate.milestones,
      eta: bubble.eta ?? state.inspiration.draftTemplate.eta
    };
  });

  if (migrated) {
    await saveStateToJson(state);
  }

  return state;
}

async function saveStateToJson(nextState: AppState) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(nextState, null, 2), "utf8");
}

async function saveStateToDatabase(nextState: AppState) {
  const user = await ensureDemoUser();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.userSettings.upsert({
      where: { userId: user.id },
      update: {
        quickCapturePlaceholder: nextState.inspiration.quickCapturePlaceholder
      },
      create: {
        userId: user.id,
        quickCapturePlaceholder: nextState.inspiration.quickCapturePlaceholder
      }
    });

    await tx.task.deleteMany({ where: { userId: user.id } });
    await tx.inspiration.deleteMany({ where: { userId: user.id } });

    for (const bubble of nextState.inspiration.bubbles) {
      await tx.inspiration.create({
        data: {
          id: bubble.id,
          userId: user.id,
          sourceText: bubble.title,
          title: bubble.title,
          taskDescription: bubble.taskDescription,
          eta: parseOptionalDate(bubble.eta),
          energy: bubble.energy,
          state: bubble.state,
          tags: bubble.tags,
          createdAt: new Date(bubble.createdAt),
          updatedAt: new Date(bubble.createdAt),
          milestones: {
            create: bubble.milestones.map((milestone, index) => ({
              id: milestone.id,
              title: milestone.title,
              weight: milestone.weight,
              sortOrder: index
            }))
          }
        }
      });
    }

    for (const task of nextState.tasks) {
      await tx.task.create({
        data: {
          id: task.id,
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
          completionReflection: task.completionReflection ?? null,
          milestones: {
            create: task.milestones.map((milestone, index) => ({
              id: milestone.id,
              title: milestone.title,
              weight: milestone.weight,
              sortOrder: index
            }))
          },
          progressLogs: {
            create: task.progressLogs.map((log) => ({
              id: log.id,
              summary: log.summary,
              progressBefore: log.progressBefore,
              progressAfter: log.progressAfter,
              increase: log.increase,
              createdAt: new Date(log.date)
            }))
          }
        }
      });
    }
  });
}

async function loadStateFromDatabase(): Promise<AppState> {
  const user = await ensureDemoUser();
  const staticState = mapStaticState();

  const [settings, inspirations, tasks] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    prisma.inspiration.findMany({
      where: { userId: user.id, discardedAt: null },
      include: {
        milestones: {
          orderBy: { sortOrder: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.task.findMany({
      where: { userId: user.id },
      include: {
        milestones: {
          orderBy: { sortOrder: "asc" }
        },
        progressLogs: {
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  if (inspirations.length === 0 && tasks.length === 0) {
    const initial = createInitialState();
    await saveStateToDatabase(initial);
    return initial;
  }

  return {
    brand: staticState.brand,
    inspiration: {
      ...staticState.inspiration,
      quickCapturePlaceholder:
        settings?.quickCapturePlaceholder ?? staticState.inspiration.quickCapturePlaceholder,
      bubbles: inspirations.map((bubble: DbInspirationRecord) => ({
        id: bubble.id,
        title: bubble.title,
        energy: bubble.energy as BubbleEnergy,
        tags: bubble.tags,
        state: bubble.state as BubbleState,
        createdAt: bubble.createdAt.toISOString(),
        taskDescription: bubble.taskDescription,
        milestones: bubble.milestones.map((milestone: DbMilestone) => ({
          id: milestone.id,
          title: milestone.title,
          weight: milestone.weight
        })),
        eta: bubble.eta ? bubble.eta.toISOString().slice(0, 10) : staticState.inspiration.draftTemplate.eta
      })),
      draftTemplate: staticState.inspiration.draftTemplate
    },
    execution: staticState.execution,
    tasks: tasks.map((task: DbTaskRecord) => ({
      id: task.id,
      label: task.label,
      title: task.title,
      detail: task.detail,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      completionReflection: task.completionReflection ?? "",
      phase: task.phase,
      progress: task.progress,
      eta: task.eta,
      ownerNote: task.ownerNote,
      mode: task.mode as TaskMode,
      accent: task.accent as Accent,
      rotting: task.rotting,
      lastTouchedAt: task.lastTouchedAt.toISOString(),
      milestones: task.milestones.map((milestone: DbMilestone) => ({
        id: milestone.id,
        title: milestone.title,
        weight: milestone.weight
      })),
      progressLogs: task.progressLogs.map((log: DbProgressLog) => ({
        id: log.id,
        date: log.createdAt.toISOString(),
        summary: log.summary,
        progressBefore: log.progressBefore,
        progressAfter: log.progressAfter,
        increase: log.increase
      }))
    })),
    achievement: staticState.achievement
  };
}

export async function loadState(): Promise<AppState> {
  if (cache) {
    return cache;
  }

  cache = hasConfiguredDatabaseUrl() ? await loadStateFromDatabase() : await loadStateFromJson();
  return cache;
}

export async function saveState(nextState: AppState): Promise<void> {
  cache = nextState;

  if (hasConfiguredDatabaseUrl()) {
    await saveStateToDatabase(nextState);
    return;
  }

  await saveStateToJson(nextState);
}
