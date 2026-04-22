export type Accent = "cyan" | "violet";

export type BubbleState = "fresh" | "processing" | "queued";
export type BubbleEnergy = "high" | "medium" | "low";
export type TaskMode = "snap" | "creep";
export type GoalStatus = "active" | "rotting" | "archived";

export type Milestone = {
  id: string;
  title: string;
  weight: number;
};

export type TaskProgressLog = {
  id: string;
  date: string;
  summary: string;
  progressBefore: number;
  progressAfter: number;
  increase: number;
};

export type InspirationBubble = {
  id: string;
  title: string;
  energy: BubbleEnergy;
  tags: string[];
  state: BubbleState;
  createdAt: string;
  taskDescription: string;
  milestones: Milestone[];
  eta: string;
};

export type Task = {
  id: string;
  label: string;
  title: string;
  detail: string;
  createdAt: string;
  completedAt?: string;
  completionReflection?: string;
  phase: string;
  progress: number;
  eta: string;
  ownerNote: string;
  mode: TaskMode;
  accent: Accent;
  rotting: boolean;
  lastTouchedAt: string;
  milestones: Milestone[];
  progressLogs: TaskProgressLog[];
};

export type AchievementStar = {
  id: string;
  name: string;
  x: string;
  y: string;
  size: number;
  family: Accent;
  report: string;
};

export type AppState = {
  brand: {
    title: string;
    subtitle: string;
  };
  inspiration: {
    title: string;
    subtitle: string;
    pullTabLabel: string;
    quickCapturePlaceholder: string;
    bubbles: InspirationBubble[];
    draftTemplate: {
      taskName: string;
      taskDescription: string;
      milestones: Milestone[];
      eta: string;
      confirmLabel: string;
      holdLabel: string;
    };
  };
  execution: {
    title: string;
    subtitle: string;
    omniInput: {
      placeholder: string;
    };
    dailyEnergy: number;
    hintBubble: {
      text: string;
      targetLabel: string;
      targetPath: string;
    };
  };
  tasks: Task[];
  achievement: {
    title: string;
    subtitle: string;
    stars: AchievementStar[];
  };
};

export type InspirationDraft = {
  source: string;
  taskName: string;
  taskDescription: string;
  milestones: Milestone[];
  eta: string;
  confirmLabel: string;
  holdLabel: string;
};
