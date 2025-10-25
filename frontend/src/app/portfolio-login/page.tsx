'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock } from 'lucide-react'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

function PortfolioLoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/embed-admin'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleCredentialSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      toast.error('ユーザー名とパスワードを入力してください')
      return
    }

    setIsLoading(true)
    try {
      const result = await signIn('portfolio', {
        username,
        password,
        redirect: false,
      })

      if (result?.error) {
        toast.error('ログインに失敗しました。認証情報を確認してください。')
      } else if (result?.ok) {
        toast.success('ログインしました')
        window.location.href = callbackUrl
      }
    } catch (error) {
      toast.error('ログインエラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">ポートフォリオ閲覧</h1>
          <p className="text-muted-foreground text-sm">
            採用担当者向けデモアカウント
          </p>
        </div>

        <form onSubmit={handleCredentialSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">ユーザー名</Label>
            <Input
              id="username"
              type="text"
              placeholder="ユーザー名を入力"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              type="password"
              placeholder="パスワードを入力"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-12 text-base"
            disabled={isLoading}
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>採用担当者の方へ：</strong>
            <br />
            このアカウントでは、チャット機能とレポート表示機能をお試しいただけます。
            <br />
            認証情報をお持ちでない場合は、お問い合わせください。
          </p>
        </div>
      </Card>
    </div>
  )
}

export default function PortfolioLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <PortfolioLoginForm />
    </Suspense>
  )
}
