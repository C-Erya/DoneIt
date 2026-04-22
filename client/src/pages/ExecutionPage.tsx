import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { PageState } from "../shared/PageState";
import type { ExecutionConfirmPanel, ExecutionResponse } from "../types";

type EditableMilestone = {
  id: string;
  title: string;
  weight: number;
};

type EditableConfirmItem = ExecutionConfirmPanel["items"][number] & {
  originalProgress: number;
};

type TaskDraft = {
  title: string;
  detail: string;
  eta: string;
  ownerNote: string;
  milestones: EditableMilestone[];
  progressLogs: ExecutionResponse["activeTasks"][number]["progressLogs"];
};

function toDateInputValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function buildEditableConfirmPanel(panel: ExecutionConfirmPanel): ExecutionConfirmPanel {
  return {
    ...panel,
    items: panel.items.map((item) => ({
      ...item,
      originalProgress: Math.max(0, item.resultingProgress - item.adjustedIncrease)
    })) as EditableConfirmItem[]
  };
}

function buildTaskDraft(task: ExecutionResponse["activeTasks"][number]): TaskDraft {
  return {
    title: task.title,
    detail: task.detail,
    eta: toDateInputValue(task.eta),
    ownerNote: task.ownerNote,
    milestones: task.milestones,
    progressLogs: task.progressLogs
  };
}

function getCompletedMilestoneCount(task?: ExecutionResponse["activeTasks"][number]) {
  if (!task) {
    return 0;
  }

  return task.milestones.reduce((count, _milestone, index) => {
    const threshold = task.milestones.slice(0, index + 1).reduce((sum, item) => sum + item.weight, 0);
    return task.progress >= threshold ? count + 1 : count;
  }, 0);
}

export function ExecutionPage() {
  const { data, loading, error } = useApi(api.getExecution);
  const [viewData, setViewData] = useState<ExecutionResponse | null>(null);
  const [showConfirmPanel, setShowConfirmPanel] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [inputText, setInputText] = useState("");
  const [confirmPanel, setConfirmPanel] = useState<ExecutionConfirmPanel | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [completionTaskId, setCompletionTaskId] = useState<string | null>(null);
  const [reflectionText, setReflectionText] = useState("");
  const [taskDraft, setTaskDraft] = useState<TaskDraft>({
    title: "",
    detail: "",
    eta: "",
    ownerNote: "",
    milestones: [],
    progressLogs: []
  });

  useEffect(() => {
    if (data) {
      setViewData(data);
      setConfirmPanel(buildEditableConfirmPanel(data.confirmPanel));
    }
  }, [data]);

  useEffect(() => {
    const handleAuthChanged = () => {
      setViewData(null);
      setConfirmPanel(null);
      setSelectedTaskId(null);
      setCompletionTaskId(null);
      setShowConfirmPanel(false);
      setActionStatus(null);
    };

    window.addEventListener(api.authChangedEvent, handleAuthChanged);
    return () => window.removeEventListener(api.authChangedEvent, handleAuthChanged);
  }, []);

  const currentData = viewData ?? data;
  const selectedTask = currentData?.activeTasks.find((task) => task.id === selectedTaskId);
  const completionTask = currentData?.activeTasks.find((task) => task.id === completionTaskId);
  const selectedTaskCompletedMilestones = getCompletedMilestoneCount(selectedTask);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    setTaskDraft(buildTaskDraft(selectedTask));
    setIsEditingTask(false);
  }, [selectedTask]);

  const milestoneTotalWeight = taskDraft.milestones.reduce((sum, item) => sum + item.weight, 0);

  const refreshExecution = async () => {
    const nextData = await api.getExecution();
    setViewData(nextData);
    setConfirmPanel(buildEditableConfirmPanel(nextData.confirmPanel));
  };

  const updateConfirmItem = (taskId: string, nextIncrease: number) => {
    setConfirmPanel((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) => {
          if (item.taskId !== taskId) {
            return item;
          }

          const editable = item as EditableConfirmItem;
          const baseProgress =
            typeof editable.originalProgress === "number"
              ? editable.originalProgress
              : Math.max(0, item.resultingProgress - item.adjustedIncrease);
          const stageMaxProgress = item.stageMaxProgress ?? 100;
          const resultingProgress = Math.max(0, Math.min(stageMaxProgress, baseProgress + nextIncrease));

          return {
            ...item,
            adjustedIncrease: resultingProgress - baseProgress,
            resultingProgress,
            originalProgress: baseProgress
          } satisfies EditableConfirmItem;
        })
      };
    });
  };

  const analyzeProgress = async () => {
    setActionStatus("AI 正在分析今日进度...");
    const panel = await api.analyzeExecution(inputText);
    setConfirmPanel(buildEditableConfirmPanel(panel));
    setShowConfirmPanel(true);
    setActionStatus(null);
  };

  const confirmProgress = async (taskId: string) => {
    const item = confirmPanel?.items.find((entry) => entry.taskId === taskId);
    if (!item) {
      return;
    }

    setActionStatus("正在确认推进...");
    await api.confirmExecutionTask(taskId, item.adjustedIncrease, item.stageMaxProgress);
    setConfirmPanel((current) => {
      if (!current) {
        return current;
      }

      const nextItems = current.items.filter((entry) => entry.taskId !== taskId);
      setShowConfirmPanel(nextItems.length > 0);
      return {
        ...current,
        items: nextItems
      };
    });

    setViewData(await api.getExecution());

    if (item.resultingProgress >= 100) {
      setCompletionTaskId(taskId);
      setReflectionText("");
      setActionStatus("任务已完成，请记录完成心得。");
      return;
    }

    setActionStatus("进度已确认。");
  };

  const saveCompletionReflection = async () => {
    if (!completionTaskId) {
      return;
    }

    setActionStatus("正在保存完成心得...");
    await api.completeTask(completionTaskId, reflectionText);
    await refreshExecution();
    setCompletionTaskId(null);
    setReflectionText("");
    setActionStatus("任务已保存到成就中心。");
  };

  const saveTask = async () => {
    if (!selectedTask) {
      return;
    }

    setActionStatus("正在保存任务...");
    await api.updateTask(selectedTask.id, {
      title: taskDraft.title,
      detail: taskDraft.detail,
      eta: taskDraft.eta,
      ownerNote: taskDraft.ownerNote,
      milestones: taskDraft.milestones
    });
    await refreshExecution();
    setSelectedTaskId(null);
    setIsEditingTask(false);
    setActionStatus("任务已保存。");
  };

  const returnTask = async () => {
    if (!selectedTask) {
      return;
    }

    setActionStatus("正在回退到灵感池...");
    await api.returnTaskToInspiration(selectedTask.id);
    await refreshExecution();
    setSelectedTaskId(null);
    setIsEditingTask(false);
    setActionStatus("任务已回退到灵感池。");
  };

  const returnToDetail = () => {
    if (!selectedTask) {
      return;
    }

    setTaskDraft(buildTaskDraft(selectedTask));
    setIsEditingTask(false);
  };

  const updateMilestone = (milestoneId: string, key: "title" | "weight", value: string) => {
    setTaskDraft((current) => ({
      ...current,
      milestones: current.milestones.map((item) =>
        item.id === milestoneId ? { ...item, [key]: key === "weight" ? Number(value) || 0 : value } : item
      )
    }));
  };

  const removeMilestone = (milestoneId: string) => {
    setTaskDraft((current) => ({
      ...current,
      milestones: current.milestones.filter((item) => item.id !== milestoneId)
    }));
  };

  const addMilestone = () => {
    setTaskDraft((current) => ({
      ...current,
      milestones: [...current.milestones, { id: `m${Date.now()}`, title: "新的里程碑", weight: 10 }]
    }));
  };

  const taskSlots = 6;
  const activeTasks = currentData?.activeTasks ?? [];
  const emptySlots = Math.max(0, taskSlots - activeTasks.length);

  if (!currentData) {
    return <PageState loading={loading} error={error} />;
  }

  return (
    <section className="page execution-page">
      <div className={showConfirmPanel ? "execution-main-grid" : "execution-main-grid execution-main-grid-plain"}>
        <div className="execution-main-column">
          <div className="hint-bubble-row hint-bubble-row-featured">
            <div className="hint-bubble">{currentData.hintBubble.text}</div>
            <Link to={currentData.hintBubble.targetPath} className="hint-link">
              {currentData.hintBubble.targetLabel}
            </Link>
          </div>

          <article className="panel omni-prd-panel clean-input-panel">
            <textarea
              className="omni-input"
              placeholder={currentData.omniInput.placeholder}
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              rows={4}
            />
            <div className="input-action-row">
              <span className="input-hint">写下今天推进了什么，AI 会逐个任务拆解可确认的进度。</span>
              <button className="cta-button cta-button-compact" type="button" onClick={analyzeProgress}>
                AI 拆解今日进度
              </button>
            </div>
            {actionStatus ? <span className="input-hint">{actionStatus}</span> : null}
          </article>

          <div className="card-grid execution-task-grid">
            {activeTasks.map((task) => {
              const segmentWidth = 100 / task.milestoneCount;

              return (
                <button
                  type="button"
                  key={task.id}
                  className={`panel task-card accent-${task.accent} ${task.rotting ? "task-rotting" : ""}`}
                  onClick={() => {
                    setSelectedTaskId(task.id);
                    setIsEditingTask(false);
                  }}
                >
                  <div className="task-card-topline">
                    <span className="panel-label">{task.label}</span>
                    <span className="task-eta">{task.eta}</span>
                  </div>
                  <h3>{task.title}</h3>
                  <p className="muted task-detail">{task.detail}</p>
                  <div className="task-progress-line">
                    <span>进度</span>
                    <strong>{task.progress}%</strong>
                  </div>
                  <div className="segmented-bar">
                    {Array.from({ length: task.milestoneCount }).map((_, index) => {
                      const filled = index < task.completedMilestones;
                      const inProgress = !filled && index === task.completedMilestones;
                      return (
                        <div
                          key={`${task.id}-${index}`}
                          className={`segment ${filled ? "segment-filled" : inProgress ? "segment-fluid" : ""}`}
                          style={{ width: `${segmentWidth}%` }}
                        />
                      );
                    })}
                  </div>
                  <div className="task-meta">
                    <span>{task.phase}</span>
                    <span>{task.mode === "snap" ? "集中推进" : "持续推进"}</span>
                  </div>
                </button>
              );
            })}

            {Array.from({ length: emptySlots }).map((_, index) => (
              <div
                key={`execution-empty-slot-${index}`}
                className="panel task-card task-card-placeholder"
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        {showConfirmPanel ? (
          <aside className="panel confirm-side-panel">
            <button
              type="button"
              className="panel-close"
              aria-label="关闭进度确认面板"
              onClick={() => setShowConfirmPanel(false)}
            >
              ×
            </button>
            <div className="panel-label">{confirmPanel?.title}</div>
            <p className="muted">{confirmPanel?.inputSummary}</p>

            <div className="confirm-task-list">
              {confirmPanel?.items.map((item) => {
                const editable = item as EditableConfirmItem;
                const originalProgress =
                  typeof editable.originalProgress === "number"
                    ? editable.originalProgress
                    : Math.max(0, item.resultingProgress - item.adjustedIncrease);
                const minIncrease = -originalProgress;
                const maxIncrease = Math.max(0, item.stageMaxProgress - originalProgress);

                return (
                  <div key={item.taskId} className="confirm-task-item">
                    <div className="confirm-task-head">
                      <h3>{item.taskName}</h3>
                      <span>{item.suggestionType}</span>
                    </div>
                    <p className="muted">{item.suggestionReason}</p>
                    <div className="confirm-metrics confirm-metrics-row">
                      <div className="confirm-card">
                        <span>AI 建议增量</span>
                        <strong>+{item.suggestedIncrease}%</strong>
                      </div>
                      <label className="confirm-card confirm-card-editable">
                        <span>调整增量</span>
                        <input
                          className="field-input confirm-number-input"
                          type="number"
                          min={minIncrease}
                          max={maxIncrease}
                          value={item.adjustedIncrease}
                          onChange={(event) => updateConfirmItem(item.taskId, Number(event.target.value) || 0)}
                        />
                      </label>
                      <div className="confirm-card">
                        <span>确认后进度</span>
                        <strong>{item.resultingProgress}%</strong>
                      </div>
                    </div>
                    <div className="confirm-slider-block">
                      <div className="slider-track slider-track-wide">
                        <div className="slider-progress" style={{ width: `${item.resultingProgress}%` }} />
                        <div className="slider-thumb slider-cyan" style={{ left: `${item.resultingProgress}%` }} />
                      </div>
                      <div className="task-meta">
                        <span>{item.milestoneHit.includes("%") ? item.milestoneHit : `${item.milestoneHit} (${item.stageMaxProgress}%)`}</span>
                        <button className="cta-button cta-button-mini" type="button" onClick={() => confirmProgress(item.taskId)}>
                          {item.cta}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>

      {selectedTask ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedTaskId(null)}>
          <section
            className="panel task-detail-modal task-detail-modal-wide"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="panel-close" aria-label="关闭任务详情" onClick={() => setSelectedTaskId(null)}>
              ×
            </button>
            <div className="panel-label">{isEditingTask ? "任务编辑 / 可修改" : "任务详情 / 只读"}</div>
            <div className="task-detail-modal-grid">
              <div className="task-detail-main-column">
                <div className="task-detail-section">
                  <div className="panel-label">基本信息</div>
                  {isEditingTask ? (
                    <>
                      <label className="field-label">
                        任务名称
                        <input
                          className="field-input"
                          value={taskDraft.title}
                          onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                        />
                      </label>
                      <label className="field-label">
                        任务描述
                        <textarea
                          className="field-textarea"
                          value={taskDraft.detail}
                          onChange={(event) => setTaskDraft((current) => ({ ...current, detail: event.target.value }))}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="detail-block">
                        <span className="detail-label">任务名称</span>
                        <strong>{selectedTask.title}</strong>
                      </div>
                      <div className="detail-block">
                        <span className="detail-label">任务描述</span>
                        <p className="detail-copy">{selectedTask.detail}</p>
                      </div>
                    </>
                  )}
                </div>

                <div className={isEditingTask ? "field-label" : "task-detail-section"}>
                  <span className="panel-label">里程碑设置</span>
                  <div className="milestone-editor-list milestone-check-list">
                    {taskDraft.milestones.map((milestone, index) =>
                      isEditingTask ? (
                        <div key={milestone.id} className="milestone-editor-row milestone-editor-row-static">
                          <span
                            className={`milestone-check ${
                              index < selectedTaskCompletedMilestones ? "milestone-check-completed" : ""
                            }`}
                            aria-hidden="true"
                          >
                            {index < selectedTaskCompletedMilestones ? "✓" : ""}
                          </span>
                          <input
                            className="field-input milestone-title-input"
                            value={milestone.title}
                            onChange={(event) => updateMilestone(milestone.id, "title", event.target.value)}
                          />
                          <input
                            className="field-input milestone-weight-input"
                            type="number"
                            min="0"
                            max="100"
                            value={milestone.weight}
                            onChange={(event) => updateMilestone(milestone.id, "weight", event.target.value)}
                          />
                          <span className="milestone-weight-suffix">%</span>
                          <button
                            type="button"
                            className="mini-icon-button"
                            onClick={() => removeMilestone(milestone.id)}
                            aria-label="Delete milestone"
                          >
                            x
                          </button>
                        </div>
                      ) : (
                        <div key={milestone.id} className="milestone-display-row">
                          <span
                            className={`milestone-check ${
                              index < selectedTaskCompletedMilestones ? "milestone-check-completed" : ""
                            }`}
                            aria-hidden="true"
                          >
                            {index < selectedTaskCompletedMilestones ? "✓" : ""}
                          </span>
                          <span className="milestone-display-title">{milestone.title}</span>
                          <span className="milestone-display-weight">{milestone.weight}%</span>
                        </div>
                      )
                    )}
                    {isEditingTask ? (
                      <div className={`milestone-total ${milestoneTotalWeight === 100 ? "milestone-total-valid" : "milestone-total-invalid"}`}>
                        <span>当前总占比 {milestoneTotalWeight}%</span>
                        <span>所有里程碑加起来需要是 100%</span>
                      </div>
                    ) : null}
                    {isEditingTask ? (
                      <button type="button" className="tool-link add-milestone-button" onClick={addMilestone}>
                        添加里程碑
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditingTask ? (
                  <>
                    <label className="field-label">
                      预计完成时间
                      <input
                        className="field-input"
                        type="date"
                        value={taskDraft.eta}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, eta: event.target.value }))}
                      />
                    </label>
                    <label className="field-label">
                      备注
                      <textarea
                        className="field-textarea"
                        value={taskDraft.ownerNote}
                        onChange={(event) => setTaskDraft((current) => ({ ...current, ownerNote: event.target.value }))}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <div className="detail-block">
                      <span className="detail-label">预计完成时间</span>
                      <strong>{selectedTask.eta}</strong>
                    </div>
                    <div className="detail-block">
                      <span className="detail-label">备注</span>
                      <p className="detail-copy">{selectedTask.ownerNote || "暂无备注"}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="task-detail-log-column">
                <div className="task-detail-section">
                  <div className="panel-label">推进日志</div>
                  <div className="task-log-list">
                    {taskDraft.progressLogs.length > 0 ? (
                      taskDraft.progressLogs.map((log) => (
                        <article key={log.id} className="task-log-card">
                          <div className="task-log-head">
                            <strong>{new Date(log.date).toLocaleDateString("zh-CN")}</strong>
                            <span>+{log.increase}%</span>
                          </div>
                          <p className="muted">{log.summary}</p>
                          <div className="task-meta">
                            <span>{log.progressBefore}%</span>
                            <span>{log.progressAfter}%</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="task-log-empty muted">还没有推进日志，确认进度后会出现在这里。</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              {isEditingTask ? (
                <>
                  <button className="tool-link" type="button" onClick={returnToDetail}>
                    返回详情
                  </button>
                  <button className="cta-button cta-button-compact" type="button" onClick={saveTask}>
                    保存
                  </button>
                </>
              ) : (
                <>
                  <button className="tool-link" type="button" onClick={returnTask}>
                    回退到灵感
                  </button>
                  <button className="cta-button cta-button-compact" type="button" onClick={() => setIsEditingTask(true)}>
                    编辑
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {completionTask ? (
        <div className="modal-backdrop completion-backdrop" role="presentation">
          <div className="completion-fireworks" aria-hidden="true">
            <span className="firework firework-a" />
            <span className="firework firework-b" />
            <span className="firework firework-c" />
            <span className="completion-star-core">★</span>
          </div>
          <section className="panel completion-modal" role="dialog" aria-modal="true">
            <div className="panel-label">任务完成</div>
            <h3>{completionTask.title}</h3>
            <p className="muted">记录一下这次完成后的心得，保存后它会进入成就中心。</p>
            <label className="field-label">
              完成心得
              <textarea
                className="field-textarea completion-reflection-input"
                value={reflectionText}
                onChange={(event) => setReflectionText(event.target.value)}
                placeholder="写下这次完成任务的收获、过程或下一步想法..."
              />
            </label>
            <div className="modal-actions">
              <button className="tool-link" type="button" onClick={() => setCompletionTaskId(null)}>
                稍后再写
              </button>
              <button className="cta-button cta-button-compact" type="button" onClick={saveCompletionReflection}>
                保存到成就
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
