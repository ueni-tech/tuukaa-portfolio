'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Copy,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
  Key,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  buildClientReportEmail,
  ReportSummary,
  buildEvidenceReportEmail,
  EvidenceSummary,
} from '@/lib/buildClientReportEmail'
import { useSession } from 'next-auth/react'

type TenantInfo = { name: string; key: string }
type FileInfo = {
  filename: string
  file_id: string
  upload_time: string
  chunk_count: number
  file_size: number
}

export default function EmbedAdminApp() {
  const { data: session } = useSession()
  const isPortfolioAccount = session?.user?.role === 'portfolio'
  const [tenants, setTenants] = useState<TenantInfo[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>('')
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [targetUrl, setTargetUrl] = useState<string>('')
  const [loadingTenants, setLoadingTenants] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [generatedKey, setGeneratedKey] = useState<string>('')
  const [openGenerate, setOpenGenerate] = useState(false)
  const [from, setFrom] = useState<string>('2025-01-01')
  const [to, setTo] = useState<string>('2025-01-31')
  const [report, setReport] = useState<ReportSummary | null>(null)
  const [reportHtml, setReportHtml] = useState<string>('')
  const [loadingReport, setLoadingReport] = useState(false)
  const [evidence, setEvidence] = useState<EvidenceSummary | null>(null)
  const [evidenceHtml, setEvidenceHtml] = useState('')

  useEffect(() => {
    const loadTenants = async () => {
      setLoadingTenants(true)
      try {
        const res = await fetch(`/api/embed-admin/tenants`, {
          method: 'GET',
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('テナント一覧の取得に失敗しました')
        const data = await res.json()
        const list = (data?.tenants || []) as TenantInfo[]
        setTenants(list)
        const savedKey =
          typeof window !== 'undefined' ? localStorage.getItem('embed:key') : ''
        const initial = list.find(t => t.key === savedKey) || list[0]
        if (initial) {
          setSelectedTenant(initial.name)
          setSelectedKey(initial.key)
          try {
            localStorage.setItem('embed:key', initial.key)
          } catch {}
        }
      } catch (e: any) {
        toast.error(e?.message || 'テナント一覧の取得に失敗しました')
      } finally {
        setLoadingTenants(false)
      }
    }
    loadTenants()
  }, [])

  // 選択されたキーを常に localStorage と同期
  useEffect(() => {
    if (!selectedKey) return
    try {
      localStorage.setItem('embed:key', selectedKey)
    } catch {}
  }, [selectedKey])

  useEffect(() => {
    const loadFiles = async () => {
      if (!selectedTenant || !selectedKey) {
        setFiles([])
        return
      }
      setLoadingFiles(true)
      try {
        const res = await fetch(`/api/embed-admin/documents`, {
          headers: { 'x-embed-key': selectedKey },
        })
        if (!res.ok) throw new Error('ファイル一覧の取得に失敗しました')
        const data = await res.json()
        setFiles(data?.files || [])
      } catch (e: any) {
        toast.error(e?.message || 'ファイル一覧の取得に失敗しました')
      } finally {
        setLoadingFiles(false)
      }
    }
    loadFiles()
  }, [selectedTenant, selectedKey])

  const onChangeTenant = (name: string) => {
    setSelectedTenant(name)
    const t = tenants.find(t => t.name === name)
    const key = t?.key || ''
    setSelectedKey(key)
    try {
      localStorage.setItem('embed:key', key)
    } catch {}
  }

  const onCopyKey = async () => {
    if (isPortfolioAccount) {
      toast.error('ポートフォリオアカウントではその機能は制限されています')
      return
    }
    try {
      await navigator.clipboard.writeText(selectedKey || '')
      toast.success('埋め込みキーをコピーしました')
    } catch {
      toast.error('コピーに失敗しました')
    }
  }

  const onGenerateKey = () => {
    if (isPortfolioAccount) {
      toast.error('ポートフォリオアカウントではその機能は制限されています')
      return
    }
    try {
      const key =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID().replace(/-/g, '')
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
      setGeneratedKey(key)
      toast.success('新規キーを生成しました。必要に応じてコピーしてください。')
    } catch {
      toast.error('キー生成に失敗しました')
    }
  }

  const onCopyGeneratedKey = async () => {
    if (isPortfolioAccount) {
      toast.error('ポートフォリオアカウントではその機能は制限されています')
      return
    }
    try {
      if (!generatedKey) {
        toast.error('まずはキーを生成してください')
        return
      }
      await navigator.clipboard.writeText(generatedKey)
      toast.success(
        '生成済みキーをコピーしました。`.env` を手動更新してください。'
      )
    } catch {
      toast.error('コピーに失敗しました')
    }
  }

  const onUpload = async () => {
    if (isPortfolioAccount) {
      toast.error('ポートフォリオアカウントではその機能は制限されています')
      return
    }
    if (!selectedTenant || !selectedKey) {
      toast.error('テナントを選択してください')
      return
    }
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      toast.error('ファイルを選択してください')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/embed-admin/upload`, {
        method: 'POST',
        body: fd,
        headers: { 'x-embed-key': selectedKey },
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e?.detail || 'アップロードに失敗しました')
      }
      toast.success('アップロードしました')
      const list = await fetch(`/api/embed-admin/documents`, {
        headers: { 'x-embed-key': selectedKey },
      })
      const data = await list.json()
      setFiles(data?.files || [])
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: any) {
      toast.error(e?.message || 'アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  const onUploadUrl = async () => {
    if (isPortfolioAccount) {
      toast.error('ポートフォリオアカウントではその機能は制限されています')
      return
    }
    if (!selectedTenant || !selectedKey) {
      toast.error('テナントを選択してください')
      return
    }
    setUploading(true)
    try {
      const res = await fetch(`/api/embed-admin/upload/url`, {
        method: 'POST',
        body: JSON.stringify({ targetUrl }),
        headers: {
          'Content-Type': 'application/json',
          'x-embed-key': selectedKey,
        },
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e?.detail || 'アップロードに失敗しました')
      }
      toast.success('アップロードしました')
      const list = await fetch(`/api/embed-admin/documents`, {
        headers: { 'x-embed-key': selectedKey },
      })
      const data = await list.json()
      setFiles(data?.files || [])
      setTargetUrl('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: any) {
      toast.error(e?.message || 'アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  const onDelete = async (f: FileInfo) => {
    if (isPortfolioAccount) {
      toast.error('ポートフォリオアカウントではその機能は制限されています')
      return
    }
    if (!selectedTenant || !selectedKey) return
    if (!confirm(`削除しますか？\n${f.filename}`)) return
    try {
      const res = await fetch(`/api/embed-admin/documents`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-embed-key': selectedKey,
        },
        body: JSON.stringify({ filename: f.filename, file_id: f.file_id }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e?.detail || '削除に失敗しました')
      }
      toast.success('削除しました')
      setFiles(prev => prev.filter(x => x.file_id !== f.file_id))
    } catch (e: any) {
      toast.error(e?.message || '削除に失敗しました')
    }
  }

  async function loadReport() {
    if (!selectedTenant) return
    setLoadingReport(true)
    try {
      // サマリーレポートとエビデンスを並行取得
      const qs = new URLSearchParams({
        tenant: selectedTenant,
        start: from,
        end: to,
      })
      const [summaryRes, evidenceRes] = await Promise.all([
        fetch(`/api/embed-admin/reports/summary?${qs.toString()}`, {
          cache: 'no-store',
        }),
        fetch(`/api/embed-admin/reports/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant: selectedTenant,
            start: from,
            end: to,
          }),
        }),
      ])

      if (!summaryRes.ok) throw new Error('レポート取得に失敗しました')
      if (!evidenceRes.ok) throw new Error('エビデンス取得に失敗しました')

      const summaryData = await summaryRes.json()
      const evidenceData = await evidenceRes.json()

      const s: ReportSummary = {
        period: { from, to },
        tenant: selectedTenant,
        questions: summaryData.questions || 0,
        unique_users: summaryData.unique_users || 0,
        resolved_rate: summaryData.resolved_rate ?? null,
        zero_hit_rate: summaryData.zero_hit_rate ?? null,
        tokens: summaryData.tokens || 0,
        cost_jpy: summaryData.cost_jpy || 0,
        top_docs: summaryData.top_docs || [],
      }

      const e: EvidenceSummary = {
        period: { from, to },
        tenant: selectedTenant,
        evidences: evidenceData.evidences || [],
        inferred_question: evidenceData.inferred_question || [],
        common_keywords: evidenceData.common_keywords || [],
      }

      setReport(s)
      setEvidence(e)

      // HTML生成も自動で行う
      const reportHtml = buildClientReportEmail(s)
      const evidenceHtml = buildEvidenceReportEmail(e)
      setReportHtml(reportHtml)
      setEvidenceHtml(evidenceHtml)

      toast.success('レポートとエビデンスを取得しました')
    } catch (e: any) {
      toast.error(e?.message || 'レポート取得に失敗しました')
    } finally {
      setLoadingReport(false)
    }
  }

  function copyReportHtml() {
    if (!reportHtml) return
    navigator.clipboard
      .writeText(reportHtml)
      .then(() => toast.success('レポートHTMLをコピーしました'))
      .catch(() => toast.error('コピーに失敗しました'))
  }

  function copyEvidenceHtml() {
    if (!evidenceHtml) return
    navigator.clipboard
      .writeText(evidenceHtml)
      .then(() => toast.success('エビデンスHTMLをコピーしました'))
      .catch(() => toast.error('コピーに失敗しました'))
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1 min-h-0 p-4">
        <div className="space-y-4 max-w-5xl mx-auto">
          {/* ポートフォリオアカウント用の注意表示 */}
          {isPortfolioAccount && (
            <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">👋</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      採用担当者の方へ - ポートフォリオアカウントでログイン中
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      レポート表示機能とチャットテスト機能をお試しいただけます。
                      （ファイルのアップロード・削除、キー管理機能は制限されています）
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                    <span>💬</span>
                    デモデータ: Apple Intelligence公式ドキュメント
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    以下のような質問をチャットテストページでお試しください：
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mb-4">
                    <div className="space-y-1">
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「Apple Intelligenceとは何ですか？」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「Writing Toolsの機能を教えて」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「どのデバイス・OSで使えますか？」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「対応言語は何ですか？」
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「Siriの新機能は何ですか？」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「画像生成機能について説明して」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「プライバシーはどう保護されていますか？」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「有効にする方法は？」
                      </p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-2">
                      <strong>顧客企業向けチャットウィジェットのデモ:</strong>
                    </p>
                    <a
                      href="https://tuukaa-portfolio.vercel.app/widget-test?key=demo123"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                    >
                      <span>🔗</span>
                      実際のウィジェットを試す（新しいタブで開く）
                    </a>
                    <p className="text-xs text-muted-foreground mt-1">
                      顧客企業向けに配布・公開するページのデモです
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 新規キー生成 */}
          <Card className="p-4">
            <Collapsible open={openGenerate} onOpenChange={setOpenGenerate}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    <span className="font-medium">新規キー生成</span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${openGenerate ? 'rotate-180' : ''}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={generatedKey}
                      readOnly
                      placeholder="新規テナント用の埋め込みキーを生成します"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onGenerateKey}
                    >
                      <Key className="w-4 h-4 mr-1" /> 生成
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onCopyGeneratedKey}
                    >
                      <Copy className="w-4 h-4 mr-1" /> コピー
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    生成したキーは `.env` の `EMBED_API_KEYS`
                    に手動で追記し、バックエンドを再起動してください。
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* テナント選択（常時表示） */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-2">
                <Label>テナント</Label>
                <Select
                  value={selectedTenant}
                  onValueChange={onChangeTenant}
                  disabled={loadingTenants}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingTenants ? '読み込み中...' : '選択してください'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map(t => (
                      <SelectItem key={t.name} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>埋め込みキー（読み取り専用）</Label>
                <div className="flex gap-2">
                  <Input value={selectedKey} readOnly className="flex-1" />
                  <Button type="button" variant="secondary" onClick={onCopyKey}>
                    <Copy className="w-4 h-4 mr-1" /> コピー
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* ファイル管理 */}
          <Card className="p-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <div className="space-y-1 mb-2">
                  <Label>アップロードするファイルを選択</Label>
                  <span className="text-xs text-muted-foreground">
                    対応拡張子: .pdf, .txt, .md, .markdown, .docx, .pptx, .xlsx
                  </span>
                </div>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.markdown,.docx,.pptx,.xlsx"
                />
              </div>
              <Button
                type="button"
                onClick={onUpload}
                disabled={!selectedTenant || !selectedKey || uploading}
              >
                <Upload className="w-4 h-4 mr-1" />
                {uploading ? 'アップロード中...' : 'アップロード'}
              </Button>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="mb-2">URLからHTMLテキストを抽出</Label>
                <Input
                  type="text"
                  value={targetUrl}
                  onChange={e => setTargetUrl(e.target.value)}
                  placeholder="URLを入力してください"
                />
              </div>
              <Button
                type="button"
                onClick={onUploadUrl}
                disabled={!selectedTenant || !selectedKey || uploading}
              >
                <Upload className="w-4 h-4 mr-1" />
                {uploading ? 'アップロード中...' : 'アップロード'}
              </Button>
            </div>
          </Card>
          <Card className="p-4 gap-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">アップロード済みファイル</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedTenant(t => (t ? t + '' : t))}
                disabled={loadingFiles}
              >
                <RefreshCw className="w-4 h-4 mr-1" /> 再読込
              </Button>
            </div>

            {loadingFiles ? (
              <div className="text-sm text-muted-foreground">読み込み中...</div>
            ) : files.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                ファイルはまだありません
              </div>
            ) : (
              <div className="space-y-2">
                {files.map(f => (
                  <div
                    key={f.file_id}
                    className="flex items-center justify-between p-2 rounded border"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4" />
                      <div>
                        <div className="font-medium">{f.filename}</div>
                        <div className="text-xs text-muted-foreground">
                          chunks: {f.chunk_count} / size: {f.file_size} bytes /
                          id: {f.file_id}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => onDelete(f)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> 削除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <div className="flex flex-col md:flex-row gap-3 items-end">
              <div className="space-y-2">
                <Label>開始日</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>終了日</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={loadReport}
                disabled={!selectedTenant || loadingReport}
              >
                {loadingReport ? '取得中...' : 'レポート取得'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={copyReportHtml}
                disabled={!reportHtml}
              >
                レポートHTMLコピー
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={copyEvidenceHtml}
                disabled={!evidenceHtml}
              >
                エビデンスHTMLコピー
              </Button>
            </div>

            {report && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="p-3 border rounded">
                  <div className="font-medium mb-1">サマリ</div>
                  <div>質問数: {report.questions.toLocaleString()}</div>
                  <div>
                    ユニーク利用者（推定）:{' '}
                    {report.unique_users.toLocaleString()}
                  </div>
                  <div>
                    解決率:{' '}
                    {report.resolved_rate == null
                      ? '-'
                      : Math.round(report.resolved_rate * 100) + '%'}
                  </div>
                  <div>
                    ゼロヒット率:{' '}
                    {report.zero_hit_rate == null
                      ? '-'
                      : Math.round(report.zero_hit_rate * 100) + '%'}
                  </div>
                  <div>推定コスト: ¥{report.cost_jpy.toFixed(3)}</div>
                  <div>
                    総トークン: {Math.round(report.tokens).toLocaleString()}
                  </div>
                </div>
                <div className="p-3 border rounded">
                  <div className="font-medium mb-1">上位参照ドキュメント</div>
                  <ul className="list-disc ml-5">
                    {(report.top_docs || []).slice(0, 5).map(d => (
                      <li key={d.id}>
                        {d.id}（{d.count}件）
                      </li>
                    ))}
                  </ul>
                </div>
                {evidence && (
                  <div className="md:col-span-2 p-3 border rounded">
                    <div className="font-medium mb-2">
                      エビデンス（上位チャンク）
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(evidence.evidences || []).slice(0, 10).map((e, i) => (
                        <div key={i} className="border rounded p-2">
                          <div className="font-semibold">{e.title}</div>
                          <div className="text-xs text-muted-foreground">
                            出典: {e.source?.filename}（#{e.source?.chunk_index}
                            ） ／ 回数: {e.hit_count}
                          </div>
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">抜粋</div>
                            <ul className="list-disc ml-5">
                              {(e.excerpt || []).slice(0, 3).map((s, si) => (
                                <li key={si}>{s}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            キーワード:{' '}
                            {(e.keywords || []).slice(0, 5).join('、 ') || '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <div className="font-medium">推定質問</div>
                      {(evidence.inferred_question || []).length > 0 ? (
                        <ul className="list-disc ml-5 text-sm mt-1">
                          {evidence.inferred_question.map((q, qi) => (
                            <li key={qi}>{q}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          （推定不可）
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-2">
                        共通キーワード:{' '}
                        {(evidence.common_keywords || [])
                          .slice(0, 10)
                          .join('、 ') || '-'}
                      </div>
                    </div>
                  </div>
                )}
                {(!!reportHtml || !!evidenceHtml) && (
                  <div className="md:col-span-2 p-3 border rounded">
                    <div className="font-medium mb-2">
                      メール用HTMLプレビュー
                    </div>
                    <div
                      className="border rounded p-3"
                      dangerouslySetInnerHTML={{
                        __html: [reportHtml, evidenceHtml]
                          .filter(Boolean)
                          .join(
                            '\n<hr style="border:none;border-top:2px solid #e5e7eb;margin:32px 0;" />\n'
                          ),
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
