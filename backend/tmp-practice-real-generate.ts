import { getSupabaseAdminClient } from './src/services/supabase.js'
import { generatePracticeQuestions } from './src/services/practiceGeneration.service.js'

async function main() {
  const client = getSupabaseAdminClient()
  if (!client) throw new Error('no admin client')

  try {
    const result = await generatePracticeQuestions(
      client,
      {
        kind: 'branch_mcq',
        branch: 'cse',
        category: 'DBMS',
        topic: 'Normalization',
        difficulty: 'mixed',
        count: 1,
      },
      1,
      () => 0,
    )
    console.log('generation result:', result)
  } catch (error) {
    const value = error as { name?: string; code?: string; status?: number; message?: string }
    console.log('generation error:', {
      name: value?.name,
      code: value?.code,
      status: value?.status,
      message: value?.message,
    })
  }

  const { count, error } = await client
    .from('practice_questions')
    .select('id', { count: 'exact', head: true })
  console.log('bank count after attempt:', { count, error: error ? { code: error.code, message: error.message } : null })
}

main().catch((error) => {
  console.error('failed:', { name: error?.name, code: error?.code, message: error?.message })
  process.exitCode = 1
})
