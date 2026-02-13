import { auth } from "../firebaseConfig";

/**
 * Lumina — File Storage Service (FastAPI Backend)
 * Uploads, downloads, and deletes media files via the local Python backend.
 * Replaces Firebase Storage / Supabase with local file storage.
 */

const API_BASE = "http://localhost:8000";

/**
 * Upload a media file to the FastAPI backend
 * Files are stored at: backend/media/{userId}/{projectId}/{fileId}.{ext}
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

    console.log(`Uploading file to backend: ${file.name}`);
    console.log(`File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`File type: ${file.type}`);
    onProgress?.(10);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", userId);
    formData.append("project_id", projectId);
    formData.append("file_id", fileId);

    try {
        onProgress?.(30);

        const response = await fetch(`${API_BASE}/api/files/upload`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Upload failed (${response.status}): ${detail}`);
        }

        onProgress?.(80);

        const data = await response.json();
        const downloadURL = `${API_BASE}${data.url}`;

        console.log(`File uploaded successfully: ${downloadURL}`);
        console.log(`File size on server: ${(data.size / 1024 / 1024).toFixed(2)} MB`);
        onProgress?.(100);

        return downloadURL;
    } catch (error: any) {
        console.error(`Failed to upload file: ${file.name}`, error);
        throw error;
    }
};

/**
 * Get the URL for a stored media file
 */
export const getMediaFileURL = async (
    projectId: string,
    fileId: string,
    _fileName?: string
): Promise<string | null> => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
        console.warn("User not authenticated, cannot get file URL");
        return null;
    }

    const url = `${API_BASE}/api/files/${userId}/${projectId}/${fileId}`;

    try {
        // Verify the file exists with a HEAD request
        const response = await fetch(url, { method: "HEAD" });
        if (response.ok) {
            console.log(`File found: ${url}`);
            return url;
        }
        console.warn(`File not found: ${url} (${response.status})`);
        return null;
    } catch (error: any) {
        console.error(`Failed to get file URL:`, error);
        return null;
    }
};

/**
 * Delete a media file from the backend
 */
export const deleteMediaFile = async (
    projectId: string,
    fileId: string
): Promise<void> => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
        throw new Error("User must be authenticated to delete files");
    }

    const url = `${API_BASE}/api/files/${userId}/${projectId}/${fileId}`;

    try {
        const response = await fetch(url, { method: "DELETE" });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Delete failed (${response.status}): ${detail}`);
        }

        console.log(`File deleted: ${fileId}`);
    } catch (error: any) {
        console.error(`Failed to delete file: ${fileId}`, error);
        throw error;
    }
};

/**
 * Upload an exported video to the backend
 */
export const uploadExportedVideo = async (
    projectId: string,
    blob: Blob,
    filename: string,
): Promise<string> => {
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("project_id", projectId);
    formData.append("filename", filename);

    try {
        const response = await fetch(`${API_BASE}/api/files/export`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Export upload failed (${response.status}): ${detail}`);
        }

        const data = await response.json();
        const downloadURL = `${API_BASE}${data.url}`;
        console.log(`Export uploaded: ${downloadURL}`);
        return downloadURL;
    } catch (error: any) {
        console.error("Failed to upload export:", error);
        throw error;
    }
};
