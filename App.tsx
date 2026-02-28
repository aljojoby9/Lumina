import React, { useState, useEffect } from 'react';
import { auth } from './firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { AppSettings, Project, UserProfile } from './types';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Editor from './components/Editor';
import { Loader2 } from 'lucide-react';
import { defaultAppSettings, getAppSettings, saveAppSettings } from './services/userSettings';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);

  useEffect(() => {
    setAppSettings(getAppSettings());
  }, []);

  useEffect(() => {
    saveAppSettings(appSettings);
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(appSettings.theme === 'light' ? 'theme-light' : 'theme-dark');
  }, [appSettings]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName
        });
      } else {
        setUser(null);
        setCurrentProject(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
      return (
          <div className="min-h-screen bg-dark-bg flex items-center justify-center">
              <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-lumina-500 to-blue-600 flex items-center justify-center font-bold text-white text-xl mx-auto mb-4 animate-pulse">L</div>
                  <Loader2 className="animate-spin text-lumina-500 mx-auto" size={24} />
              </div>
          </div>
      );
  }

  // View Routing Logic
  if (!user) {
      return <Auth onSuccess={() => {}} />; // Auth handles its own state updates via onAuthStateChanged
  }

  if (currentProject) {
      return (
        <Editor 
            project={currentProject} 
            appSettings={appSettings}
            onBack={() => setCurrentProject(null)} 
        />
      );
  }

  return (
    <Dashboard 
        user={user} 
      appSettings={appSettings}
      onUpdateSettings={setAppSettings}
        onSelectProject={setCurrentProject} 
    />
  );
};

export default App;