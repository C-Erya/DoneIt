import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { PageState } from "../shared/PageState";
import type { InspirationResponse } from "../types";

type EditableMilestone = {
  id: string;
  title: string;
  weight: number;
};

type BubbleStyleVars = CSSProperties & {
  "--bubble-size": string;
  "--bubble-offset-y": string;
  "--bubble-offset-x": string;
  "--bubble-rotate": string;
};

function buildBubbleStyle(
  index: number,
  bubble: InspirationResponse["bubbles"][number],
  bubbles: InspirationResponse["bubbles"]
): BubbleStyleVars {
  const sortedByAge = [...bubbles].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
  const ageRank = Math.max(0, sortedByAge.findIndex((item) => item.id === bubble.id));
  const normalized = bubbles.length <= 1 ? 0 : ageRank / (bubbles.length - 1);
  const size = Math.round(108 - normalized * 34);
  const offsetsY = [-10, 14, -18, 10, -6, 18, -14, 8];
  const offsetsX = [-8, 12, 6, -14, 10, -6, 14, -10];
  const rotations = ["-4deg", "3deg", "-2deg", "4deg", "-3deg", "2deg", "-1deg", "3deg"];

  return {
    "--bubble-size": `${size}px`,
    "--bubble-offset-y": `${offsetsY[index % offsetsY.length]}px`,
    "--bubble-offset-x": `${offsetsX[index % offsetsX.length]}px`,
    "--bubble-rotate": rotations[index % rotations.length]
  };
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

export function InspirationPage() {
  const { data, loading, error } = useApi(api.getInspiration);
  const [viewData, setViewData] = useState<InspirationResponse | null>(null);
  const [panelSource, setPanelSource] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [conversation, setConversation] = useState<string[]>([]);
  const [inputText, setInputText] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [milestones, setMilestones] = useState<EditableMilestone[]>([]);
  const [eta, setEta] = useState("");
  const [draggingMilestoneId, setDraggingMilestoneId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [isAiWorking, setIsAiWorking] = useState(false);

  const currentData = viewData ?? data;
  const isRefining = Boolean(panelSource && activeSource);

  useEffect(() => {
    if (data) {
      setViewData(data);
    }
  }, [data]);

  useEffect(() => {
    const handleAuthChanged = () => {
      setViewData(null);
      setPanelSource(null);
      setActiveSource(null);
      setConversation([]);
      setInputText("");
      setActionStatus(null);
      setIsAiWorking(false);
    };

    window.addEventListener(api.authChangedEvent, handleAuthChanged);
    return () => window.removeEventListener(api.authChangedEvent, handleAuthChanged);
  }, []);

  const bubbleStyles = useMemo(() => {
    if (!currentData) {
      return new Map<string, BubbleStyleVars>();
    }

    return new Map(
      currentData.bubbles.map((bubble, index) => [bubble.id, buildBubbleStyle(index, bubble, currentData.bubbles)])
    );
  }, [currentData]);

  if (!currentData) {
    return <PageState loading={loading} error={error} />;
  }

  const refreshInspiration = async () => {
    setViewData(await api.getInspiration());
  };

  const closePanel = () => {
    setPanelSource(null);
    setActiveSource(null);
    setConversation([]);
    setActionStatus(null);
    setIsAiWorking(false);
  };

  const clearDraftFields = () => {
    setTaskName("");
    setTaskDescription("");
    setMilestones([]);
    setEta("");
  };

  const openSavedBubble = (bubble: InspirationResponse["bubbles"][number]) => {
    setPanelSource(bubble.title);
    setActiveSource(bubble.title);
    setConversation([`原始灵感：${bubble.title}`]);
    setTaskName(bubble.title);
    setTaskDescription(bubble.taskDescription);
    setMilestones(bubble.milestones);
    setEta(bubble.eta || todayDateValue());
    setInputText("");
    setActionStatus("已载入灵感池中的保存内容，可以继续补充。");
  };

  const applyDraft = (draft: {
    taskName: string;
    taskDescription: string;
    milestones: EditableMilestone[];
    eta: string;
  }) => {
    setTaskName(draft.taskName);
    setTaskDescription(draft.taskDescription);
    setMilestones(draft.milestones);
    setEta(draft.eta || todayDateValue());
  };

  const openWithAi = async (source: string) => {
    const trimmedSource = source.trim();
    if (!trimmedSource) {
      setActionStatus("请先写下一个新灵感。");
      return;
    }

    setPanelSource(trimmedSource);
    setActiveSource(trimmedSource);
    setConversation([`原始灵感：${trimmedSource}`]);
    clearDraftFields();
    setIsAiWorking(true);
    setActionStatus("AI 正在拆解灵感...");

    try {
      const draft = await api.decomposeInspiration(trimmedSource);
      applyDraft(draft);
      setInputText("");
      setActionStatus("已生成初版拆解。如果还想补充细节，可以继续在左侧文本框输入。");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "灵感拆解失败");
    } finally {
      setIsAiWorking(false);
    }
  };

  const refineCurrentInspiration = async () => {
    const latestUserInput = inputText.trim();
    if (!activeSource || !panelSource) {
      await openWithAi(latestUserInput);
      return;
    }

    if (!latestUserInput) {
      setActionStatus("请先在文本框写下要补充的新内容。");
      return;
    }

    setActionStatus("AI 正在根据补充内容重新生成拆解...");

    try {
      const nextConversation = [...conversation, `补充：${latestUserInput}`];
      const currentDraft = {
        taskName,
        taskDescription,
        milestones,
        eta
      };
      clearDraftFields();
      setIsAiWorking(true);
      const draft = await api.refineInspiration({
        source: activeSource,
        conversation: nextConversation,
        latestUserInput,
        currentDraft
      });

      applyDraft(draft);
      setConversation(nextConversation);
      setInputText("");
      setActionStatus("已根据补充内容更新拆解结果。");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "补充拆解失败");
    } finally {
      setIsAiWorking(false);
    }
  };

  const handlePrimaryAiAction = () => {
    if (isRefining) {
      void refineCurrentInspiration();
      return;
    }

    void openWithAi(inputText.trim());
  };

  const updateMilestone = (milestoneId: string, key: "title" | "weight", value: string) => {
    setMilestones((current) =>
      current.map((item) =>
        item.id === milestoneId
          ? {
              ...item,
              [key]: key === "weight" ? Number(value) || 0 : value
            }
          : item
      )
    );
  };

  const removeMilestone = (milestoneId: string) => {
    setMilestones((current) => current.filter((item) => item.id !== milestoneId));
  };

  const moveMilestone = (fromIndex: number, toIndex: number) => {
    setMilestones((current) => {
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= current.length) {
        return current;
      }

      const clone = [...current];
      const [item] = clone.splice(fromIndex, 1);
      clone.splice(toIndex, 0, item);
      return clone;
    });
  };

  const handleMilestoneDrop = (targetIndex: number) => {
    if (!draggingMilestoneId) {
      return;
    }

    const sourceIndex = milestones.findIndex((item) => item.id === draggingMilestoneId);
    moveMilestone(sourceIndex, targetIndex);
    setDraggingMilestoneId(null);
  };

  const addMilestone = () => {
    setMilestones((current) => [
      ...current,
      {
        id: `m${Date.now()}`,
        title: "新的里程碑",
        weight: 10
      }
    ]);
  };

  const milestoneTotalWeight = milestones.reduce((sum, item) => sum + item.weight, 0);

  const createTask = async () => {
    if (!panelSource) {
      return;
    }

    setActionStatus("正在生成任务...");

    try {
      await api.createInspirationTask({
        source: panelSource,
        taskName,
        taskDescription,
        milestones,
        eta
      });
      await refreshInspiration();
      setActionStatus("任务已进入执行中心。");
      closePanel();
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "生成任务失败");
    }
  };

  const holdTask = async () => {
    if (!panelSource) {
      return;
    }

    setActionStatus("正在保存到灵感池...");

    try {
      await api.holdInspiration({
        source: panelSource,
        taskName,
        taskDescription,
        milestones,
        eta
      });
      await refreshInspiration();
      setActionStatus("灵感已保存。");
      closePanel();
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "保存灵感失败");
    }
  };

  const discardTask = async () => {
    if (!panelSource) {
      return;
    }

    setActionStatus("正在放弃这个灵感...");

    try {
      await api.discardInspiration(panelSource);
      await refreshInspiration();
      setActionStatus("已放弃这个灵感。");
      closePanel();
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "放弃灵感失败");
    }
  };

  return (
    <section className="page inspiration-page">
      <div className={panelSource ? "inspiration-main-grid" : "inspiration-main-grid inspiration-main-grid-plain"}>
        <div className="inspiration-main-column">
          <div className="hint-bubble-row inspiration-hint-row inspiration-hint-row-featured">
            <div className="hint-bubble inspiration-hint-bubble">
              {isRefining ? "继续补充这个灵感，让 AI 重新整理任务结构" : "在这里记录下你的新灵感"}
            </div>
          </div>

          <article className="panel inspiration-dialog-panel clean-input-panel">
            <textarea
              className="omni-input inspiration-input"
              placeholder={
                isRefining
                  ? "继续补充这个灵感：例如目标人群、限制条件、想要的完成形态..."
                  : currentData.quickCapturePlaceholder
              }
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              rows={4}
            />

            <div className="input-action-row">
              <span className="input-hint">
                {isRefining
                  ? "补充会和原始灵感、已有草稿、历史补充一起交给 AI 重新生成。"
                  : "写下一个想法，AI 会先拆成任务名称、描述、里程碑和预计完成时间。"}
              </span>
              <button
                className="cta-button cta-button-compact"
                type="button"
                onClick={handlePrimaryAiAction}
                disabled={isAiWorking}
              >
                {isRefining ? "对灵感进行补充" : "AI 拆解灵感"}
              </button>
            </div>
          </article>

          <article className="panel spark-cloud-panel inspiration-bubble-panel">
            <div className="spark-cloud spark-cloud-freeform">
              {currentData.bubbles.map((bubble) => (
                <button
                  type="button"
                  key={bubble.id}
                  className={`spark-bubble spark-bubble-freeform bubble-${bubble.state} ${
                    panelSource === bubble.title ? "spark-bubble-active" : ""
                  }`}
                  style={bubbleStyles.get(bubble.id)}
                  onClick={() => openSavedBubble(bubble)}
                >
                  <strong className="spark-bubble-title">{bubble.title}</strong>
                </button>
              ))}
            </div>
          </article>
        </div>

        {panelSource ? (
          <aside className="panel inspiration-side-panel">
            <button type="button" className="panel-close" aria-label="关闭灵感面板" onClick={closePanel}>
              ×
            </button>

            {actionStatus ? (
              <div className={`inspiration-panel-status ${isAiWorking ? "inspiration-panel-status-working" : ""}`}>
                {actionStatus}
              </div>
            ) : null}

            <div className="panel-label">灵感详情 / 编辑</div>
            <p className="muted inspiration-source">原始灵感：{activeSource ?? panelSource}</p>

            {conversation.length > 1 ? (
              <div className="inspiration-conversation">
                <span className="panel-label">补充记录</span>
                {conversation.slice(1).map((item, index) => (
                  <span key={`${item}-${index}`} className="muted">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}

            <label className="field-label">
              任务名称
              <input className="field-input" value={taskName} onChange={(event) => setTaskName(event.target.value)} />
            </label>

            <label className="field-label">
              任务描述
              <textarea
                className="field-textarea"
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
              />
            </label>

            <div className="field-label">
              里程碑设置
              <div className="milestone-editor-list">
                {milestones.map((milestone, index) => (
                  <div
                    key={milestone.id}
                    className={`milestone-editor-row ${
                      draggingMilestoneId === milestone.id ? "milestone-editor-row-dragging" : ""
                    }`}
                    draggable
                    onDragStart={() => setDraggingMilestoneId(milestone.id)}
                    onDragEnd={() => setDraggingMilestoneId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleMilestoneDrop(index)}
                  >
                    <span className="drag-handle" aria-hidden="true">
                      ::
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
                ))}
                <div
                  className={`milestone-total ${
                    milestoneTotalWeight === 100 ? "milestone-total-valid" : "milestone-total-invalid"
                  }`}
                >
                  <span>当前总占比：{milestoneTotalWeight}%</span>
                  <span>所有里程碑加起来需要为 100%</span>
                </div>
                <button type="button" className="tool-link add-milestone-button" onClick={addMilestone}>
                  添加里程碑
                </button>
              </div>
            </div>

            <label className="field-label">
              预计完成时间
              <input className="field-input" type="date" value={eta} onChange={(event) => setEta(event.target.value)} />
            </label>

            <div className="inspiration-panel-actions">
              <button className="cta-button cta-button-compact" type="button" onClick={createTask}>
                {currentData.decompositionPreview.confirmLabel}
              </button>
              <button className="tool-link tool-link-inline tool-link-accent" type="button" onClick={holdTask}>
                {currentData.decompositionPreview.holdLabel}
              </button>
              <button className="tool-link tool-link-inline" type="button" onClick={discardTask}>
                放弃，不太可行
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
