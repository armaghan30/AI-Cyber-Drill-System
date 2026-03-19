import React, { useState } from 'react'
import { FaUser, FaEnvelope, FaPhone, FaEdit, FaTrash, FaPlus, FaSearch, FaFilter } from 'react-icons/fa'

const Users = () => {
  const [users, setUsers] = useState([
    { id: 1, name: 'John Doe', email: 'john@example.com', phone: '+1 234 567 8900', role: 'Admin', status: 'active' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', phone: '+1 234 567 8901', role: 'User', status: 'active' },
    { id: 3, name: 'Bob Johnson', email: 'bob@example.com', phone: '+1 234 567 8902', role: 'User', status: 'inactive' },
    { id: 4, name: 'Alice Williams', email: 'alice@example.com', phone: '+1 234 567 8903', role: 'Moderator', status: 'active' },
    { id: 5, name: 'Charlie Brown', email: 'charlie@example.com', phone: '+1 234 567 8904', role: 'User', status: 'active' },
  ])

  const [searchTerm, setSearchTerm] = useState('')

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>Users</h1>
          <p className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Manage user accounts and permissions</p>
        </div>
        <button className="flex items-center space-x-2 bg-transparent border-2 border-green-900/50 text-green-100 px-6 py-3 hover:bg-green-900/30 transition-colors shadow-xl" style={{ fontFamily: 'Gugi, sans-serif' }}>
          <FaPlus />
          <span>Add User</span>
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-gray-800/40 backdrop-blur-md border-2 border-green-900/50 p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-green-300/50" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-900/50 border-2 border-green-900/50 text-green-100 placeholder-green-300/40 focus:outline-none focus:border-green-800 transition-all"
              style={{ fontFamily: 'Gugi, sans-serif' }}
            />
          </div>
          <button className="flex items-center space-x-2 px-6 py-3 border-2 border-green-900/50 bg-gray-900/50 text-green-100 hover:bg-green-900/30 transition-colors" style={{ fontFamily: 'Gugi, sans-serif' }}>
            <FaFilter />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-gray-800/40 backdrop-blur-md border-2 border-green-900/50 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900/50 border-b-2 border-green-900/30">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-green-200 uppercase tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>User</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-green-200 uppercase tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>Email</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-green-200 uppercase tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>Phone</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-green-200 uppercase tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>Role</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-green-200 uppercase tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-green-200 uppercase tracking-wider" style={{ fontFamily: 'Gugi, sans-serif' }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-green-900/30">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-900/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-900/30 border border-green-800/50 rounded-full flex items-center justify-center">
                        <FaUser className="text-green-300" />
                      </div>
                      <span className="font-medium text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>{user.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2 text-green-200/70">
                      <FaEnvelope className="text-sm" />
                      <span style={{ fontFamily: 'Gugi, sans-serif' }}>{user.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-green-200/70">
                    <div className="flex items-center space-x-2">
                      <FaPhone className="text-sm" />
                      <span style={{ fontFamily: 'Gugi, sans-serif' }}>{user.phone}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 text-xs font-semibold bg-blue-900/30 border border-blue-700/50 text-blue-300" style={{ fontFamily: 'Gugi, sans-serif' }}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 text-xs font-semibold ${
                      user.status === 'active' 
                        ? 'bg-green-900/30 border border-green-700/50 text-green-300' 
                        : 'bg-gray-700/30 border border-gray-600/50 text-gray-400'
                    }`} style={{ fontFamily: 'Gugi, sans-serif' }}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <button className="p-2 text-green-300/70 hover:bg-green-900/30 border border-green-900/50 hover:border-green-800 transition-colors">
                        <FaEdit />
                      </button>
                      <button className="p-2 text-green-400 hover:bg-green-900/30 border border-green-900/50 hover:border-green-800 transition-colors">
                        <FaTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 bg-gray-800/40 backdrop-blur-md border-2 border-green-900/50 shadow-xl">
          <FaUser className="text-6xl text-green-900/50 mx-auto mb-4" />
          <p className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>No users found</p>
        </div>
      )}
    </div>
  )
}

export default Users

