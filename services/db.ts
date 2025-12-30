import { db } from "../firebaseConfig";
import { collection, addDoc, query, where, getDocs, updateDoc, doc, deleteDoc, orderBy } from "firebase/firestore";
import { Project, VideoState, TimelineClip, ChatMessage } from "../types";

const PROJECTS_COLLECTION = "projects";

export const createProject = async (userId: string, name: string): Promise<string> => {
  const initialProject: Partial<Project> = {
    userId,
    name,
    lastModified: Date.now(),
    videoState: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 1,
        playbackRate: 1,
        filter: 'none',
        brightness: 100,
        contrast: 100,
        saturation: 100,
        fadeIn: 0,
        fadeOut: 0,
        // Fix: Added missing isAudioEnhanced property required by VideoState interface
        isAudioEnhanced: false
    },
    clips: [],
    messages: [{
        id: 'welcome',
        role: 'model',
        text: "Hello! I'm Lumina. Upload a video and I can help you edit it."
    }]
  };
  
  const docRef = await addDoc(collection(db, PROJECTS_COLLECTION), initialProject);
  return docRef.id;
};

export const getUserProjects = async (userId: string): Promise<Project[]> => {
  const q = query(
    collection(db, PROJECTS_COLLECTION), 
    where("userId", "==", userId),
    orderBy("lastModified", "desc")
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Project));
};

export const saveProject = async (
    projectId: string, 
    updates: Partial<Project>
) => {
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
        ...updates,
        lastModified: Date.now()
    });
};

export const deleteProject = async (projectId: string) => {
    await deleteDoc(doc(db, PROJECTS_COLLECTION, projectId));
}