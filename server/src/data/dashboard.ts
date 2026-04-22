export const dashboardData = {
  brand: {
    title: "事成",
    subtitle: "DoneIt"
  },
  inspiration: {
    title: "灵感中心",
    subtitle: "存放混沌想法，交给 AI 拆成可执行里程碑，再推送回执行中心。",
    pullTabLabel: "打开气泡池",
    quickCapturePlaceholder: "记下任何转瞬即逝的想法，AI 会先帮你整理成可推进的方向。",
    bubbles: [
      {
        id: "bubble-1",
        title: "做一个让碎碎念也能推进任务的输入系统",
        energy: "high",
        tags: ["输入", "AI"],
        state: "fresh"
      },
      {
        id: "bubble-2",
        title: "里程碑完成时触发细小烟花",
        energy: "medium",
        tags: ["动效", "奖励"],
        state: "processing"
      },
      {
        id: "bubble-3",
        title: "让长期努力变成一片星云",
        energy: "high",
        tags: ["成就", "长期反馈"],
        state: "fresh"
      },
      {
        id: "bubble-4",
        title: "把语音碎碎念映射到已有任务节点",
        energy: "medium",
        tags: ["语义识别"],
        state: "fresh"
      },
      {
        id: "bubble-5",
        title: "三天未推进的任务自动衰减提醒",
        energy: "low",
        tags: ["预警", "任务腐烂"],
        state: "queued"
      }
    ],
    decompositionPreview: {
      taskName: "碎碎念映射任务系统",
      taskDescription: "把用户的随手记录和语音碎碎念自动识别为任务推进，并映射到已有里程碑。",
      milestones: [
        {
          id: "m1",
          title: "定义输入格式与语义匹配规则",
          weight: 20
        },
        {
          id: "m2",
          title: "拆分默认 5 个里程碑",
          weight: 20
        },
        {
          id: "m3",
          title: "支持 AI 给出推进建议",
          weight: 20
        },
        {
          id: "m4",
          title: "支持用户确认后转入执行中心",
          weight: 20
        },
        {
          id: "m5",
          title: "补充完成后的反馈动画",
          weight: 20
        }
      ],
      eta: "2026-04-28",
      confirmLabel: "确认，生成任务",
      holdLabel: "再想想，放入灵感池"
    }
  },
  execution: {
    title: "执行中心",
    subtitle: "今天就把事情往前推一点。输入一次，确认一次，立刻看到进展。",
    omniInput: {
      placeholder: "今天做了什么？直接写，AI 会帮你匹配到正在进行的任务。"
    },
    dailyEnergy: 68,
    hintBubble: {
      text: "有新想法？去灵感中心存一下",
      targetLabel: "前往灵感中心",
      targetPath: "/inspiration"
    },
    activeTasks: [
      {
        id: "task-1",
        label: "活跃任务",
        title: "输入闭环 MVP",
        detail: "完成碎碎念记录 -> AI 识别 -> 用户确认 -> 进度变更的最小闭环",
        phase: "阶段 04/05",
        progress: 76,
        eta: "预计 2 天后完成",
        ownerNote: "需要继续打磨确认面板的批量推进逻辑。",
        milestoneCount: 5,
        completedMilestones: 3,
        mode: "snap",
        accent: "cyan",
        rotting: false
      },
      {
        id: "task-2",
        label: "活跃任务",
        title: "成就星云体系",
        detail: "把完成项目转成星点与事成报告，形成长期荣誉感",
        phase: "阶段 02/05",
        progress: 34,
        eta: "预计 8 天后完成",
        ownerNote: "优先补齐星云交互和成就卡片展开态。",
        milestoneCount: 5,
        completedMilestones: 1,
        mode: "creep",
        accent: "violet",
        rotting: false
      },
      {
        id: "task-3",
        label: "活跃任务",
        title: "任务腐烂预警",
        detail: "让超过 3 天未提及的任务褪色并轻微抖动，提醒重新关注",
        phase: "阶段 01/04",
        progress: 19,
        eta: "预计 5 天后完成",
        ownerNote: "需要确认腐烂阈值、视觉强度和提醒频率。",
        milestoneCount: 4,
        completedMilestones: 0,
        mode: "creep",
        accent: "violet",
        rotting: true
      }
    ],
    quickStats: [
      {
        id: "focus",
        label: "活跃任务",
        value: "3"
      },
      {
        id: "loop",
        label: "记录闭环",
        value: "30 秒"
      },
      {
        id: "creep",
        label: "微推进",
        value: "+1%~3%"
      }
    ],
    confirmPanel: {
      title: "AI 今日进度确认",
      inputSummary: "AI 已根据今天的输入扫描所有活跃任务，请逐一确认是否推进。",
      items: [
        {
          taskId: "task-1",
          taskName: "输入闭环 MVP",
          suggestionType: "里程碑吸附",
          suggestionReason: "检测到确认面板和输入解析结构已完成。",
          suggestedIncrease: 14,
          adjustedIncrease: 11,
          resultingProgress: 87,
          milestoneHit: "命中里程碑 4 / 5",
          cta: "确认推进"
        },
        {
          taskId: "task-2",
          taskName: "成就星云体系",
          suggestionType: "微推进",
          suggestionReason: "今天有星云布局讨论，但还未完成关键节点。",
          suggestedIncrease: 3,
          adjustedIncrease: 2,
          resultingProgress: 36,
          milestoneHit: "未命中里程碑，记录努力值",
          cta: "确认推进"
        },
        {
          taskId: "task-3",
          taskName: "任务腐烂预警",
          suggestionType: "保持不变",
          suggestionReason: "今天未检测到与该任务直接相关的实质进展。",
          suggestedIncrease: 0,
          adjustedIncrease: 0,
          resultingProgress: 19,
          milestoneHit: "等待下一次推进",
          cta: "暂不推进"
        }
      ]
    }
  },
  achievement: {
    title: "成就中心",
    subtitle: "完成过的每件事，都会在你的夜空里留下一个发光坐标。",
    summary: {
      totalStars: 18,
      completedProjects: 7,
      longestRun: "12 天"
    },
    goalMatrix: [
      {
        id: "goal-1",
        name: "输入闭环 MVP",
        status: "active",
        progress: 87,
        lastRecordDays: 0,
        milestones: ["记录", "识别", "匹配", "确认", "推进"]
      },
      {
        id: "goal-2",
        name: "成就星云体系",
        status: "active",
        progress: 34,
        lastRecordDays: 1,
        milestones: ["星点", "轨迹", "报告", "特效", "归档"]
      },
      {
        id: "goal-3",
        name: "任务腐烂预警",
        status: "rotting",
        progress: 19,
        lastRecordDays: 4,
        milestones: ["检测", "褪色", "抖动", "提醒"]
      },
      {
        id: "goal-4",
        name: "灵感池转任务",
        status: "archived",
        progress: 100,
        lastRecordDays: 0,
        milestones: ["捕获", "拆解", "确认", "推送", "完成"]
      }
    ],
    nebula: {
      headline: "Success Nebula",
      description: "每个完成项目都会诞生一颗恒星。颜色、大小和亮度映射了投入时长与完成难度。",
      stars: [
        {
          id: "star-1",
          name: "灵感池转任务",
          x: "18%",
          y: "38%",
          size: 18,
          family: "cyan",
          report: "AI 认为这是高频闭环任务，显著降低了记录门槛。"
        },
        {
          id: "star-2",
          name: "视觉反馈烟花",
          x: "42%",
          y: "24%",
          size: 14,
          family: "violet",
          report: "成功反馈有效缩短了努力到奖励之间的心理距离。"
        },
        {
          id: "star-3",
          name: "语义匹配引擎",
          x: "68%",
          y: "34%",
          size: 20,
          family: "cyan",
          report: "该项目让大乱炖输入具备了可量化进度价值。"
        },
        {
          id: "star-4",
          name: "专注任务矩阵",
          x: "56%",
          y: "68%",
          size: 12,
          family: "violet",
          report: "3 个活跃任务上限显著减轻了决策负担。"
        },
        {
          id: "star-5",
          name: "任务腐烂预警",
          x: "28%",
          y: "72%",
          size: 10,
          family: "cyan",
          report: "衰减视觉提醒提升了用户重新接管任务的概率。"
        }
      ]
    }
  }
};

export type DashboardData = typeof dashboardData;
