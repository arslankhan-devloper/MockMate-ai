/**
 * Super Admin Bootstrap Script
 *
 * Usage:
 *   npx tsx src/scripts/bootstrapAdmin.ts <email> [password] [fullName]
 *
 * Or via environment variables:
 *   BOOTSTRAP_ADMIN_EMAIL=admin@example.com
 *   BOOTSTRAP_ADMIN_PASSWORD=SecurePassword123!
 *   BOOTSTRAP_ADMIN_NAME="Super Administrator"
 *   npx tsx src/scripts/bootstrapAdmin.ts
 *
 * This script runs strictly server-side using the Supabase Service Role key.
 * It is idempotent: if the user already exists, it promotes their profile to
 * 'super_admin' and marks them 'approved'. If they do not exist, it creates the
 * auth user and configures their profile.
 */

import { getSupabaseAdminClient } from '../services/supabase.js'
import { recordAuditLog } from '../services/audit.service.js'

async function bootstrap() {
  const email = (process.argv[2] || process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.argv[3] || process.env.BOOTSTRAP_ADMIN_PASSWORD || ''
  const fullName = (process.argv[4] || process.env.BOOTSTRAP_ADMIN_NAME || 'Super Administrator').trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Error: A valid email address is required.')
    console.error('Usage: npx tsx src/scripts/bootstrapAdmin.ts <email> [password] [fullName]')
    process.exit(1)
  }

  const adminClient = getSupabaseAdminClient()
  if (!adminClient) {
    console.error('Error: Supabase admin client is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.')
    process.exit(1)
  }

  console.log(`[bootstrap] Processing Super Admin bootstrap for: ${email}`)

  // 1. Check if user already exists in Auth
  const { data: listData, error: listError } = await adminClient.auth.admin.listUsers()
  if (listError) {
    console.error('[bootstrap] Failed to list auth users:', listError.message)
    process.exit(1)
  }

  const existingAuthUser = (listData?.users || []).find(u => u.email?.toLowerCase() === email)
  let userId: string

  if (existingAuthUser) {
    userId = existingAuthUser.id
    console.log(`[bootstrap] Found existing Auth user (${userId}). Promoting to super_admin...`)

    if (password) {
      const { error: updatePwError } = await adminClient.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          ...existingAuthUser.user_metadata,
          full_name: fullName,
          role: 'super_admin',
        },
      })
      if (updatePwError) {
        console.warn('[bootstrap] Note: could not update password:', updatePwError.message)
      } else {
        console.log('[bootstrap] Password and metadata updated successfully.')
      }
    }
  } else {
    if (!password || password.length < 8) {
      console.error('Error: A password of at least 8 characters is required to create a new Super Admin account.')
      process.exit(1)
    }

    console.log('[bootstrap] Creating new Supabase Auth user...')
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'super_admin',
      },
    })

    if (createError || !createData.user) {
      console.error('[bootstrap] Failed to create user:', createError?.message)
      process.exit(1)
    }

    userId = createData.user.id
    console.log(`[bootstrap] Created user with ID: ${userId}`)
  }

  // 2. Upsert profile with super_admin role and approved status
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({
      id: userId,
      email,
      full_name: fullName,
      role: 'super_admin',
      approval_status: 'approved',
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })

  if (profileError) {
    console.error('[bootstrap] Failed to upsert super_admin profile:', profileError.message)
    process.exit(1)
  }

  // 3. Record immutable audit log
  await recordAuditLog({
    actorId: userId,
    actorRole: 'super_admin',
    action: 'super_admin_bootstrapped',
    targetType: 'super_admin',
    targetId: userId,
    metadata: { email, bootstrappedAt: new Date().toISOString() },
  })

  console.log('---------------------------------------------------------')
  console.log('SUCCESS: Super Admin account configured successfully!')
  console.log(`Email:   ${email}`)
  console.log(`Role:    super_admin`)
  console.log(`Status:  approved`)
  console.log('You can now log in at /admin/login')
  console.log('---------------------------------------------------------')
}

bootstrap().catch(err => {
  console.error('[bootstrap] Fatal error:', err)
  process.exit(1)
})

