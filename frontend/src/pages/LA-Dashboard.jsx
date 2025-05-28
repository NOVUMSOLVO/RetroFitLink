import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import RetrofitTable from '../components/RetrofitTable';

const LADashboard = () => {
  const { user } = useContext(AuthContext);

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-3xl font-bold my-6">Local Authority Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Retrofit Projects</h2>
          <RetrofitTable authorityId={user?.authorityId} />
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Verification Center</h2>
          <div className="space-y-4">
            <div className="bg-green-100 p-4 rounded">
              <p className="text-green-800">Verified Projects: 23</p>
            </div>
            <div className="bg-yellow-100 p-4 rounded">
              <p className="text-yellow-800">Pending Verification: 8</p>
            </div>
            <div className="bg-blue-100 p-4 rounded">
              <p className="text-blue-800">In Progress: 15</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Blockchain Explorer</h2>
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Latest Transactions:</p>
            <div className="bg-gray-50 p-2 rounded text-xs">
              <p>0x1234...abcd</p>
              <p className="text-gray-500">2 mins ago</p>
            </div>
            <div className="bg-gray-50 p-2 rounded text-xs">
              <p>0x5678...efgh</p>
              <p className="text-gray-500">5 mins ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LADashboard;
