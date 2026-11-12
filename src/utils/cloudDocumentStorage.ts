import { createClient } from '@supabase/supabase-js';

const bucketName = 'edugrade-documents';
let storageClient: ReturnType<typeof createClient> | null = null;

function getStorageClient() {
  const url = import.meta.env.SUPABASE_URL;
  const publishableKey = import.meta.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Supabase URL and publishable key must be configured for document uploads.');
  }
  if (!storageClient) {
    storageClient = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return storageClient;
}

export async function uploadDocumentToCloud(
  file: File,
  id: string,
  fileName = file.name
): Promise<{ id: string; fileName: string; fileSizeKb: number; fileStoragePath: string }> {
  const signedResponse = await fetch('/api/documents/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, fileName })
  });
  const signedResult = await signedResponse.json();
  if (!signedResponse.ok || !signedResult.ok || !signedResult.token || !signedResult.fileStoragePath) {
    throw new Error(signedResult.error || 'Could not prepare a secure document upload.');
  }

  const { error } = await getStorageClient()
    .storage.from(bucketName)
    .uploadToSignedUrl(signedResult.fileStoragePath, signedResult.token, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true
    });
  if (error) throw new Error(`Could not upload the file to Supabase Storage: ${error.message}`);

  const completedResponse = await fetch('/api/documents/complete-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      fileName: signedResult.fileName || fileName,
      fileStoragePath: signedResult.fileStoragePath
    })
  });
  const completedResult = await completedResponse.json();
  if (!completedResponse.ok || !completedResult.ok) {
    throw new Error(completedResult.error || 'The server could not verify the uploaded file.');
  }
  return completedResult;
}
