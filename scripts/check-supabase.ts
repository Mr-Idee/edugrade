import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in your local environment before checking Supabase.`);
  return value;
}

async function main(): Promise<void> {
  const supabase = createClient(
    requiredEnvironment('SUPABASE_URL'),
    process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      (() => {
        throw new Error('Set SUPABASE_SECRET_KEY in your local environment before checking Supabase.');
      })(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const requiredTables = [
    ['app_state_store', 'id'],
    ['auth_vault', 'id'],
    ['offline_commit_archive', 'commit_id'],
    ['system_backups', 'id'],
    ['auth_rate_limits', 'bucket_key']
  ] as const;

  for (const [table, keyColumn] of requiredTables) {
    const { error } = await supabase.from(table).select(keyColumn).limit(1);
    if (error) {
      throw new Error(`Could not read Supabase table ${table}: ${error.code} ${error.message}`);
    }
  }

  const { data: state, error: stateError } = await supabase
    .from('app_state_store')
    .select('id,state_revision,updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (stateError) {
    throw new Error(`Could not read the canonical school state: ${stateError.code} ${stateError.message}`);
  }

  const { error: saveFunctionError } = await supabase.rpc('save_app_state', {
    p_state: [],
    p_expected_revision: null
  });
  if (saveFunctionError?.code !== '22023') {
    throw new Error(
      saveFunctionError
        ? `Could not validate the Supabase state-write function: ${saveFunctionError.code} ${saveFunctionError.message}`
        : 'Supabase accepted an invalid state payload; expected the state-write validation to reject it.'
    );
  }

  const bucketKey = `deployment-smoke-${crypto.randomUUID()}`;
  let writeVerified = false;
  try {
    const { data: allowed, error: writeError } = await supabase.rpc('consume_auth_attempt', {
      p_bucket_key: bucketKey,
      p_max_attempts: 5,
      p_window_seconds: 900
    });
    if (writeError) {
      throw new Error(`Could not write to Supabase: ${writeError.code} ${writeError.message}`);
    }
    const { data: written, error: readError } = await supabase
      .from('auth_rate_limits')
      .select('attempts')
      .eq('bucket_key', bucketKey)
      .maybeSingle();
    if (readError) {
      throw new Error(`Could not verify the Supabase write: ${readError.code} ${readError.message}`);
    }
    if (allowed !== true || written?.attempts !== 1) {
      throw new Error('Supabase did not return the expected result for the temporary write check.');
    }
    writeVerified = true;
  } finally {
    const { error: cleanupError } = await supabase
      .from('auth_rate_limits')
      .delete()
      .eq('bucket_key', bucketKey);
    if (cleanupError) {
      throw new Error(`Could not remove the temporary database check row: ${cleanupError.code} ${cleanupError.message}`);
    }
  }

  if (!writeVerified) throw new Error('Supabase read/write check did not complete.');

  const { data: bucket, error: bucketError } = await supabase.storage.getBucket('edugrade-documents');
  if (bucketError || !bucket) {
    throw new Error(
      `Could not verify the private document bucket: ${bucketError?.message || 'bucket not found'}`
    );
  }

  console.log(JSON.stringify({
    supabaseRead: true,
    supabaseWrite: true,
    stateInitialized: Boolean(state),
    stateRevision: state?.state_revision || null,
    documentBucket: 'edugrade-documents'
  }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Supabase read/write check failed.');
  process.exitCode = 1;
});
