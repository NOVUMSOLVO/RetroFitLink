import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../config/environment';

const RetrofitTable = ({ authorityId }) => {
  const [retrofits, setRetrofits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRetrofits();
  }, [authorityId]);

  const fetchRetrofits = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${config.apiUrl}/api/retrofits`, {
        timeout: config.apiTimeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      setRetrofits(response.data);
    } catch (err) {
      setError('Failed to fetch retrofits');
      if (config.enableDebugLogs) {
        console.error('Retrofit fetch error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Planned': 'bg-gray-100 text-gray-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      'Completed': 'bg-green-100 text-green-800',
      'Verified': 'bg-purple-100 text-purple-800',
      'Financed': 'bg-yellow-100 text-yellow-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <div className="text-center py-4">Loading retrofits...</div>;
  }

  if (error) {
    return <div className="text-red-600 text-center py-4">{error}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Property
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Installer
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {retrofits.length === 0 ? (
            <tr>
              <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                No retrofits found
              </td>
            </tr>
          ) : (
            retrofits.map((retrofit) => (
              <tr key={retrofit._id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {retrofit.propertyId?.address || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {retrofit.type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(retrofit.status)}`}>
                    {retrofit.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {retrofit.installer?.name || 'Unassigned'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button className="text-indigo-600 hover:text-indigo-900 mr-3">
                    View
                  </button>
                  <button className="text-green-600 hover:text-green-900">
                    Verify
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default RetrofitTable;
