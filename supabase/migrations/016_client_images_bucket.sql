-- Create storage bucket for client profile images
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-images', 'client-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for client images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'client-images');

-- Allow all users to upload client images
CREATE POLICY "Allow insert client images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'client-images');

-- Allow all users to update client images
CREATE POLICY "Allow update client images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'client-images');

-- Allow all users to delete client images
CREATE POLICY "Allow delete client images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'client-images');
