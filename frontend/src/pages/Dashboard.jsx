import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

const Dashboard = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Welcome, {user.name}!</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Your Role</h2>
          <p className="text-gray-600">{user.role}</p>
        </div>

        {user.role === 'Local Authority' && (
          <div className="bg-blue-50 p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Authority Dashboard</h2>
            <p className="text-gray-600 mb-4">Manage retrofit projects and verifications</p>
            <a 
              href="/la-dashboard" 
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Go to Dashboard
            </a>
          </div>
        )}

        <div className="bg-green-50 p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <button className="block w-full text-left px-3 py-2 bg-white rounded border hover:bg-gray-50">
              View Projects
            </button>
            <button className="block w-full text-left px-3 py-2 bg-white rounded border hover:bg-gray-50">
              Add New Project
            </button>
            <button className="block w-full text-left px-3 py-2 bg-white rounded border hover:bg-gray-50">
              View Reports
            </button>
          </div>
        </div>

        <div className="bg-yellow-50 p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-2 text-sm">
            <p className="text-gray-600">No recent activity</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
