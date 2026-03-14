import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import './index.css';
    
import Layout        from './components/layout/Layout.jsx';
import LoginPage     from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import JobsPage      from './pages/JobsPage.jsx';
import JobDetailPage from './pages/JobDetailPage.jsx';
import CandidatesPage from './pages/CandidatesPage.jsx';
import SessionPage   from './pages/SessionPage.jsx';
import InterviewPage from './pages/InterviewPage.jsx';

function ProtectedRoute({ children }) {
  const { recruiter, loading } = useAuth();
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
    </div>
  );
  return recruiter ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/interview/:token" element={<InterviewPage />} />

          {/* Protected recruiter portal */}
          <Route path="/" element={
            <ProtectedRoute><Layout /></ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"          element={<DashboardPage />} />
            <Route path="jobs"               element={<JobsPage />} />
            <Route path="jobs/:id"           element={<JobDetailPage />} />
            <Route path="candidates"         element={<CandidatesPage />} />
            <Route path="sessions/:id"       element={<SessionPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
