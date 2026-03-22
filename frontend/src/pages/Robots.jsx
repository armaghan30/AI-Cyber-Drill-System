import React, { useState } from 'react'
import { FaRobot, FaPlay, FaStop, FaEdit, FaTrash, FaPlus, FaSearch } from 'react-icons/fa'

const Robots = () => {
  const [robots, setRobots] = useState([
    { id: 1, name: 'Alpha Bot', status: 'active', type: 'Combat', lastActive: '2 hours ago' },
    { id: 2, name: 'Beta Bot', status: 'idle', type: 'Assistant', lastActive: '5 hours ago' },
    { id: 3, name: 'Gamma Bot', status: 'active', type: 'Security', lastActive: '1 hour ago' },
    { id: 4, name: 'Delta Bot', status: 'maintenance', type: 'Combat', lastActive: '1 day ago' },
    { id: 5, name: 'Epsilon Bot', status: 'active', type: 'Assistant', lastActive: '30 mins ago' },
  ])

  const [searchTerm, setSearchTerm] = useState('')

  const filteredRobots = robots.filter(robot =>
    robot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    robot.type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusColor = (status) => {
    switch(status) {
      case 'active': return 'bg-green-900/30 border border-green-700/50 text-green-400'
      case 'idle': return 'bg-gray-700/30 border border-gray-600/50 text-gray-400'
      case 'maintenance': return 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-400'
      default: return 'bg-gray-700/30 border border-gray-600/50 text-gray-400'
    }
  }

  const toggleRobotStatus = (id) => {
    setRobots(robots.map(robot => 
      robot.id === id 
        ? { ...robot, status: robot.status === 'active' ? 'idle' : 'active' }
        : robot
    ))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-green-100 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>Robots</h1>
          <p className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Manage your robot fleet</p>
        </div>
        <button className="flex items-center space-x-2 bg-transparent border-2 border-green-900/50 text-green-100 px-6 py-3 hover:bg-green-900/30 transition-colors shadow-xl" style={{ fontFamily: 'Gugi, sans-serif' }}>
          <FaPlus />
          <span>Add Robot</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-gray-800/40 backdrop-blur-md border-2 border-green-900/50 p-4 shadow-xl">
        <div className="relative">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-green-300/50" />
          <input
            type="text"
            placeholder="Search robots..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-900/50 border-2 border-green-900/50 text-green-100 placeholder-green-300/40 focus:outline-none focus:border-green-800 transition-all"
            style={{ fontFamily: 'Gugi, sans-serif' }}
          />
        </div>
      </div>

      {/* Robots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRobots.map((robot) => (
          <div key={robot.id} className="bg-gray-800/40 backdrop-blur-md border-2 border-green-900/50 p-6 hover:border-green-800 transition-all shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-900/30 border border-green-800/50 flex items-center justify-center">
                  <FaRobot className="text-green-300 text-xl" />
                </div>
                <div>
                  <h3 className="font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>{robot.name}</h3>
                  <p className="text-sm text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>{robot.type}</p>
                </div>
              </div>
              <span className={`px-3 py-1 text-xs font-semibold ${getStatusColor(robot.status)}`} style={{ fontFamily: 'Gugi, sans-serif' }}>
                {robot.status}
              </span>
            </div>

            <div className="mb-4">
              <p className="text-sm text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Last Active: <span className="font-medium text-green-100">{robot.lastActive}</span></p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => toggleRobotStatus(robot.id)}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 transition-colors border-2 ${
                  robot.status === 'active'
                    ? 'bg-green-900/30 border-green-700/50 text-green-300 hover:bg-green-900/40'
                    : 'bg-green-900/30 border-green-700/50 text-green-300 hover:bg-green-900/40'
                }`}
                style={{ fontFamily: 'Gugi, sans-serif' }}
              >
                {robot.status === 'active' ? <FaStop /> : <FaPlay />}
                <span>{robot.status === 'active' ? 'Stop' : 'Start'}</span>
              </button>
              <button className="p-2 text-green-300/70 hover:bg-green-900/30 border-2 border-green-900/50 hover:border-green-800 transition-colors">
                <FaEdit />
              </button>
              <button className="p-2 text-green-400 hover:bg-green-900/30 border-2 border-green-900/50 hover:border-green-800 transition-colors">
                <FaTrash />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredRobots.length === 0 && (
        <div className="text-center py-12 bg-gray-800/40 backdrop-blur-md border-2 border-green-900/50 shadow-xl">
          <FaRobot className="text-6xl text-green-900/50 mx-auto mb-4" />
          <p className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>No robots found</p>
        </div>
      )}
    </div>
  )
}

export default Robots

