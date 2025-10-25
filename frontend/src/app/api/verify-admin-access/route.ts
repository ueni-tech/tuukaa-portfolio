import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json()

    // 環境変数からアクセスキーを取得
    const validAccessKey = process.env.ADMIN_LOGIN_ACCESS_KEY

    // アクセスキーが設定されていない場合は、開発環境として全て許可
    if (!validAccessKey) {
      console.warn(
        'ADMIN_LOGIN_ACCESS_KEY is not set. Admin login page is accessible without key.'
      )
      return NextResponse.json({ authorized: true })
    }

    // アクセスキーの検証
    if (key === validAccessKey) {
      return NextResponse.json({ authorized: true })
    }

    // アクセス拒否
    return NextResponse.json({ authorized: false }, { status: 403 })
  } catch (error) {
    console.error('Error verifying admin access:', error)
    return NextResponse.json(
      { authorized: false, error: 'Invalid request' },
      { status: 400 }
    )
  }
}
