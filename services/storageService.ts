import { supabase, MEDIA_BUCKET } from "../supabaseConfig";
import { auth } from "../firebaseConfig";

/**
 * Upload a media file to Supabase Storage
 * Files are organized by user ID and project for easy management
 */
export const uploadMediaFile = async (
    projectId: string,
    fileId: string,
    file: File,
    onProgress?: (progress: number) => void
): Promise<string> => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
        throw new Error("User must be authenticated to upload files");
    }

    // Create a file path: {userId}/{projectId}/{fileId}_{originalName}
    // Include file extension for proper content type detection
    const extension = file.name.split('.').pop() || 'mp4';
    const filePath = `${userId}/${projectId}/${fileId}.${extension}`;

    console.log(`Uploading file to Supabase Storage: ${filePath}`);
    console.log(`File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`File type: ${file.type}`);
    onProgress?.(10);

    try {
        // Upload the file to Supabase Storage
        const { data, error } = await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true, // Overwrite if exists
                contentType: file.type || 'video/mp4'
            });

        if (error) {
            console.error(`Supabase upload error:`, error);
            console.error(`Full error details:`, JSON.stringify(error, null, 2));

            // Provide helpful error messages
            if (error.message?.includes('Bucket not found')) {
                throw new Error(`Storage bucket "${MEDIA_BUCKET}" not found. Please create it in Supabase Dashboard → Storage.`);
            }
            if (error.message?.includes('not allowed') || error.message?.includes('policy') || error.message?.includes('row-level security')) {
                throw new Error(`Upload blocked by policy. Go to Supabase → Storage → Policies → media bucket → Add policy for INSERT with Target role "anon" and definition "true".`);
            }
            if (error.message?.includes('size') || error.message?.includes('payload')) {
                throw new Error(`File too large. Max size is typically 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
            }

            throw new Error(`${error.message} (${(error as any).statusCode || 'unknown status'})`);
        }

        onProgress?.(80);

        // Get the public URL
        const { data: urlData } = supabase.storage
            .from(MEDIA_BUCKET)
            .getPublicUrl(filePath);

        console.log(`File uploaded successfully: ${filePath}`);
        console.log(`Public URL: ${urlData.publicUrl}`);
        onProgress?.(100);

        return urlData.publicUrl;
    } catch (error: any) {
        console.error(`Failed to upload file: ${filePath}`, error);
        throw error;
    }
};

/**
 * Get public URL for a media file
 * Lists files to find the correct one since some may have extensions, some may not
 */
export const getMediaFileURL = async (
    projectId: string,
    fileId: string,
    fileName?: string
): Promise<string | null> => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
        console.warn("User not authenticated, cannot get file URL");
        return null;
    }

    // Try to list files in the project folder to find the matching one
    try {
        const { data: fileList, error: listError } = await supabase.storage
            .from(MEDIA_BUCKET)
            .list(`${userId}/${projectId}`);

        if (listError) {
            console.error(`Error listing files:`, listError);
        }

        // Find file that matches the fileId (could be with or without extension)
        if (fileList && fileList.length > 0) {
            const matchingFile = fileList.find(f =>
                f.name === fileId ||
                f.name.startsWith(fileId + '.') ||
                f.name === `${fileId}.mp4` ||
                f.name === `${fileId}.${fileName?.split('.').pop()}`
            );

            if (matchingFile) {
                const filePath = `${userId}/${projectId}/${matchingFile.name}`;
                const { data } = supabase.storage
                    .from(MEDIA_BUCKET)
                    .getPublicUrl(filePath);
                console.log(`Found file, public URL: ${data.publicUrl}`);
                return data.publicUrl;
            }
        }

        // Fallback: construct URL with extension from fileName
        const extension = fileName?.split('.').pop() || 'mp4';
        const filePath = `${userId}/${projectId}/${fileId}.${extension}`;
        console.log(`File not found in list, trying: ${filePath}`);

        const { data } = supabase.storage
            .from(MEDIA_BUCKET)
            .getPublicUrl(filePath);

        return data.publicUrl;
    } catch (error: any) {
        console.error(`Failed to get file URL:`, error);

        // Final fallback
        const extension = fileName?.split('.').pop() || 'mp4';
        const filePath = `${userId}/${projectId}/${fileId}.${extension}`;
        const { data } = supabase.storage
            .from(MEDIA_BUCKET)
            .getPublicUrl(filePath);
        return data.publicUrl;
    }
};

/**
 * Delete a media file from Supabase Storage
 */
export const deleteMediaFile = async (
    projectId: string,
    fileId: string
): Promise<void> => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
        throw new Error("User must be authenticated to delete files");
    }

    const filePath = `${userId}/${projectId}/${fileId}`;

    try {
        const { error } = await supabase.storage
            .from(MEDIA_BUCKET)
            .remove([filePath]);

        if (error) {
            console.error(`Failed to delete file: ${filePath}`, error);
            throw error;
        }

        console.log(`File deleted from storage: ${filePath}`);
    } catch (error: any) {
        console.error(`Failed to delete file: ${filePath}`, error);
        throw error;
    }
};
