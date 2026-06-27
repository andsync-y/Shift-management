import { requireAdmin } from "@/lib/auth";
import DocumentUploader from "./DocumentUploader";

// 店舗書類（カウンセリングシート・回数券規約）の管理。受付タブレットから印刷する。
export default async function DocumentsPage() {
  await requireAdmin();
  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>Documents</h1>
          <p className="sub">店舗書類（受付タブレットから印刷）</p>
        </div>
      </div>

      <p className="help" style={{ marginTop: 0, marginBottom: 18 }}>
        PDF か画像をアップロードすると、受付タブレット（キオスク）の「📄 カウンセリングシート」「📄 回数券 規約」
        ボタンから全画面表示＆印刷できます。更新は同じ場所にアップロードで差し替え（URLは変わりません）。
      </p>

      <DocumentUploader type="counseling" label="カウンセリングシート" />
      <DocumentUploader type="ticket" label="回数券 規約" />
    </div>
  );
}
