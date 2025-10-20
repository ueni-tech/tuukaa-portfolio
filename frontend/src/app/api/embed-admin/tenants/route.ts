import { auth } from '@/auth'
import { config, serverConfig } from '@/lib/config'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = serverConfig.internalApiUrl || config.apiUrl
  const adminSecret = process.env.ADMIN_API_SECRET || ''

  const res = await fetch(`${base}${config.apiBasePath}/admin/tenants`, {
    cache: 'no-store',
    headers: {
      'x-admin-api-secret': adminSecret,
    },
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return Response.json(data, { status: res.status })
}
