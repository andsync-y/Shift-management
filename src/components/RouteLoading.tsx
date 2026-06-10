// ページ遷移・データ取得中に表示する共通ローディング。
export default function RouteLoading() {
  return (
    <div className="route-loading">
      <span className="spinner" aria-hidden />
      <span className="route-loading-text">読み込み中…</span>
    </div>
  );
}
