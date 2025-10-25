import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json()

    // 環境変数からアクセスキーを取得
    const validAccessKey = process.env.ADMIN_LOGIN_ACCESS_KEY

    // アクセスキーが設定されていない場合はエラー
    if (!validAccessKey) {
      console.error(
        'ADMIN_LOGIN_ACCESS_KEY is not set in environment variables. Admin login page is blocked.'
      )
      return NextResponse.json(
        {
          authorized: false,
          error:
            'Access key not configured. Please set ADMIN_LOGIN_ACCESS_KEY environment variable.',
        },
        { status: 500 }
      )
    }

    // アクセスキーが提供されていない場合
    if (!key) {
      return NextResponse.json({ authorized: false }, { status: 403 })
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
