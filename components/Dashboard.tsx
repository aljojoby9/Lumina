
import React, { useEffect, useState, useMemo } from 'react';
import { Project, UserProfile } from '../types';
import { createProject, getUserProjects, deleteProject } from '../services/db';
import { deleteVideoFromLocal } from '../services/localStore';
import { Plus, Video, Calendar, Trash2, LogOut, Loader2, ShieldAlert, RefreshCw, AlertTriangle, ExternalLink, Hourglass, CloudSnow } from 'lucide-react';
import { auth } from '../firebaseConfig';

interface DashboardProps {
  user: UserProfile;
  onSelectProject: (project: Project) => void;
}

// Internal Snowfall Component
const Snowfall = () => {
  const flakes = useMemo(() => {
    return Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: 5 + Math.random() * 10,
      delay: Math.random() * 5,
      size: 2 + Math.random() * 4,
      opacity: 0.3 + Math.random() * 0.7,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-10vh) translateX(0); }
          25% { transform: translateY(20vh) translateX(15px); }
          50% { transform: translateY(50vh) translateX(-15px); }
          75% { transform: translateY(80vh) translateX(15px); }
          100% { transform: translateY(110vh) translateX(0); }
        }
      `}</style>
      {flakes.map((flake) => (
        <div
          key={flake.id}
          className="absolute bg-white rounded-full"
          style={{
            left: `${flake.left}%`,
            width: `${flake.size}px`,
            height: `${flake.size}px`,
            opacity: flake.opacity,
            animation: `fall ${flake.duration}s linear infinite`,
            animationDelay: `${flake.delay}s`,
            top: '-5vh',
          }}
        />
      ))}
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ user, onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [isSnowing, setIsSnowing] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [user.uid]);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUserProjects(user.uid);
      setProjects(data);
    } catch (err: any) {
      console.error("Failed to load projects", err);
      
      if (err.code === 'permission-denied') {
        setError(renderPermissionError());
        return;
      }
      
      if (err.code === 'failed-precondition' || err.message?.includes('requires an index')) {
          if (err.message?.includes('currently building')) {
              setError(renderIndexBuildingError());
              return;
          }
          const linkMatch = err.message?.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
          const link = linkMatch ? linkMatch[0] : "https://console.firebase.google.com/project/_/firestore/indexes";
          setError(renderIndexError(link));
          return;
      }

      setError(
            <div className="max-w-xl mx-auto mt-8 bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                <p className="text-red-400">Error loading projects: {err.message}</p>
                 <button 
                    onClick={loadProjects}
                    className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
                 >
                    <RefreshCw size={16} /> Retry
                 </button>
            </div>
      );
    } finally {
      setLoading(false);
    }
  };

  const renderIndexBuildingError = () => (
    <div className="max-w-2xl mx-auto mt-8 bg-dark-surface border border-lumina-500/30 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-lumina-500/10 p-6 border-b border-lumina-500/20 flex items-start gap-4">
            <div className="p-3 bg-lumina-500/20 rounded-lg shrink-0">
                <Hourglass className="text-lumina-400 animate-pulse" size={32} />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">Setting Up Database...</h3>
                <p className="text-gray-300 leading-relaxed">
                    Firebase is currently building the required index for your project. This is a one-time process that typically takes 2-5 minutes.
                </p>
            </div>
        </div>
        <div className="p-6 flex flex-col items-center text-center">
            <div className="flex items-center gap-3 text-lumina-400 mb-6 bg-lumina-900/20 px-4 py-2 rounded-full border border-lumina-500/20">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm font-medium">Build in progress</span>
            </div>
            <p className="text-gray-400 mb-6 max-w-lg text-sm">
                You can keep this page open. Click the button below occasionally to check if it's done.
            </p>
            <button 
                onClick={loadProjects}
                className="flex items-center gap-2 px-6 py-3 bg-lumina-600 hover:bg-lumina-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-lumina-900/20"
            >
                <RefreshCw size={18} /> Check Status
            </button>
        </div>
    </div>
  );

  const renderIndexError = (link: string) => (
    <div className="max-w-2xl mx-auto mt-8 bg-dark-surface border border-yellow-500/30 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-yellow-500/10 p-6 border-b border-yellow-500/20 flex items-start gap-4">
            <div className="p-3 bg-yellow-500/20 rounded-lg shrink-0">
                <AlertTriangle className="text-yellow-400" size={32} />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">Database Index Required</h3>
                <p className="text-gray-300 leading-relaxed">
                    Firestore requires a specific index to sort your projects by date. This is a one-time setup step required by Firebase.
                </p>
            </div>
        </div>
        <div className="p-6 flex flex-col items-center text-center">
            <p className="text-gray-400 mb-6 max-w-lg">
                Click the button below to automatically create the required index in your Firebase Console. It usually takes 2-3 minutes to build.
            </p>
            <a 
                href={link} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 px-6 py-3 bg-lumina-600 hover:bg-lumina-500 text-white rounded-lg font-medium transition-all hover:scale-105 shadow-lg shadow-lumina-900/20 mb-6"
            >
                <ExternalLink size={18} />
                Create Index Automatically
            </a>
            <div className="w-full h-px bg-gray-800 mb-6"></div>
            <button 
                onClick={loadProjects}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
            >
                <RefreshCw size={16} /> I've created the index, Retry
            </button>
        </div>
    </div>
  );

  const renderPermissionError = () => (
    <div className="max-w-3xl mx-auto mt-8 bg-dark-surface border border-red-500/30 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-red-500/10 p-6 border-b border-red-500/20 flex items-start gap-4">
            <div className="p-3 bg-red-500/20 rounded-lg shrink-0">
                <ShieldAlert className="text-red-400" size={32} />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">Database Permissions Missing</h3>
                <p className="text-gray-300 leading-relaxed">
                    The application cannot access your Firestore database. This happens because new Firebase projects default to "locked" security rules.
                </p>
            </div>
        </div>
        <div className="p-6 space-y-4">
            <div className="text-sm text-gray-400">
                <span className="text-white font-medium block mb-2">How to fix this:</span>
                <ol className="list-decimal pl-5 space-y-1">
                    <li>Go to the <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-lumina-400 hover:underline">Firebase Console</a>.</li>
                    <li>Navigate to <strong>Build</strong> &gt; <strong>Firestore Database</strong> &gt; <strong>Rules</strong> tab.</li>
                    <li>Replace the existing code with the rules below:</li>
                </ol>
            </div>
            <div className="bg-black border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto relative group">
                <pre>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      // Allow users to create projects where they are the owner
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      
      // Allow users to read, update, and delete their own projects
      allow read, update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}`}</pre>
            </div>
            <div className="flex justify-end pt-2">
                 <button 
                    onClick={loadProjects}
                    className="flex items-center gap-2 px-6 py-2 bg-lumina-600 hover:bg-lumina-500 text-white rounded-lg font-medium transition-colors"
                 >
                    <RefreshCw size={18} /> I've Updated the Rules, Try Again
                 </button>
            </div>
        </div>
    </div>
  );

  const handleCreate = async () => {
    setCreating(true);
    const name = `Untitled Project ${projects.length + 1}`;
    try {
        await createProject(user.uid, name);
        await loadProjects();
    } catch (e: any) {
        console.error(e);
        if (e.code === 'permission-denied') {
            setError(renderPermissionError());
        } else {
            alert("Failed to create project: " + e.message);
        }
    } finally {
        setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if(confirm('Are you sure you want to delete this project?')) {
          try {
            await deleteProject(id);
            await deleteVideoFromLocal(id);
            setProjects(prev => prev.filter(p => p.id !== id));
          } catch (err: any) {
              alert("Failed to delete: " + err.message);
          }
      }
  }

  const handleLogout = () => {
      auth.signOut();
  }

  return (
    <div className="min-h-screen bg-dark-bg p-8 relative overflow-hidden">
      {isSnowing && <Snowfall />}
      
      {/* Header */}
      <div className="max-w-6xl mx-auto flex items-center justify-between mb-12 relative z-10">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-lumina-500 to-blue-600 flex items-center justify-center font-bold text-white text-xl">L</div>
            <h1 className="text-2xl font-bold text-white">Lumina Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">Logged in as <span className="text-white font-medium">{user.displayName || user.email}</span></span>
            <button 
                onClick={handleLogout}
                className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                title="Sign Out"
            >
                <LogOut size={20} />
            </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Your Projects</h2>
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => setIsSnowing(!isSnowing)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                        isSnowing 
                        ? 'bg-blue-400/20 text-blue-300 border border-blue-400/30 shadow-[0_0_15px_rgba(147,197,253,0.3)]' 
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                    }`}
                >
                    <CloudSnow size={18} className={isSnowing ? 'animate-bounce' : ''} />
                    Snow
                </button>
                <button 
                    onClick={handleCreate}
                    disabled={creating || !!error}
                    className="flex items-center gap-2 px-4 py-2 bg-lumina-600 hover:bg-lumina-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    New Project
                </button>
            </div>
        </div>

        {error ? (
            error
        ) : loading ? (
            <div className="flex justify-center py-20">
                <Loader2 size={40} className="text-lumina-500 animate-spin" />
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.length === 0 ? (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-dark-border rounded-xl text-gray-500">
                        <Video size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No projects yet</p>
                        <p className="text-sm">Create a new project to start editing</p>
                    </div>
                ) : (
                    projects.map(project => (
                        <div 
                            key={project.id}
                            onClick={() => onSelectProject(project)}
                            className="group bg-dark-surface border border-dark-border rounded-xl overflow-hidden hover:border-lumina-500/50 transition-all cursor-pointer hover:shadow-xl hover:shadow-lumina-900/10 backdrop-blur-sm"
                        >
                            <div className="aspect-video bg-black/50 relative flex items-center justify-center group-hover:bg-black/40 transition-colors overflow-hidden">
                                {project.thumbnail ? (
                                    <img 
                                        src={project.thumbnail} 
                                        alt={project.name} 
                                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" 
                                    />
                                ) : (
                                    <Video size={32} className="text-gray-600 group-hover:text-lumina-400 transition-colors" />
                                )}
                            </div>
                            <div className="p-4">
                                <div className="flex items-start justify-between">
                                    <h3 className="font-medium text-white group-hover:text-lumina-400 transition-colors truncate pr-4">{project.name}</h3>
                                    <button 
                                        onClick={(e) => handleDelete(e, project.id)}
                                        className="text-gray-500 hover:text-red-400 transition-colors p-1"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                                    <Calendar size={12} />
                                    <span>Last edited {new Date(project.lastModified).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
