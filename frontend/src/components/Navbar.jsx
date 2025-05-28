import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-indigo-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <Link to="/" className="text-xl font-bold">
            RetroFitLink
          </Link>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="text-indigo-200">Hello, {user.name}</span>
                <span className="text-xs bg-indigo-500 px-2 py-1 rounded">
                  {user.role}
                </span>
                {user.role === 'Local Authority' && (
                  <Link 
                    to="/la-dashboard" 
                    className="hover:text-indigo-200"
                  >
                    Dashboard
                  </Link>
                )}
                <button 
                  onClick={logout}
                  className="bg-indigo-700 hover:bg-indigo-800 px-3 py-1 rounded"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-indigo-200">
                  Login
                </Link>
                <Link 
                  to="/register" 
                  className="bg-indigo-700 hover:bg-indigo-800 px-3 py-1 rounded"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
