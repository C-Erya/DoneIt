import type {
  AuthResponse,
  AuthUser,
  ExecutionConfirmPanel,
  ExecutionResponse,
  HonorResponse,
  InspirationDraftResponse,
  InspirationResponse,
  OverviewResponse
} from "./types";

const AUTH_TOKEN_KEY = "task_web_demo_auth_token";
const AUTH_CHANGED_EVENT = "task-web-demo-auth-changed";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

function toApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function notifyAuthChanged() {
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function buildHeaders(includeJson = false) {
  const token = getAuthToken();
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(toApiUrl(path), {
    headers: buildHeaders()
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function send<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const response = await fetch(toApiUrl(path), {
    method,
    headers: buildHeaders(true),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  authChangedEvent: AUTH_CHANGED_EVENT,
  getStoredAuthToken: () => getAuthToken(),
  setStoredAuthToken: (token: string) => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    notifyAuthChanged();
  },
  clearStoredAuthToken: () => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    notifyAuthChanged();
  },
  register: (body: { email: string; password: string; nickname?: string }) =>
    send<AuthResponse>("/api/auth/register", "POST", body),
  login: (body: { email: string; password: string }) =>
    send<AuthResponse>("/api/auth/login", "POST", body),
  getCurrentUser: () => request<{ user: AuthUser | null }>("/api/auth/me"),
  getOverview: () => request<OverviewResponse>("/api/overview"),
  getInspiration: () => request<InspirationResponse>("/api/inspiration"),
  getExecution: () => request<ExecutionResponse>("/api/execution"),
  getHonor: () => request<HonorResponse>("/api/honor"),
  decomposeInspiration: (source: string) =>
    send<InspirationDraftResponse>("/api/inspiration/decompose", "POST", { source }),
  refineInspiration: (body: {
    source: string;
    conversation: string[];
    latestUserInput: string;
    currentDraft: {
      taskName: string;
      taskDescription: string;
      milestones: Array<{ id: string; title: string; weight: number }>;
      eta: string;
    };
  }) => send<InspirationDraftResponse>("/api/inspiration/refine", "POST", body),
  createInspirationTask: (body: {
    source: string;
    taskName: string;
    taskDescription: string;
    milestones: Array<{ id: string; title: string; weight: number }>;
    eta: string;
  }) => send("/api/inspiration/tasks", "POST", body),
  holdInspiration: (body: {
    source: string;
    taskName: string;
    taskDescription: string;
    milestones: Array<{ id: string; title: string; weight: number }>;
    eta: string;
    tags?: string[];
  }) =>
    send("/api/inspiration/hold", "POST", body),
  discardInspiration: (source: string) =>
    send("/api/inspiration/discard", "POST", { source }),
  analyzeExecution: (inputText: string) =>
    send<ExecutionConfirmPanel>("/api/execution/analyze", "POST", { inputText }),
  confirmExecutionTask: (taskId: string, adjustedIncrease: number, maxResultingProgress: number) =>
    send("/api/execution/confirm", "POST", { taskId, adjustedIncrease, maxResultingProgress }),
  completeTask: (taskId: string, reflection: string) =>
    send(`/api/tasks/${taskId}/complete`, "POST", { reflection }),
  returnTaskToInspiration: (taskId: string) =>
    send(`/api/tasks/${taskId}/return-to-inspiration`, "POST", {}),
  updateTask: (
    taskId: string,
    body: {
      title: string;
      detail: string;
      eta: string;
      ownerNote: string;
      milestones: Array<{ id: string; title: string; weight: number }>;
    }
  ) => send(`/api/tasks/${taskId}`, "PUT", body)
};
