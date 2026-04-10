-- Drop legacy public/anonymous storage policies for session-images bucket
DROP POLICY IF EXISTS "Public read access for session images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload session images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update session images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete session images" ON storage.objects;