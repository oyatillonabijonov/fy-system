-- Drop restrictive policies
DROP POLICY IF EXISTS "Authenticated upload for event covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update for event covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete for event covers" ON storage.objects;

-- Allow all users to upload/update/delete event covers
CREATE POLICY "Allow insert event covers"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'event-covers');

CREATE POLICY "Allow update event covers"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'event-covers');

CREATE POLICY "Allow delete event covers"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'event-covers');
