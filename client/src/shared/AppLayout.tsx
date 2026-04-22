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

export function AppLayout() {
  const { data } = useApi(api.getOverview);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);

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
          <button type="button" className="tool-link">
            <CircleHelp className="tool-icon" />
            <span>帮助</span>
          </button>
        </div>
      </aside>

      <main className="page-frame">
        <div className="top-actions">
          <button type="button" className="top-action-button top-action-secondary">
            <Settings className="tool-icon" />
            <span>设置</span>
          </button>
          <button type="button" className="top-action-button top-action-primary" onClick={() => setShowAuthDialog(true)}>
            <span>{authUser ? authUser.nickname || authUser.email : "登录"}</span>
          </button>
        </div>
        <Outlet />

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
