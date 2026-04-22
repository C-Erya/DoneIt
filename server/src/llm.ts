import OpenAI from "openai";
import type { InspirationDraft, Milestone, Task } from "./types.js";

const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL
    })
  : null;

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonText = fenced?.[1] ?? trimmed;
  return JSON.parse(jsonText) as unknown;
}

function getAssistantText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      const part = item as Record<string, unknown>;
      return typeof part.text === "string" ? part.text : "";
    })
    .join("\n")
    .trim();
}

function isMilestone(value: unknown): value is Milestone {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.title === "string" && typeof item.weight === "number";
}

function normalizeMilestones(value: unknown, fallback: Milestone[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const milestones = value
    .filter(isMilestone)
    .slice(0, 10)
    .map((item, index) => ({
      id: typeof item.id === "string" ? item.id : `m${index + 1}`,
      title: item.title,
      weight: Math.max(0, Math.min(100, Math.round(item.weight)))
    }));

  return milestones.length > 0 ? milestones : fallback;
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEta(value: unknown, fallback: string) {
  const today = todayDateValue();
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return fallback && fallback >= today ? fallback : today;
  }

  return raw >= today ? raw : today;
}

async function createChatCompletion(systemPrompt: string, userPrompt: string) {
  if (!client) {
    return null;
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: {
      type: "json_object"
    },
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ]
  });

  return getAssistantText(completion.choices[0]?.message?.content);
}

function baseInspirationSystemPrompt() {
  const today = todayDateValue();

  return [
    "You are a task decomposition assistant.",
    "Always return a JSON object only. No markdown. No explanation.",
    "Write taskName, taskDescription and milestone titles in Simplified Chinese.",
    "Return JSON fields: taskName, taskDescription, milestones, eta.",
    "milestones should normally contain 5 items.",
    "Each milestone must contain: id, title, weight.",
    "The sum of all milestone weights must be exactly 100.",
    "eta must use YYYY-MM-DD format.",
    `Today is ${today}. eta must not be earlier than today.`
  ].join(" ");
}

export function isLlmEnabled() {
  return Boolean(client);
}

export async function generateInspirationDraft(
  source: string,
  fallback: InspirationDraft
): Promise<InspirationDraft> {
  if (!client) {
    return fallback;
  }

  const content = await createChatCompletion(
    baseInspirationSystemPrompt(),
    [
      "Create an execution-ready task draft from this inspiration.",
      `Inspiration: ${source}`
    ].join("\n")
  );

  const parsed = extractJson(content ?? "") as Record<string, unknown>;

  return {
    ...fallback,
    source,
    taskName:
      typeof parsed.taskName === "string" && parsed.taskName.trim()
        ? parsed.taskName
        : fallback.taskName,
    taskDescription:
      typeof parsed.taskDescription === "string" && parsed.taskDescription.trim()
        ? parsed.taskDescription
        : fallback.taskDescription,
    eta: normalizeEta(parsed.eta, fallback.eta),
    milestones: normalizeMilestones(parsed.milestones, fallback.milestones)
  };
}

export async function refineInspirationDraft(input: {
  source: string;
  conversation: string[];
  latestUserInput: string;
  currentDraft: InspirationDraft;
}): Promise<InspirationDraft | null> {
  if (!client) {
    return null;
  }

  const content = await createChatCompletion(
    [
      baseInspirationSystemPrompt(),
      "You are refining an existing task draft.",
      "Use the original inspiration, current draft and all conversation notes to update the draft.",
      "Keep useful existing details unless the new context clearly improves them."
    ].join(" "),
    [
      `Original inspiration: ${input.source}`,
      `Current draft: ${JSON.stringify(
        {
          taskName: input.currentDraft.taskName,
          taskDescription: input.currentDraft.taskDescription,
          milestones: input.currentDraft.milestones,
          eta: input.currentDraft.eta
        },
        null,
        2
      )}`,
      `Conversation history: ${JSON.stringify(input.conversation, null, 2)}`,
      `Latest user supplement: ${input.latestUserInput}`
    ].join("\n\n")
  );

  const parsed = extractJson(content ?? "") as Record<string, unknown>;

  return {
    ...input.currentDraft,
    taskName:
      typeof parsed.taskName === "string" && parsed.taskName.trim()
        ? parsed.taskName
        : input.currentDraft.taskName,
    taskDescription:
      typeof parsed.taskDescription === "string" && parsed.taskDescription.trim()
        ? parsed.taskDescription
        : input.currentDraft.taskDescription,
    eta: normalizeEta(parsed.eta, input.currentDraft.eta),
    milestones: normalizeMilestones(parsed.milestones, input.currentDraft.milestones)
  };
}

export async function generateProgressSuggestions(inputText: string, tasks: Task[]) {
  if (!client) {
    return null;
  }

  const content = await createChatCompletion(
    [
      "You are a task progress analysis assistant.",
      "Always return a JSON object only. No markdown. No explanation.",
      "Write suggestionType, suggestionReason and milestoneHit in Simplified Chinese.",
      "Return JSON fields: inputSummary, items.",
      "You must return one item for every task in the task list.",
      "If the user did not clearly mention a task, set suggestedIncrease and adjustedIncrease to 0, and keep resultingProgress equal to the current progress.",
      "Each task includes stageMaxProgress. The resultingProgress for that task must not exceed stageMaxProgress.",
      "Each item must include taskId, taskName, suggestionType, suggestionReason, suggestedIncrease, adjustedIncrease, resultingProgress, milestoneHit, cta.",
      "adjustedIncrease and resultingProgress must be numbers between 0 and 100.",
      "If the user clearly reached a later milestone, earlier milestones must also be considered completed."
    ].join(" "),
    [
      `Today progress input: ${inputText || "The user made some progress today. Please analyze by task."}`,
      `Task list: ${JSON.stringify(
        tasks.map((task) => ({
          taskId: task.id,
          taskName: task.title,
          detail: task.detail,
          progress: task.progress,
          stageMaxProgress: (() => {
            let total = 0;

            for (const milestone of task.milestones) {
              total += milestone.weight;
              if (task.progress < total) {
                return total;
              }
            }

            return 100;
          })(),
          milestones: task.milestones
        })),
        null,
        2
      )}`
    ].join("\n\n")
  );

  const parsed = extractJson(content ?? "") as Record<string, unknown>;
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return {
    title: "AI 今日进度确认",
    inputSummary:
      typeof parsed.inputSummary === "string" && parsed.inputSummary.trim()
        ? parsed.inputSummary
        : "AI 已根据今日记录生成任务推进建议。",
    items
  };
}
