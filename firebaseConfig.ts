import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// !IMPORTANT: You must replace these values with your actual Firebase project configuration.
// 1. Go to console.firebase.google.com
// 2. Create a new project or select an existing one.
// 3. Register a web app (</> icon).
// 4. Copy the config object properties here.
// 5. Ensure Authentication (Email/Password), Firestore Database, and Storage are enabled in the console.

const firebaseConfig = {
  apiKey: "AIzaSyDT-905TSi93KYaztHgqYj5y5ClmL4xwgI",
  authDomain: "lumina-3282b.firebaseapp.com",
  projectId: "lumina-3282b",
  storageBucket: "lumina-3282b.firebasestorage.app",
  messagingSenderId: "820463079586",
  appId: "1:820463079586:web:ddde936ba242061ac9c7fb",
  measurementId: "G-V3TMFTVP2J"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);