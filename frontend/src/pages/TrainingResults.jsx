import React, { useState, useEffect } from 'react'
import { FaChartLine, FaFileAlt, FaImage, FaDownload, FaTable } from 'react-icons/fa'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../api'

const TOPOLOGY_OPTIONS = [
  { key: 'sample_topology', label: '2-Host Sample Network' },
  { key: 'topology_4host', label: '4-Host Network' },
  { key: 'topology_8host', label: '8-Host Network' },
]

const TrainingResults = () => {
  const [currentTopology, setCurrentTopology] = useState('sample_topology')
  const [redAgentRewards, setRedAgentRewards] = useState([])
  const [blueAgentRewards, setBlueAgentRewards] = useState([])
  const [availableCsvFiles, setAvailableCsvFiles] = useState([])
  const [availablePlotFiles, setAvailablePlotFiles] = useState([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [showRawDataTable, setShowRawDataTable] = useState(false)

  useEffect(() => {
    api.csvFiles().then(setAvailableCsvFiles).catch(() => {})
    api.plotFiles().then(setAvailablePlotFiles).catch(() => {})
  }, [])

  useEffect(() => {
    loadRewardDataForTopology(currentTopology)
  }, [currentTopology])

  const loadRewardDataForTopology = async (topologyName) => {
    setIsLoadingData(true)
    setErrorMessage(null)
    try {
      const [redRewards, blueRewards] = await Promise.all([
        api.csvRewards(`sb3_dqn_red_${topologyName}`),
        api.csvRewards(`sb3_dqn_blue_${topologyName}`),
      ])
      setRedAgentRewards(redRewards || [])
      setBlueAgentRewards(blueRewards || [])
    } catch (err) {
      setErrorMessage('Could not load training data. Make sure the backend is running.')
    } finally {
      setIsLoadingData(false)
    }
  }

  // combine red and blue into one dataset for the comparison chart
  const combinedRewardData = redAgentRewards.map((redRow, index) => ({
    episode: redRow.episode,
    redReward: redRow.reward,
    blueReward: blueAgentRewards[index] ? blueAgentRewards[index].reward : 0,
  }))

  // calculate some basic stats from the reward arrays
  const calculateStats = (rewardArray) => {
    if (!rewardArray.length) return { totalEpisodes: 0, meanReward: 0, maxReward: 0, minReward: 0 }
    const allRewards = rewardArray.map(row => row.reward)
    const sum = allRewards.reduce((acc, val) => acc + val, 0)
    return {
      totalEpisodes: allRewards.length,
      meanReward: (sum / allRewards.length).toFixed(2),
      maxReward: Math.max(...allRewards).toFixed(2),
      minReward: Math.min(...allRewards).toFixed(2),
    }
  }

  const redStats = calculateStats(redAgentRewards)
  const blueStats = calculateStats(blueAgentRewards)

  const currentTopologyLabel = TOPOLOGY_OPTIONS.find(t => t.key === currentTopology)?.label || currentTopology

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-green-100 mb-2" style={{ fontFamily: 'Gugi, sans-serif' }}>Training Results Archive</h1>
        <p className="text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>
          Pre-computed SB3 DQN training results — CSVs, reward plots, and performance logs
        </p>
        <p className="text-yellow-400/70 text-sm mt-1" style={{ fontFamily: 'Gugi, sans-serif' }}>
          Temporary 
        </p>
      </div>

      {/* topology selector buttons */}
      <div className="flex flex-wrap gap-3">
        {TOPOLOGY_OPTIONS.map((topologyOption) => (
          <button
            key={topologyOption.key}
            onClick={() => setCurrentTopology(topologyOption.key)}
            className={`px-5 py-2 border-2 text-sm transition-all ${
              currentTopology === topologyOption.key
                ? 'bg-green-900/50 border-green-500 text-green-100'
                : 'bg-gray-800/30 border-green-900/50 text-green-200/70 hover:border-green-700'
            }`}
            style={{ fontFamily: 'Gugi, sans-serif' }}
          >
            {topologyOption.label}
          </button>
        ))}
      </div>

      {isLoadingData ? (
        <div className="text-center py-12 text-green-200/70" style={{ fontFamily: 'Gugi, sans-serif' }}>Loading training data...</div>
      ) : errorMessage ? (
        <div className="text-center py-12 text-red-400" style={{ fontFamily: 'Gugi, sans-serif' }}>{errorMessage}</div>
      ) : (
        <>
          {/* stats cards for red and blue agents */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Red Episodes', value: redStats.totalEpisodes, color: 'text-red-400' },
              { label: 'Red Mean Reward', value: redStats.meanReward, color: 'text-red-400' },
              { label: 'Blue Episodes', value: blueStats.totalEpisodes, color: 'text-blue-400' },
              { label: 'Blue Mean Reward', value: blueStats.meanReward, color: 'text-blue-400' },
            ].map((card, idx) => (
              <div key={idx} className="bg-gray-800/30 border-2 border-green-900/50 p-4 shadow-xl">
                <p className="text-xs text-green-200/70 mb-1" style={{ fontFamily: 'Gugi, sans-serif' }}>{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`} style={{ fontFamily: 'Gugi, sans-serif' }}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* detailed stats breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-lg font-bold text-red-400 mb-4" style={{ fontFamily: 'Gugi, sans-serif' }}>Red Agent (Attacker) Stats</h2>
              <div className="space-y-2 text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>
                <div className="flex justify-between"><span className="text-green-200/70">Total Episodes Trained:</span><span className="text-green-100">{redStats.totalEpisodes}</span></div>
                <div className="flex justify-between"><span className="text-green-200/70">Average Reward Per Episode:</span><span className="text-green-100">{redStats.meanReward}</span></div>
                <div className="flex justify-between"><span className="text-green-200/70">Best Episode Reward:</span><span className="text-green-100">{redStats.maxReward}</span></div>
                <div className="flex justify-between"><span className="text-green-200/70">Worst Episode Reward:</span><span className="text-green-100">{redStats.minReward}</span></div>
              </div>
            </div>
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <h2 className="text-lg font-bold text-blue-400 mb-4" style={{ fontFamily: 'Gugi, sans-serif' }}>Blue Agent (Defender) Stats</h2>
              <div className="space-y-2 text-sm" style={{ fontFamily: 'Gugi, sans-serif' }}>
                <div className="flex justify-between"><span className="text-green-200/70">Total Episodes Trained:</span><span className="text-green-100">{blueStats.totalEpisodes}</span></div>
                <div className="flex justify-between"><span className="text-green-200/70">Average Reward Per Episode:</span><span className="text-green-100">{blueStats.meanReward}</span></div>
                <div className="flex justify-between"><span className="text-green-200/70">Best Episode Reward:</span><span className="text-green-100">{blueStats.maxReward}</span></div>
                <div className="flex justify-between"><span className="text-green-200/70">Worst Episode Reward:</span><span className="text-green-100">{blueStats.minReward}</span></div>
              </div>
            </div>
          </div>

          {/* combined reward chart */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-4" style={{ fontFamily: 'Gugi, sans-serif' }}>
              Red vs Blue Reward Comparison — {currentTopologyLabel}
            </h2>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={combinedRewardData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a3a1a" />
                <XAxis dataKey="episode" stroke="#4ade80" tick={{ fontSize: 11 }} label={{ value: 'Episode', position: 'insideBottom', offset: -5, fill: '#4ade80' }} />
                <YAxis stroke="#4ade80" tick={{ fontSize: 11 }} label={{ value: 'Reward', angle: -90, position: 'insideLeft', fill: '#4ade80' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #166534', color: '#4ade80' }} />
                <Legend />
                <Line type="monotone" dataKey="redReward" stroke="#ef4444" dot={false} strokeWidth={2} name="Red Agent (Attacker)" />
                <Line type="monotone" dataKey="blueReward" stroke="#3b82f6" dot={false} strokeWidth={2} name="Blue Agent (Defender)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* matplotlib generated plot image */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-green-100 mb-4" style={{ fontFamily: 'Gugi, sans-serif' }}>
              Smoothed Training Plot (Generated by Matplotlib)
            </h2>
            <img
              src={api.plotUrl(`sb3_dqn_training_${currentTopology}`)}
              alt={`DQN training reward plot for ${currentTopologyLabel}`}
              className="w-full border border-green-900/30"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          </div>

          {/* available files listing */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <div className="flex items-center space-x-2 mb-4">
                <FaTable className="text-green-300" />
                <h2 className="text-lg font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>CSV Training Files</h2>
              </div>
              <div className="space-y-2">
                {availableCsvFiles.map((csvFile, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-900/20 border border-green-900/30">
                    <div>
                      <p className="text-sm text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>{csvFile.filename}.csv</p>
                      <p className="text-xs text-green-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>
                        {csvFile.agent_role.toUpperCase()} agent — {csvFile.algorithm.toUpperCase()} — {csvFile.topology}
                      </p>
                    </div>
                    <FaFileAlt className="text-green-300/50" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
              <div className="flex items-center space-x-2 mb-4">
                <FaImage className="text-green-300" />
                <h2 className="text-lg font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Plot Image Files</h2>
              </div>
              <div className="space-y-2">
                {availablePlotFiles.map((plotFile, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-900/20 border border-green-900/30">
                    <div>
                      <p className="text-sm text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>{plotFile.filename}.png</p>
                      <p className="text-xs text-green-200/50" style={{ fontFamily: 'Gugi, sans-serif' }}>Matplotlib reward curve</p>
                    </div>
                    <FaImage className="text-green-300/50" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* raw data table toggle */}
          <div className="bg-gray-800/30 border-2 border-green-900/50 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>Raw Reward Data</h2>
              <button
                onClick={() => setShowRawDataTable(!showRawDataTable)}
                className="px-4 py-2 border border-green-900/50 text-green-200 text-sm hover:bg-green-900/30 transition-colors"
                style={{ fontFamily: 'Gugi, sans-serif' }}
              >
                {showRawDataTable ? 'Hide Table' : 'Show Table'}
              </button>
            </div>
            {showRawDataTable && (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-900/90">
                    <tr className="text-green-200/70 border-b border-green-900/30" style={{ fontFamily: 'Gugi, sans-serif' }}>
                      <th className="p-2 text-left">Episode</th>
                      <th className="p-2 text-right">Red Reward</th>
                      <th className="p-2 text-right">Blue Reward</th>
                      <th className="p-2 text-left">Topology</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedRewardData.slice(0, 200).map((row, idx) => (
                      <tr key={idx} className="border-b border-green-900/20 text-green-100" style={{ fontFamily: 'Gugi, sans-serif' }}>
                        <td className="p-2">{row.episode}</td>
                        <td className="p-2 text-right text-red-400">{row.redReward.toFixed(2)}</td>
                        <td className="p-2 text-right text-blue-400">{row.blueReward.toFixed(2)}</td>
                        <td className="p-2 text-green-200/50">{currentTopology}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default TrainingResults
