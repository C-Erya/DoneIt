import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import {
  getCurrentUser,
  loginUser,
  registerUser,
  resolveRequestUserId
} from "./auth.js";
import {
  analyzeExecutionInput,
  confirmTaskProgress,
  createTaskFromInspiration,
  decomposeInspiration,
  discardInspiration,
  completeTask,
  refineInspiration,
  getAchievementView,
  getExecutionView,
  getInspirationView,
  getOverview,
  holdInspiration,
  returnTaskToInspiration,
  updateTaskDetails
} from "./service.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "");
}

const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

function matchesOriginPattern(origin: string, pattern: string) {
  if (pattern.includes("*")) {
    const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escapedPattern}$`).test(origin);
  }

  return origin === pattern;
}

function isVercelOrigin(origin: string) {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string) {
  return isVercelOrigin(origin) || clientOrigins.some((pattern) => matchesOriginPattern(origin, pattern));
}

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = origin ? normalizeOrigin(origin) : "";
      if (!origin || isAllowedOrigin(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: false
  })
);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(express.json());

type AuthedRequest = express.Request & {
  userId?: string;
  authToken?: string;
};

function extractBearerToken(req: express.Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }

  return header.slice("Bearer ".length).trim();
}

async function attachUser(req: AuthedRequest, _res: express.Response, next: express.NextFunction) {
  try {
    const token = extractBearerToken(req);
    req.authToken = token;
    req.userId = await resolveRequestUserId(token);
    next();
  } catch (error) {
    next(error);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "").trim();
    const nickname = String(req.body?.nickname ?? "").trim();

    res.status(201).json(await registerUser({ email, password, nickname }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "").trim();

    res.json(await loginUser({ email, password }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", async (req, res, next) => {
  try {
    res.json({ user: await getCurrentUser(extractBearerToken(req)) });
  } catch (error) {
    next(error);
  }
});

app.use("/api", attachUser);

app.get("/api/overview", async (_req, res, next) => {
  try {
    res.json(await getOverview());
  } catch (error) {
    next(error);
  }
});

app.get("/api/inspiration", async (req: AuthedRequest, res, next) => {
  try {
    res.json(await getInspirationView(req.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/inspiration/decompose", async (req: AuthedRequest, res, next) => {
  try {
    const source = String(req.body?.source ?? "").trim();
    if (!source) {
      res.status(400).json({ message: "source is required" });
      return;
    }

    res.json(await decomposeInspiration(source, req.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/inspiration/refine", async (req, res, next) => {
  try {
    const source = String(req.body?.source ?? "").trim();
    const latestUserInput = String(req.body?.latestUserInput ?? "").trim();
    const conversation = Array.isArray(req.body?.conversation)
      ? req.body.conversation.map((item: unknown) => String(item ?? "").trim()).filter(Boolean)
      : [];
    const currentDraft = req.body?.currentDraft;

    if (
      !source ||
      !latestUserInput ||
      !currentDraft ||
      typeof currentDraft.taskName !== "string" ||
      typeof currentDraft.taskDescription !== "string" ||
      typeof currentDraft.eta !== "string" ||
      !Array.isArray(currentDraft.milestones)
    ) {
      res.status(400).json({ message: "invalid inspiration refine payload" });
      return;
    }

    res.json(
      await refineInspiration({
        source,
        latestUserInput,
        conversation,
        currentDraft: {
          source,
          taskName: String(currentDraft.taskName).trim(),
          taskDescription: String(currentDraft.taskDescription).trim(),
          eta: String(currentDraft.eta).trim(),
          milestones: currentDraft.milestones,
          confirmLabel: "确认，生成任务",
          holdLabel: "再想想，放入灵感池"
        }
      })
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/inspiration/tasks", async (req: AuthedRequest, res, next) => {
  try {
    const source = String(req.body?.source ?? "").trim();
    const taskName = String(req.body?.taskName ?? "").trim();
    const taskDescription = String(req.body?.taskDescription ?? "").trim();
    const eta = String(req.body?.eta ?? "").trim();
    const milestones = Array.isArray(req.body?.milestones) ? req.body.milestones : [];

    if (!source || !taskName || !taskDescription || !eta || milestones.length === 0) {
      res.status(400).json({ message: "invalid task payload" });
      return;
    }

    res.status(201).json(
      await createTaskFromInspiration({
        source,
        taskName,
        taskDescription,
        eta,
        milestones
      }, req.userId)
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/inspiration/hold", async (req: AuthedRequest, res, next) => {
  try {
    const source = String(req.body?.source ?? "").trim();
    const taskName = String(req.body?.taskName ?? "").trim();
    const taskDescription = String(req.body?.taskDescription ?? "").trim();
    const eta = String(req.body?.eta ?? "").trim();
    const milestones = Array.isArray(req.body?.milestones) ? req.body.milestones : [];
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];

    if (!source || !taskName || !taskDescription || !eta || milestones.length === 0) {
      res.status(400).json({ message: "invalid inspiration hold payload" });
      return;
    }

    res.json(await holdInspiration({ source, taskName, taskDescription, milestones, eta, tags }, req.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/inspiration/discard", async (req: AuthedRequest, res, next) => {
  try {
    const source = String(req.body?.source ?? "").trim();
    if (!source) {
      res.status(400).json({ message: "source is required" });
      return;
    }

    res.json(await discardInspiration(source, req.userId));
  } catch (error) {
    next(error);
  }
});

app.get("/api/execution", async (req: AuthedRequest, res, next) => {
  try {
    res.json(await getExecutionView(req.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/execution/analyze", async (req: AuthedRequest, res, next) => {
  try {
    const inputText = String(req.body?.inputText ?? "").trim();
    res.json(await analyzeExecutionInput(inputText, req.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/execution/confirm", async (req: AuthedRequest, res, next) => {
  try {
    const taskId = String(req.body?.taskId ?? "").trim();
    const adjustedIncrease = Number(req.body?.adjustedIncrease ?? 0);
    const maxResultingProgress =
      req.body?.maxResultingProgress === undefined ? undefined : Number(req.body.maxResultingProgress);

    if (!taskId || Number.isNaN(adjustedIncrease) || (maxResultingProgress !== undefined && Number.isNaN(maxResultingProgress))) {
      res.status(400).json({ message: "taskId and adjustedIncrease are required" });
      return;
    }

    res.json(await confirmTaskProgress(taskId, adjustedIncrease, maxResultingProgress, req.userId));
  } catch (error) {
    next(error);
  }
});

app.put("/api/tasks/:taskId", async (req: AuthedRequest, res, next) => {
  try {
    const taskId = String(req.params.taskId ?? "").trim();
    const title = String(req.body?.title ?? "").trim();
    const detail = String(req.body?.detail ?? "").trim();
    const eta = String(req.body?.eta ?? "").trim();
    const ownerNote = String(req.body?.ownerNote ?? "").trim();
    const milestones = Array.isArray(req.body?.milestones) ? req.body.milestones : [];

    if (!taskId || !title || !detail || !eta || milestones.length === 0) {
      res.status(400).json({ message: "invalid task update payload" });
      return;
    }

    res.json(await updateTaskDetails(taskId, { title, detail, eta, ownerNote, milestones }, req.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks/:taskId/return-to-inspiration", async (req: AuthedRequest, res, next) => {
  try {
    const taskId = String(req.params.taskId ?? "").trim();

    if (!taskId) {
      res.status(400).json({ message: "taskId is required" });
      return;
    }

    res.json(await returnTaskToInspiration(taskId, req.userId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks/:taskId/complete", async (req: AuthedRequest, res, next) => {
  try {
    const taskId = String(req.params.taskId ?? "").trim();
    const reflection = String(req.body?.reflection ?? "").trim();

    if (!taskId) {
      res.status(400).json({ message: "taskId is required" });
      return;
    }

    res.json(await completeTask(taskId, reflection, req.userId));
  } catch (error) {
    next(error);
  }
});

app.get("/api/honor", async (req: AuthedRequest, res, next) => {
  try {
    res.json(await getAchievementView(req.userId));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Internal server error";
  const statusCode =
    message === "Task not found"
      ? 404
      : message === "User not found"
        ? 404
        : message === "Unauthorized" || message === "Invalid token" || message === "Token expired"
          ? 401
          : message === "Milestone weights must sum to 100" ||
              message === "Email and password are required" ||
              message === "Password must be at least 6 characters" ||
              message === "Email already registered" ||
              message === "Invalid email or password"
            ? 400
            : 500;
  res.status(statusCode).json({ message });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
