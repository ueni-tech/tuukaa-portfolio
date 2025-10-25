import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      id: 'portfolio',
      name: 'Portfolio Account',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // ポートフォリオ用アカウントの認証
        const portfolioUsername = process.env.PORTFOLIO_USERNAME
        const portfolioPassword = process.env.PORTFOLIO_PASSWORD

        if (!portfolioUsername || !portfolioPassword) {
          console.error(
            'PORTFOLIO_USERNAME or PORTFOLIO_PASSWORD is not set in environment variables'
          )
          return null
        }

        if (
          credentials?.username === portfolioUsername &&
          credentials?.password === portfolioPassword
        ) {
          return {
            id: 'portfolio-user',
            name: 'Portfolio User',
            email: 'portfolio@tuukaa.local',
            role: 'portfolio',
          }
        }

        return null
      },
    }),
  ],
  pages: {
    signIn: '/login', // デフォルトは管理者用ログイン（Google OAuth）
    error: '/auth/error',
    // ポートフォリオアカウントは /portfolio-login から直接ログイン
  },
  callbacks: {
    async signIn({ user, account }) {
      // Google認証の場合
      if (account?.provider === 'google') {
        const allowedEmails =
          process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

        if (allowedEmails.length === 0) {
          console.error('ADMIN_EMAILS is not set in environment variables')
          return false
        }

        if (!allowedEmails.includes(user.email || '')) {
          console.log(`Access denied for email: ${user.email}`)
          return false
        }
      }

      // Credentials認証（ポートフォリオアカウント）の場合はそのまま許可
      return true
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnProtectedPage =
        nextUrl.pathname === '/' ||
        nextUrl.pathname.startsWith('/embed-admin') ||
        nextUrl.pathname.startsWith('/chat-test')

      // ログインページとポートフォリオログインページは常にアクセス可能
      if (
        nextUrl.pathname === '/login' ||
        nextUrl.pathname === '/portfolio-login'
      ) {
        return true
      }

      if (isOnProtectedPage) {
        if (isLoggedIn) return true
        return false
      }

      return true
    },
    jwt({ token, user, account }) {
      if (user) {
        // Credentialsプロバイダーでログインした場合
        if (account?.provider === 'portfolio') {
          token.role = 'portfolio'
        } else {
          // Google認証の場合は管理者
          token.role = 'admin'
        }
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role
      }
      return session
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
  },
  secret: process.env.AUTH_SECRET,
})

// 起動時の必須環境変数チェック
if (!process.env.AUTH_SECRET) {
  throw new Error('AUTH_SECRET is required')
}
