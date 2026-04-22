import { randomUUID } from "node:crypto";
import { prisma } from "./db.js";
import { dashboardData } from "./data/dashboard.js";
import {
  generateInspirationDraft,
  generateProgressSuggestions,
  refineInspirationDraft
} from "./llm.js";
import type {
  Accent,
  GoalStatus,
  InspirationBubble,
  InspirationDraft,
  Milestone,
  Task
} from "./types.js";

type TaskMilestoneRecord = {
  id: string;
  title: string;
  weight: number;
  sortOrder: number;
};

type TaskProgressLogRecord = {
  id: string;
  summary: string;
  progressBefore: number;
  progressAfter: number;
  increase: number;
  createdAt: Date;
};

type TaskRecord = {
  id: string;
  label: string;
  title: string;
  detail: string;
  phase: string;
  progress: number;
  eta: string;
  ownerNote: string;
  mode: string;
  accent: string;
  rotting: boolean;
  createdAt: Date;
  completedAt: Date | null;
  completionReflection: string | null;
  lastTouchedAt: Date;
  milestones: TaskMilestoneRecord[];
  progressLogs: TaskProgressLogRecord[];
};

type InspirationMilestoneRecord = {
  id: string;
  title: string;
  weight: number;
  sortOrder: number;
};

type InspirationRecord = {
  id: string;
  title: string;
  energy: string;
  tags: string[];
  state: string;
  createdAt: Date;
  taskDescription: string;
  eta: Date | null;
  milestones: InspirationMilestoneRecord[];
};

const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL?.trim() || "demo@task-web.local";
const DEMO_USER_PASSWORD_HASH = process.env.DEMO_USER_PASSWORD_HASH?.trim() || "local-demo-no-login";
const DEMO_USER_NICKNAME = process.env.DEMO_USER_NICKNAME?.trim() || "Demo User";

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function parseOptionalDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function completedMilestonesFromProgress(progress: number, milestones: Milestone[]) {
  let total = 0;
  let completed = 0;

  for (const milestone of milestones) {
    total += milestone.weight;
    if (progress >= total) {
      completed += 1;
    }
  }

  return completed;
}

function milestoneProgressAt(milestones: Milestone[], milestoneIndex: number) {
  return milestones
    .slice(0, milestoneIndex + 1)
    .reduce((sum, milestone) => sum + milestone.weight, 0);
}

function currentStageMaxProgress(task: Task) {
  let total = 0;

  for (const milestone of task.milestones) {
    total += milestone.weight;
    if (task.progress < total) {
      return Math.min(100, total);
    }
  }

  return 100;
}

function buildMilestoneTimeline(task: Task) {
  const logsByTime = [...task.progressLogs].sort(
    (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()
  );

  const completedTimes = task.milestones.map(() => undefined as string | undefined);

  logsByTime.forEach((log) => {
    task.milestones.forEach((_milestone, index) => {
      const threshold = milestoneProgressAt(task.milestones, index);

      if (log.progressBefore < threshold && log.progressAfter >= threshold) {
        completedTimes[index] = log.date;
      }

      if (log.progressAfter < threshold) {
        completedTimes[index] = undefined;
      }
    });
  });

  return task.milestones.map((milestone, index) => ({
    id: milestone.id,
    title: milestone.title,
    weight: milestone.weight,
    completedAt:
      task.progress >= milestoneProgressAt(task.milestones, index)
        ? completedTimes[index] ?? (task.completedAt ? task.completedAt : undefined)
        : undefined
  }));
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function findMentionedMilestoneIndex(task: Task, text: string) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return -1;
  }

  let matchedIndex = -1;
  task.milestones.forEach((milestone, index) => {
    const title = normalizeText(milestone.title);
    if (title && normalizedText.includes(title)) {
      matchedIndex = Math.max(matchedIndex, index);
    }
  });

  return matchedIndex;
}

function coerceNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function mapTaskRecord(record: TaskRecord): Task {
  return {
    id: record.id,
    label: record.label,
    title: record.title,
    detail: record.detail,
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    completionReflection: record.completionReflection ?? "",
    phase: record.phase,
    progress: record.progress,
    eta: record.eta,
    ownerNote: record.ownerNote,
    mode: record.mode as Task["mode"],
    accent: record.accent as Accent,
    rotting: record.rotting,
    lastTouchedAt: record.lastTouchedAt.toISOString(),
    milestones: record.milestones
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        weight: milestone.weight
      })),
    progressLogs: record.progressLogs
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((log) => ({
        id: log.id,
        date: log.createdAt.toISOString(),
        summary: log.summary,
        progressBefore: log.progressBefore,
        progressAfter: log.progressAfter,
        increase: log.increase
      }))
  };
}

function mapInspirationRecord(record: InspirationRecord): InspirationBubble {
  return {
    id: record.id,
    title: record.title,
    energy: record.energy as InspirationBubble["energy"],
    tags: record.tags,
    state: record.state as InspirationBubble["state"],
    createdAt: record.createdAt.toISOString(),
    taskDescription: record.taskDescription,
    milestones: record.milestones
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        weight: milestone.weight
      })),
    eta: record.eta ? record.eta.toISOString().slice(0, 10) : todayDateValue()
  };
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

async function resolveUserId(userId?: string) {
  if (userId) {
    return userId;
  }

  const user = await ensureDemoUser();
  return user.id;
}

async function listInspirationRecords(userId?: string) {
  const resolvedUserId = await resolveUserId(userId);
  return prisma.inspiration.findMany({
    where: {
      userId: resolvedUserId,
      discardedAt: null
    },
    include: {
      milestones: {
        orderBy: { sortOrder: "asc" }
      }
    },
    orderBy: { createdAt: "desc" }
  }) as Promise<InspirationRecord[]>;
}

async function listTaskRecords(userId?: string, options?: { includeCompleted?: boolean; limit?: number }) {
  const resolvedUserId = await resolveUserId(userId);
  return prisma.task.findMany({
    where: {
      userId: resolvedUserId,
      ...(options?.includeCompleted ? {} : { completedAt: null })
    },
    include: {
      milestones: {
        orderBy: { sortOrder: "asc" }
      },
      progressLogs: {
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit
  }) as Promise<TaskRecord[]>;
}

async function findTaskRecordById(taskId: string, userId?: string) {
  const resolvedUserId = await resolveUserId(userId);
  return prisma.task.findFirst({
    where: {
      id: taskId,
      userId: resolvedUserId
    },
    include: {
      milestones: {
        orderBy: { sortOrder: "asc" }
      },
      progressLogs: {
        orderBy: { createdAt: "desc" }
      }
    }
  }) as Promise<TaskRecord | null>;
}

async function findInspirationRecordBySource(source: string, userId?: string) {
  const resolvedUserId = await resolveUserId(userId);
  return prisma.inspiration.findFirst({
    where: {
      userId: resolvedUserId,
      discardedAt: null,
      OR: [{ title: source }, { sourceText: source }]
    },
    include: {
      milestones: {
        orderBy: { sortOrder: "asc" }
      }
    }
  }) as Promise<InspirationRecord | null>;
}

async function getQuickCapturePlaceholder(userId?: string) {
  const resolvedUserId = await resolveUserId(userId);
  const settings = await prisma.userSettings.findUnique({
    where: { userId: resolvedUserId }
  });

  return settings?.quickCapturePlaceholder ?? dashboardData.inspiration.quickCapturePlaceholder;
}

function buildExecutionView(tasks: Task[]) {
  const activeTasks = tasks.filter((task) => !task.completedAt).slice(0, 6);

  return {
    ...dashboardData.execution,
    activeTasks: activeTasks.map((task) => ({
      id: task.id,
      label: task.label,
      title: task.title,
      detail: task.detail,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      completionReflection: task.completionReflection,
      phase: task.phase,
      progress: task.progress,
      eta: task.eta,
      ownerNote: task.ownerNote,
      milestoneCount: task.milestones.length,
      completedMilestones: completedMilestonesFromProgress(task.progress, task.milestones),
      mode: task.mode,
      accent: task.accent,
      rotting: task.rotting,
      milestones: task.milestones,
      progressLogs: task.progressLogs
    })),
    quickStats: [
      { id: "focus", label: "进行中的任务", value: String(activeTasks.length) },
      { id: "loop", label: "建议复盘间隔", value: "30 分钟" },
      { id: "creep", label: "持续推进节奏", value: "+1% ~ 3%" }
    ]
  };
}

function buildConfirmItems(tasks: Task[]) {
  return tasks.map((task) => ({
    taskId: task.id,
    taskName: task.title,
    suggestionType: "等待确认推进",
    suggestionReason: "暂未识别到更明确的进展，需要你逐项确认。",
    suggestedIncrease: 0,
    adjustedIncrease: 0,
    resultingProgress: task.progress,
    stageMaxProgress: currentStageMaxProgress(task),
    milestoneHit: "未识别到该任务的有效进展",
    cta: "暂不推进"
  }));
}

function normalizeConfirmItems(
  items: Array<Record<string, unknown>>,
  tasks: Task[],
  inputText = ""
) {
  const itemsByTaskId = new Map(
    items
      .map((item) => [typeof item.taskId === "string" ? item.taskId : "", item] as const)
      .filter(([taskId]) => Boolean(taskId))
  );

  return tasks.map((task) => {
    const item = itemsByTaskId.get(task.id);
    const suggestionType =
      typeof item?.suggestionType === "string" && item.suggestionType.trim()
        ? item.suggestionType
        : "等待确认推进";
    const suggestionReason =
      typeof item?.suggestionReason === "string" && item.suggestionReason.trim()
        ? item.suggestionReason
        : "我识别到了一些可能和这项任务相关的信息，但还需要你确认。";
    const milestoneHit =
      typeof item?.milestoneHit === "string" && item.milestoneHit.trim()
        ? item.milestoneHit
        : "未识别到该任务的有效进展";
    const matchedMilestoneIndex =
      item && item.taskId === task.id
        ? findMentionedMilestoneIndex(task, [inputText, suggestionType, suggestionReason, milestoneHit].join("\n"))
        : -1;
    const stageMaxProgress =
      matchedMilestoneIndex >= 0
        ? milestoneProgressAt(task.milestones, matchedMilestoneIndex)
        : currentStageMaxProgress(task);
    const requiredProgress =
      matchedMilestoneIndex >= 0
        ? milestoneProgressAt(task.milestones, matchedMilestoneIndex)
        : task.progress;
    const modelAdjustedIncrease = item ? coerceNumber(item.adjustedIncrease, 0) : 0;
    const modelSuggestedIncrease = item ? coerceNumber(item.suggestedIncrease, modelAdjustedIncrease) : 0;
    const modelResultingProgress = item
      ? coerceNumber(item.resultingProgress, task.progress + modelAdjustedIncrease)
      : task.progress;
    const correctedResultingProgress = Math.max(
      task.progress,
      Math.min(stageMaxProgress, Math.max(modelResultingProgress, requiredProgress))
    );
    const correctedIncrease = Math.max(0, correctedResultingProgress - task.progress);
    const milestoneLabel =
      matchedMilestoneIndex >= 0
        ? `已推进至：${task.milestones[matchedMilestoneIndex].title}`
        : milestoneHit;

    return {
      taskId: task.id,
      taskName: task.title,
      suggestionType,
      suggestionReason,
      suggestedIncrease: Math.max(0, Math.min(100, Math.max(modelSuggestedIncrease, correctedIncrease))),
      adjustedIncrease: Math.max(0, Math.min(100, correctedIncrease)),
      resultingProgress: correctedResultingProgress,
      stageMaxProgress,
      milestoneHit: `${milestoneLabel} (${stageMaxProgress}%)`,
      cta:
        typeof item?.cta === "string" && item.cta.trim()
          ? item.cta
          : correctedIncrease > 0
            ? "确认推进"
            : "暂不推进"
    };
  });
}

function buildAchievementView(tasks: Task[]) {
  const now = Date.now();
  const goalMatrix = tasks.map((task) => {
    const lastTouched = new Date(task.lastTouchedAt).getTime();
    const days = Math.max(0, Math.floor((now - lastTouched) / (1000 * 60 * 60 * 24)));
    const status: GoalStatus = task.completedAt ? "archived" : days > 3 ? "rotting" : "active";

    return {
      id: task.id,
      name: task.title,
      status,
      progress: task.progress,
      lastRecordDays: days,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      completionReflection: task.completionReflection,
      milestones: buildMilestoneTimeline(task)
    };
  });

  const stars = tasks.map((task, index) => ({
    id: task.id,
    name: task.title,
    status: task.completedAt ? ("archived" as const) : ("active" as const),
    x: `${18 + (index * 17) % 64}%`,
    y: `${22 + (index * 13) % 54}%`,
    size: task.completedAt ? 18 : 12,
    family: task.accent,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    completionReflection: task.completionReflection,
    milestones: buildMilestoneTimeline(task),
    report: task.completedAt ? "已完成" : "进行中"
  }));

  return {
    title: dashboardData.achievement.title,
    subtitle: dashboardData.achievement.subtitle,
    summary: {
      totalStars: stars.length,
      completedProjects: goalMatrix.filter((goal) => goal.status === "archived").length,
      longestRun: "12 天"
    },
    goalMatrix,
    nebula: {
      headline: "Success Nebula",
      description: "这里会持续记录已经完成和正在推进的任务。",
      stars
    }
  };
}

function buildBubbleFromTask(task: Task): Omit<InspirationBubble, "id"> {
  return {
    title: task.title,
    energy: task.rotting ? "low" : task.progress >= 50 ? "high" : "medium",
    tags: ["回退任务"],
    state: "queued",
    createdAt: new Date().toISOString(),
    taskDescription: task.detail,
    milestones: task.milestones,
    eta: task.eta
  };
}

export async function getOverview() {
  return {
    brand: dashboardData.brand,
    pages: [
      { id: "inspiration", path: "/inspiration", title: dashboardData.inspiration.title },
      { id: "execution", path: "/", title: dashboardData.execution.title },
      { id: "achievement", path: "/honor", title: dashboardData.achievement.title }
    ]
  };
}

export async function getInspirationView(userId?: string) {
  const bubbles = (await listInspirationRecords(userId)).map(mapInspirationRecord);
  const quickCapturePlaceholder = await getQuickCapturePlaceholder(userId);

  return {
    title: dashboardData.inspiration.title,
    subtitle: dashboardData.inspiration.subtitle,
    pullTabLabel: dashboardData.inspiration.pullTabLabel,
    quickCapturePlaceholder,
    bubbles,
    decompositionPreview: dashboardData.inspiration.decompositionPreview
  };
}

export async function getExecutionView(userId?: string) {
  const tasks = (await listTaskRecords(userId, { includeCompleted: false, limit: 6 })).map(mapTaskRecord);

  return {
    ...buildExecutionView(tasks),
    confirmPanel: {
      title: "AI 拆解今日进度",
      inputSummary: "AI 会根据你的输入，为当前最多 6 个进行中任务给出待确认的推进建议。",
      items: buildConfirmItems(tasks)
    }
  };
}

export async function getAchievementView(userId?: string) {
  const tasks = (await listTaskRecords(userId, { includeCompleted: true })).map(mapTaskRecord);
  return buildAchievementView(tasks);
}

export async function decomposeInspiration(source: string, userId?: string) {
  const existingBubble = await findInspirationRecordBySource(source, userId);
  const template = dashboardData.inspiration.decompositionPreview;

  const fallback: InspirationDraft = {
    source,
    taskName: existingBubble?.title ?? (source === "新灵感" ? template.taskName : source),
    taskDescription: existingBubble?.taskDescription ?? template.taskDescription,
    milestones: existingBubble
      ? mapInspirationRecord(existingBubble).milestones
      : template.milestones,
    eta: existingBubble?.eta ? existingBubble.eta.toISOString().slice(0, 10) : todayDateValue(),
    confirmLabel: template.confirmLabel,
    holdLabel: template.holdLabel
  };

  try {
    return await generateInspirationDraft(source, fallback);
  } catch (error) {
    console.error("LLM inspiration decomposition failed, falling back locally:", error);
    return fallback;
  }
}

export async function refineInspiration(input: {
  source: string;
  conversation: string[];
  latestUserInput: string;
  currentDraft: InspirationDraft;
}) {
  const fallback: InspirationDraft = {
    ...input.currentDraft,
    taskDescription: [input.currentDraft.taskDescription, input.latestUserInput].filter(Boolean).join("\n\n")
  };

  try {
    const nextDraft = await refineInspirationDraft(input);
    return nextDraft ?? fallback;
  } catch (error) {
    console.error("LLM inspiration refinement failed, falling back locally:", error);
    return fallback;
  }
}

export async function createTaskFromInspiration(input: {
  source: string;
  taskName: string;
  taskDescription: string;
  milestones: Milestone[];
  eta: string;
}, userId?: string) {
  const totalWeight = input.milestones.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight !== 100) {
    throw new Error("Milestone weights must sum to 100");
  }

  const resolvedUserId = await resolveUserId(userId);
  const taskCount = await prisma.task.count({ where: { userId: resolvedUserId } });
  const accent: Accent = taskCount % 2 === 0 ? "cyan" : "violet";
  const createdAt = new Date();
  const createdTask = await prisma.$transaction(async (tx) => {
    await tx.inspiration.updateMany({
      where: {
        userId: resolvedUserId,
        OR: [{ title: input.source }, { title: input.taskName }, { sourceText: input.source }]
      },
      data: {
        discardedAt: new Date()
      }
    });

    return tx.task.create({
      data: {
        id: randomUUID(),
        userId: resolvedUserId,
        label: "执行任务",
        title: input.taskName,
        detail: input.taskDescription,
        createdAt,
        updatedAt: createdAt,
        lastTouchedAt: createdAt,
        phase: `阶段 01/${input.milestones.length.toString().padStart(2, "0")}`,
        progress: 0,
        eta: input.eta,
        ownerNote: `来源灵感：${input.source}`,
        mode: "creep",
        accent,
        rotting: false,
        milestones: {
          create: input.milestones.map((milestone, index) => ({
            id: randomUUID(),
            title: milestone.title,
            weight: milestone.weight,
            sortOrder: index
          }))
        }
      },
      include: {
        milestones: {
          orderBy: { sortOrder: "asc" }
        },
        progressLogs: {
          orderBy: { createdAt: "desc" }
        }
      }
    });
  });

  return mapTaskRecord(createdTask as TaskRecord);
}

export async function holdInspiration(input: {
  source: string;
  taskName: string;
  taskDescription: string;
  milestones: Milestone[];
  eta: string;
  tags?: string[];
}, userId?: string) {
  const resolvedUserId = await resolveUserId(userId);
  const existing = await prisma.inspiration.findFirst({
    where: {
      userId: resolvedUserId,
      discardedAt: null,
      OR: [{ title: input.source }, { title: input.taskName }, { sourceText: input.source }]
    }
  });

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.inspiration.update({
        where: { id: existing.id },
        data: {
          sourceText: input.source,
          title: input.taskName,
          taskDescription: input.taskDescription,
          eta: parseOptionalDate(input.eta),
          tags: input.tags && input.tags.length > 0 ? input.tags : existing.tags,
          state: "queued",
          milestones: {
            deleteMany: {},
            create: input.milestones.map((milestone, index) => ({
              id: randomUUID(),
              title: milestone.title,
              weight: milestone.weight,
              sortOrder: index
            }))
          }
        }
      });
      return;
    }

    await tx.inspiration.create({
      data: {
        id: randomUUID(),
        userId: resolvedUserId,
        sourceText: input.source,
        title: input.taskName,
        energy: "medium",
        tags: input.tags && input.tags.length > 0 ? input.tags : ["灵感池"],
        state: "queued",
        createdAt: new Date(),
        updatedAt: new Date(),
        taskDescription: input.taskDescription,
        eta: parseOptionalDate(input.eta),
        milestones: {
          create: input.milestones.map((milestone, index) => ({
            id: randomUUID(),
            title: milestone.title,
            weight: milestone.weight,
            sortOrder: index
          }))
        }
      }
    });
  });

  return { ok: true };
}

export async function discardInspiration(source: string, userId?: string) {
  const resolvedUserId = await resolveUserId(userId);
  await prisma.inspiration.updateMany({
    where: {
      userId: resolvedUserId,
      discardedAt: null,
      OR: [{ title: source }, { sourceText: source }]
    },
    data: {
      discardedAt: new Date()
    }
  });
  return { ok: true };
}

export async function analyzeExecutionInput(inputText: string, userId?: string) {
  const tasks = (await listTaskRecords(userId, { includeCompleted: false, limit: 6 })).map(mapTaskRecord);

  try {
    const generated = await generateProgressSuggestions(inputText, tasks);
    if (generated) {
      return {
        ...generated,
        items: normalizeConfirmItems(generated.items as Array<Record<string, unknown>>, tasks, inputText)
      };
    }
  } catch (error) {
    console.error("LLM execution analysis failed, falling back locally:", error);
  }

  return {
    title: "AI 拆解今日进度",
    inputSummary: "AI 会根据你的输入，为当前最多 6 个进行中任务给出待确认的推进建议。",
    items: buildConfirmItems(tasks)
  };
}

export async function confirmTaskProgress(
  taskId: string,
  adjustedIncrease: number,
  maxResultingProgress?: number,
  userId?: string
) {
  const current = await findTaskRecordById(taskId, userId);

  if (!current) {
    throw new Error("Task not found");
  }

  const task = mapTaskRecord(current);
  const progressBefore = task.progress;
  const stageMaxProgress = Math.min(
    100,
    Math.max(task.progress, maxResultingProgress ?? currentStageMaxProgress(task))
  );
  const nextProgress = Math.min(stageMaxProgress, Math.max(0, task.progress + adjustedIncrease));
  const actualIncrease = nextProgress - progressBefore;
  const touchedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        progress: nextProgress,
        rotting: false,
        lastTouchedAt: touchedAt
      }
    });

    if (actualIncrease !== 0) {
      await tx.taskProgressLog.create({
        data: {
          id: randomUUID(),
          taskId,
          summary: `确认推进 ${actualIncrease > 0 ? "+" : ""}${actualIncrease}%`,
          progressBefore,
          progressAfter: nextProgress,
          increase: actualIncrease,
          createdAt: touchedAt
        }
      });
    }
  });

  const updated = await findTaskRecordById(taskId, userId);
  if (!updated) {
    throw new Error("Task not found after update");
  }

  return mapTaskRecord(updated);
}

export async function completeTask(taskId: string, reflection: string, userId?: string) {
  const current = await findTaskRecordById(taskId, userId);

  if (!current) {
    throw new Error("Task not found");
  }

  const completedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        progress: 100,
        completedAt,
        completionReflection: reflection,
        lastTouchedAt: completedAt
      }
    });

    await tx.taskProgressLog.create({
      data: {
        id: randomUUID(),
        taskId,
        summary: "任务已完成并记录心得",
        progressBefore: 100,
        progressAfter: 100,
        increase: 0,
        createdAt: completedAt
      }
    });
  });

  const updated = await findTaskRecordById(taskId, userId);
  if (!updated) {
    throw new Error("Task not found after completion");
  }

  return mapTaskRecord(updated);
}

export async function updateTaskDetails(
  taskId: string,
  input: { title: string; detail: string; eta: string; ownerNote: string; milestones: Milestone[] },
  userId?: string
) {
  const totalWeight = input.milestones.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight !== 100) {
    throw new Error("Milestone weights must sum to 100");
  }

  const existing = await findTaskRecordById(taskId, userId);
  if (!existing) {
    throw new Error("Task not found");
  }

  const updatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        detail: input.detail,
        eta: input.eta,
        ownerNote: input.ownerNote,
        phase: `阶段 01/${input.milestones.length.toString().padStart(2, "0")}`,
        lastTouchedAt: updatedAt,
        milestones: {
          deleteMany: {},
          create: input.milestones.map((milestone, index) => ({
            id: randomUUID(),
            title: milestone.title,
            weight: milestone.weight,
            sortOrder: index
          }))
        }
      }
    });
  });

  const updated = await findTaskRecordById(taskId, userId);
  if (!updated) {
    throw new Error("Task not found after update");
  }

  return mapTaskRecord(updated);
}

export async function returnTaskToInspiration(taskId: string, userId?: string) {
  const existing = await findTaskRecordById(taskId, userId);

  if (!existing) {
    throw new Error("Task not found");
  }

  const task = mapTaskRecord(existing);
  const resolvedUserId = await resolveUserId(userId);
  const alreadyExists = await prisma.inspiration.findFirst({
    where: {
      userId: resolvedUserId,
      discardedAt: null,
      title: task.title
    }
  });

  await prisma.$transaction(async (tx) => {
    if (!alreadyExists) {
      const bubble = buildBubbleFromTask(task);
      await tx.inspiration.create({
        data: {
          id: randomUUID(),
          userId: resolvedUserId,
          sourceText: task.title,
          title: bubble.title,
          energy: bubble.energy,
          tags: bubble.tags,
          state: bubble.state,
          createdAt: new Date(bubble.createdAt),
          updatedAt: new Date(bubble.createdAt),
          taskDescription: bubble.taskDescription,
          eta: parseOptionalDate(bubble.eta),
          milestones: {
            create: bubble.milestones.map((milestone, index) => ({
              id: randomUUID(),
              title: milestone.title,
              weight: milestone.weight,
              sortOrder: index
            }))
          }
        }
      });
    }

    await tx.task.delete({
      where: { id: taskId }
    });
  });

  return { ok: true };
}
