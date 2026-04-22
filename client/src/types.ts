export type Accent = "cyan" | "violet";

export type OverviewResponse = {
  brand: {
    title: string;
    subtitle: string;
  };
  pages: Array<{
    id: string;
    path: string;
    title: string;
  }>;
};

export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
  createdAt: string;
  isDemo: boolean;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type InspirationResponse = {
  title: string;
  subtitle: string;
  pullTabLabel: string;
  quickCapturePlaceholder: string;
  bubbles: Array<{
    id: string;
    title: string;
    energy: "high" | "medium" | "low";
    tags: string[];
    state: "fresh" | "processing" | "queued";
    createdAt: string;
    taskDescription: string;
    milestones: Array<{
      id: string;
      title: string;
      weight: number;
    }>;
    eta: string;
  }>;
  decompositionPreview: {
    taskName: string;
    taskDescription: string;
    milestones: Array<{
      id: string;
      title: string;
      weight: number;
    }>;
    eta: string;
    confirmLabel: string;
    holdLabel: string;
  };
};

export type InspirationDraftResponse = {
  source: string;
  taskName: string;
  taskDescription: string;
  milestones: Array<{
    id: string;
    title: string;
    weight: number;
  }>;
  eta: string;
  confirmLabel: string;
  holdLabel: string;
};

export type ExecutionResponse = {
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
  activeTasks: Array<{
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
    milestoneCount: number;
    completedMilestones: number;
    mode: "snap" | "creep";
    accent: Accent;
    rotting: boolean;
    milestones: Array<{
      id: string;
      title: string;
      weight: number;
    }>;
    progressLogs: Array<{
      id: string;
      date: string;
      summary: string;
      progressBefore: number;
      progressAfter: number;
      increase: number;
    }>;
  }>;
  quickStats: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  confirmPanel: {
    title: string;
    inputSummary: string;
    items: Array<{
      taskId: string;
      taskName: string;
      suggestionType: string;
      suggestionReason: string;
      suggestedIncrease: number;
      adjustedIncrease: number;
      resultingProgress: number;
      stageMaxProgress: number;
      milestoneHit: string;
      cta: string;
    }>;
  };
};

export type ExecutionConfirmPanel = ExecutionResponse["confirmPanel"];

export type HonorResponse = {
  title: string;
  subtitle: string;
  summary: {
    totalStars: number;
    completedProjects: number;
    longestRun: string;
  };
  goalMatrix: Array<{
    id: string;
    name: string;
    status: "active" | "rotting" | "archived";
    progress: number;
    lastRecordDays: number;
    createdAt: string;
    completedAt?: string;
    completionReflection?: string;
    milestones: Array<{
      id: string;
      title: string;
      weight: number;
      completedAt?: string;
    }>;
  }>;
  nebula: {
    headline: string;
    description: string;
    stars: Array<{
      id: string;
      name: string;
      status: "active" | "archived";
      x: string;
      y: string;
      size: number;
      family: Accent;
      createdAt: string;
      completedAt?: string;
      completionReflection?: string;
      milestones: Array<{
        id: string;
        title: string;
        weight: number;
        completedAt?: string;
      }>;
      report: string;
    }>;
  };
};
