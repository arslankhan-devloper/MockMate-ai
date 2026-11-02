import { getSupabaseAdminClient } from './src/services/supabase.js'
import { env } from './src/config/env.js'

async function main() {
  console.log('env:', {
    supabaseConfigured: env.supabaseConfigured,
    supabaseAdminConfigured: env.supabaseAdminConfigured,
    groqConfigured: env.groqConfigured,
    groqModel: env.groqModel,
    groqBaseUrl: env.groqBaseUrl,
  })

  const client = getSupabaseAdminClient()
  if (!client) {
    console.log('NO ADMIN CLIENT')
    return
  }

  const { data, error, count } = await client
    .from('practice_questions')
    .select('id,kind,branch,category,topic,difficulty,source,prompt_key', { count: 'exact' })
    .limit(20)
  console.log('practice_questions read:', { count, error: error ? { code: error.code, message: error.message } : null })
  console.log('rows:', (data ?? []).map((row) => ({
    kind: row.kind,
    branch: row.branch,
    category: row.category,
    topic: row.topic,
    difficulty: row.difficulty,
    source: row.source,
    hasPromptKey: Boolean(row.prompt_key),
  })))

  // Probe whether ON CONFLICT (prompt_key) can use the partial unique index.
  const probeKey = `diagnostic-probe-${Date.now()}`
  const probe = {
    kind: 'branch_mcq',
    branch: 'cse',
    category: '__diagnostic__',
    topic: '__diagnostic__',
    difficulty: 'easy',
    prompt: 'Diagnostic probe row that is never a real question.',
    options: ['A', 'B', 'C', 'D'],
    correct_index: 0,
    explanation: 'Diagnostic probe explanation that satisfies the column length.',
    is_active: false,
    source: 'ai',
    prompt_key: probeKey,
  }
  const { data: upsertData, error: upsertError } = await client
    .from('practice_questions')
    .upsert([probe], { onConflict: 'prompt_key', ignoreDuplicates: true })
    .select('id')
  console.log('upsert probe:', {
    inserted: upsertData?.length ?? 0,
    error: upsertError ? { code: upsertError.code, message: upsertError.message } : null,
  })
  if (upsertData && upsertData.length > 0) {
    const { error: deleteError } = await client
      .from('practice_questions')
      .delete()
      .eq('prompt_key', probeKey)
    console.log('probe cleanup:', deleteError ? { code: deleteError.code, message: deleteError.message } : 'ok')
  }
}

main().catch((error) => {
  console.error('diagnostic failed:', { name: error?.name, code: error?.code, message: error?.message })
  process.exitCode = 1
})
