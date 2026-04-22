type PageStateProps = {
  loading: boolean;
  error: string | null;
};

export function PageState({ loading, error }: PageStateProps) {
  if (loading) {
    return <div className="state-panel">正在同步神经界面数据...</div>;
  }

  if (error) {
    return <div className="state-panel">接口加载失败: {error}</div>;
  }

  return null;
}
