import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { auth } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  skipLogin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/popup-blocked') {
        setError('Popup blocked! Please allow popups or open in a new tab.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized in Firebase Console. Try "Skip Login" for now.');
      } else {
        setError(`Login failed: ${err.message}`);
      }
    }
  };

  const skipLogin = () => {
    // Mock a user for preview purposes
    setUser({
      uid: 'preview-user',
      displayName: 'Preview User',
      email: 'preview@example.com',
    } as User);
    setLoading(false);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, error, skipLogin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
