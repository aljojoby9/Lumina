import React, { useState } from 'react';
import { auth } from '../firebaseConfig';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Mail, Lock, User, ArrowRight, AlertCircle, Settings, WifiOff } from 'lucide-react';

interface AuthProps {
  onSuccess: () => void;
}

const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getFriendlyErrorMessage = (errorCode: string, defaultMessage: string) => {
    switch (errorCode) {
      case 'auth/api-key-not-valid':
      case 'auth/invalid-api-key':
      case 'auth/internal-error':
        return "Configuration Missing: Please update firebaseConfig.ts with your actual Firebase project credentials.";
      case 'auth/invalid-email':
        return "Please enter a valid email address.";
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return "Invalid email or password.";
      case 'auth/email-already-in-use':
        return "An account already exists with this email address.";
      case 'auth/weak-password':
        return "Password should be at least 6 characters.";
      case 'auth/network-request-failed':
        return "Network Error: Unable to connect to authentication server. Please check your internet connection, or if you are using an ad-blocker/VPN, try disabling it.";
      default:
        return defaultMessage;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
            displayName: name
        });
      }
      onSuccess();
    } catch (err: any) {
      console.error("Auth Error:", err);
      const errorCode = err.code;
      const errorMessage = err.message ? err.message.replace('Firebase:', '').trim() : "An unknown error occurred";
      setError(getFriendlyErrorMessage(errorCode, errorMessage));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-dark-surface border border-dark-border rounded-2xl p-8 shadow-2xl">
        
        <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-lumina-500 to-blue-600 mb-4">
                <span className="text-2xl font-bold text-white">L</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
                {isLogin ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="text-gray-400 text-sm">
                {isLogin ? 'Enter your details to access your workspace' : 'Start creating amazing videos with AI'}
            </p>
        </div>

        {error && (
            <div className={`mb-6 p-3 rounded-lg flex items-start gap-2 text-sm ${error.includes("Configuration") ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-200" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                {error.includes("Configuration") ? <Settings size={16} className="mt-0.5 shrink-0" /> : 
                 error.includes("Network Error") ? <WifiOff size={16} className="mt-0.5 shrink-0" /> :
                 <AlertCircle size={16} className="mt-0.5 shrink-0" />}
                <span>{error}</span>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400 ml-1">Full Name</label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input 
                            type="text" 
                            required 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black border border-dark-border rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-lumina-500 focus:outline-none transition-colors"
                            placeholder="John Doe"
                        />
                    </div>
                </div>
            )}

            <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 ml-1">Email Address</label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                        type="email" 
                        required 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-black border border-dark-border rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-lumina-500 focus:outline-none transition-colors"
                        placeholder="john@example.com"
                    />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400 ml-1">Password</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                        type="password" 
                        required 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-black border border-dark-border rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-lumina-500 focus:outline-none transition-colors"
                        placeholder="••••••••"
                    />
                </div>
            </div>

            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-lumina-600 hover:bg-lumina-500 text-white font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? <div className="loader"></div> : (
                    <>
                        {isLogin ? 'Sign In' : 'Create Account'}
                        <ArrowRight size={18} />
                    </>
                )}
            </button>
        </form>

        <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button 
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-lumina-400 hover:text-lumina-300 font-medium ml-1"
                >
                    {isLogin ? 'Sign up' : 'Log in'}
                </button>
            </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;