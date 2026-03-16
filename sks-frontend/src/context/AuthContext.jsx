import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [recruiter, setRecruiter] = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sks_token');
    if (token) {
      api.auth.me()
        .then(({ recruiter }) => setRecruiter(recruiter))
        .catch(() => localStorage.removeItem('sks_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const { token, recruiter } = await api.auth.login(email, password);
    localStorage.setItem('sks_token', token);
    setRecruiter(recruiter);
    return recruiter;
  };

  const logout = async () => {
    await api.auth.logout().catch(() => {});
    localStorage.removeItem('sks_token');
    setRecruiter(null);
  };

  return (
    <AuthContext.Provider value={{ recruiter, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
