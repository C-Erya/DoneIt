import { FormEvent, useEffect, useState } from "react";
import { CircleHelp, Lightbulb, Settings, Sparkles, Target } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import type { AuthUser } from "../types";

const navItems = [
  { to: "/", label: "执行中心", end: true, Icon: Target },
  { to: "/inspiration", label: "灵感中心", Icon: Lightbulb },
  { to: "/honor", label: "荣誉中心", Icon: Sparkles }
];

type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "doneit_theme_mode";

export function AppLayout() {
  const { data } = useApi(api.getOverview);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    void api
      .getCurrentUser()
      .then((response) => setAuthUser(response.user))
      .catch(() => setAuthUser(null));
  }, []);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthPending(true);
    setAuthError(null);

    try {
      const response =
        authMode === "login"
          ? await api.login({ email, password })
          : await api.register({ email, password, nickname });

      api.setStoredAuthToken(response.token);
      setAuthUser(response.user);
      setShowAuthDialog(false);
      setEmail("");
      setPassword("");
      setNickname("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setAuthPending(false);
    }
  };

  const logout = () => {
    api.clearStoredAuthToken();
    setAuthUser(null);
    setShowAuthDialog(false);
    setEmail("");
    setPassword("");
    setNickname("");
    setAuthError(null);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-title">{data?.brand.title ?? "任务星图"}</div>
          <div className="brand-subtitle">{data?.brand.subtitle ?? "DoneIt"}</div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              <item.Icon className="nav-icon" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-tools">
          <button type="button" className="tool-link" onClick={() => setShowHelpDialog(true)}>
            <CircleHelp className="tool-icon" />
            <span>帮助</span>
          </button>
        </div>
      </aside>

      <main className="page-frame">
        <div className="top-actions">
          <button type="button" className="top-action-button top-action-secondary" onClick={() => setShowSettingsDialog(true)}>
            <Settings className="tool-icon" />
            <span>设置</span>
          </button>
          <button type="button" className="top-action-button top-action-primary" onClick={() => setShowAuthDialog(true)}>
            <span>{authUser ? authUser.nickname || authUser.email : "登录"}</span>
          </button>
        </div>
        <Outlet />

        {showHelpDialog ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowHelpDialog(false)}>
            <section className="panel help-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="panel-close" aria-label="关闭帮助" onClick={() => setShowHelpDialog(false)}>
                x
              </button>
              <div className="panel-label">帮助</div>
              <div className="help-dialog-body">
                <div className="help-section">
                  <h3>执行中心</h3>
                  <p className="muted">在这里和 AI 对话记录今日进展，点击“AI 拆解今日进度”后在右侧面板逐项确认推进。</p>
                  <p className="muted">下方任务卡可查看详情与日志，必要时可编辑或回退到灵感池。</p>
                </div>
                <div className="help-section">
                  <h3>灵感中心</h3>
                  <p className="muted">输入新的灵感，点击“AI 拆解灵感”生成任务草稿；也可以继续补充，让 AI 重新生成里程碑与计划。</p>
                  <p className="muted">下方灵感池保存未转成任务的想法，点击气泡可继续完善。</p>
                </div>
                <div className="help-section">
                  <h3>荣誉中心</h3>
                  <p className="muted">上方星云展示进行中与已完成任务，点击星星可查看任务信息、里程碑完成时间与完成心得。</p>
                  <p className="muted">下方列表快速浏览任务名称与进度，并与星云联动定位。</p>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {showSettingsDialog ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowSettingsDialog(false)}>
            <section className="panel settings-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="panel-close" aria-label="关闭设置" onClick={() => setShowSettingsDialog(false)}>
                x
              </button>
              <div className="panel-label">设置</div>
              <div className="settings-dialog-body">
                <div className="settings-row">
                  <div className="settings-row-title">主题</div>
                  <div className="settings-row-subtitle muted">默认深色，可切换为浅色。</div>
                </div>
                <div className="settings-choice-row" role="radiogroup" aria-label="主题选择">
                  <button
                    type="button"
                    className={themeMode === "dark" ? "choice-pill choice-pill-active" : "choice-pill"}
                    onClick={() => setThemeMode("dark")}
                    aria-pressed={themeMode === "dark"}
                  >
                    深色
                  </button>
                  <button
                    type="button"
                    className={themeMode === "light" ? "choice-pill choice-pill-active" : "choice-pill"}
                    onClick={() => setThemeMode("light")}
                    aria-pressed={themeMode === "light"}
                  >
                    浅色
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {showAuthDialog ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowAuthDialog(false)}>
            <section className="panel auth-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="panel-close" aria-label="关闭账号面板" onClick={() => setShowAuthDialog(false)}>
                x
              </button>
              <div className="panel-label">{authUser ? "账号信息" : authMode === "login" ? "登录账号" : "注册账号"}</div>

              {authUser ? (
                <div className="auth-dialog-body">
                  <div className="detail-block">
                    <span className="detail-label">邮箱</span>
                    <strong>{authUser.email}</strong>
                  </div>
                  <div className="detail-block">
                    <span className="detail-label">昵称</span>
                    <strong>{authUser.nickname || "未设置"}</strong>
                  </div>
                  <div className="detail-block">
                    <span className="detail-label">模式</span>
                    <strong>{authUser.isDemo ? "Demo 用户" : "正式用户"}</strong>
                  </div>
                  <div className="inspiration-panel-actions">
                    <button className="cta-button cta-button-compact" type="button" onClick={logout}>
                      退出登录
                    </button>
                  </div>
                </div>
              ) : (
                <form className="auth-dialog-body" onSubmit={submitAuth}>
                  {authMode === "register" ? (
                    <label className="field-label">
                      昵称
                      <input className="field-input" value={nickname} onChange={(event) => setNickname(event.target.value)} />
                    </label>
                  ) : null}
                  <label className="field-label">
                    邮箱
                    <input className="field-input" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                  <label className="field-label">
                    密码
                    <input
                      className="field-input"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  {authError ? <div className="auth-error">{authError}</div> : null}
                  <div className="inspiration-panel-actions">
                    <button className="cta-button cta-button-compact" type="submit" disabled={authPending}>
                      {authPending ? "处理中..." : authMode === "login" ? "登录" : "注册"}
                    </button>
                    <button
                      className="tool-link tool-link-inline tool-link-accent"
                      type="button"
                      onClick={() => {
                        setAuthMode(authMode === "login" ? "register" : "login");
                        setAuthError(null);
                      }}
                    >
                      {authMode === "login" ? "去注册" : "去登录"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
