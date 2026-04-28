-- Create storage bucket for event cover images
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-covers', 'event-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for event covers"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-covers');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated upload for event covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-covers');

-- Allow authenticated users to update (upsert)
CREATE POLICY "Authenticated update for event covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-covers');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated delete for event covers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-covers');
