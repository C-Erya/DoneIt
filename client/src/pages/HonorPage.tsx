import { useEffect, useState } from "react";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { PageState } from "../shared/PageState";

function formatDateTime(value?: string) {
  if (!value) {
    return "进行中";
  }

  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMilestoneTime(value?: string) {
  return value ? formatDateTime(value) : "未完成";
}

export function HonorPage() {
  const { data, loading, error } = useApi(api.getHonor);
  const [selectedStarId, setSelectedStarId] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthChanged = () => setSelectedStarId(null);
    window.addEventListener(api.authChangedEvent, handleAuthChanged);

    return () => window.removeEventListener(api.authChangedEvent, handleAuthChanged);
  }, []);

  if (!data) {
    return <PageState loading={loading} error={error} />;
  }

  const selectedStar = data.nebula.stars.find((star) => star.id === selectedStarId);

  return (
    <section className="page achievement-page">
      <article className="panel nebula-panel achievement-nebula-top">
        <div className="nebula-canvas">
          <div className="nebula-haze nebula-haze-cyan" />
          <div className="nebula-haze nebula-haze-violet" />
          {data.nebula.stars.map((star) => {
            const isSelected = star.id === selectedStarId;

            return (
              <button
                key={star.id}
                type="button"
                className={`nebula-star nebula-star-${star.family} ${
                  star.status === "active" ? "nebula-star-dim" : "nebula-star-bright"
                } ${isSelected ? "nebula-star-selected" : ""}`}
                style={{ left: star.x, top: star.y, width: star.size, height: star.size }}
                title={star.name}
                aria-pressed={isSelected}
                onClick={() => setSelectedStarId(star.id)}
              >
                <span className="sr-only">{star.name}</span>
              </button>
            );
          })}
        </div>

        {selectedStar ? (
          <div className="achievement-card achievement-card-detail">
            <button
              type="button"
              className="panel-close"
              aria-label="关闭星星详情"
              onClick={() => setSelectedStarId(null)}
            >
              ×
            </button>
            <strong className={`text-${selectedStar.family}`}>{selectedStar.name}</strong>
            <span>创建时间：{formatDateTime(selectedStar.createdAt)}</span>
            <span>完成时间：{formatDateTime(selectedStar.completedAt)}</span>
            <span>完成心得：{selectedStar.completionReflection || "完成后可记录心得"}</span>

            <div className="achievement-milestone-list">
              {selectedStar.milestones.map((milestone) => (
                <div key={milestone.id} className="achievement-milestone-row">
                  <span>{milestone.title}</span>
                  <span>{formatMilestoneTime(milestone.completedAt)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </article>

      <article className="panel all-tasks-panel">
        <div className="goal-matrix">
          {data.goalMatrix.map((goal) => {
            const isSelected = goal.id === selectedStarId;

            return (
              <button
                key={goal.id}
                type="button"
                className={`goal-card goal-card-compact goal-card-button goal-${goal.status} ${
                  isSelected ? "goal-card-selected" : ""
                }`}
                aria-pressed={isSelected}
                onClick={() => setSelectedStarId(goal.id)}
              >
                <div className="goal-head">
                  <strong>{goal.name}</strong>
                  <span>{goal.progress}%</span>
                </div>
                <div className="goal-progress" aria-label={`${goal.name} 进度 ${goal.progress}%`}>
                  <div style={{ width: `${goal.progress}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </article>
    </section>
  );
}
