import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaBrain, FaShieldAlt, FaNetworkWired, FaChartBar,
  FaArrowRight, FaRocket, FaDatabase, FaCrosshairs,
  FaLock, FaChevronDown
} from 'react-icons/fa'

const font = { fontFamily: 'Gugi, sans-serif' }

const Home = () => {
  const navigate = useNavigate()
  const [visibleSections, setVisibleSections] = useState({})
  const [typedText, setTypedText] = useState('')
  const fullText = 'Secure your network with AI-driven attack and defense simulations'

  // typing animation for the tagline
  useEffect(() => {
    let i = 0
    const timer = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i))
        i++
      } else {
        clearInterval(timer)
      }
    }, 35)
    return () => clearInterval(timer)
  }, [])

  // fade-in sections on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisibleSections(prev => ({ ...prev, [entry.target.id]: true }))
          }
        })
      },
      { threshold: 0.15 }
    )
    document.querySelectorAll('.fade-section').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const features = [
    {
      icon: FaBrain, title: 'AI Orchestrator',
      desc: 'Central brain of the system. Manages all simulations, coordinates Red and Blue agents, and controls the training pipeline.',
      path: '/ai-orchestrator', color: 'text-purple-400', border: 'border-purple-600/30'
    },
    {
      icon: FaChartBar, title: 'Analytics',
      desc: 'Simulation results, training curves, performance metrics, and defense analysis — all in one place.',
      path: '/analytics', color: 'text-green-400', border: 'border-green-600/30'
    },
    {
      icon: FaShieldAlt, title: 'Security Report',
      desc: 'Full security assessment with CVE inventory, firewall recommendations, isolation strategies, and PDF download.',
      path: '/report', color: 'text-blue-400', border: 'border-blue-600/30'
    },
    {
      icon: FaDatabase, title: 'Training Results',
      desc: 'Browse pre-computed DQN training data — CSVs, reward plots, and raw episode data for all network topologies.',
      path: '/training-results', color: 'text-yellow-400', border: 'border-yellow-600/30'
    },
    {
      icon: FaCrosshairs, title: 'Network Monitor',
      desc: 'View detailed host information, network topology, services, and vulnerabilities from your uploaded YAML.',
      path: '/network-monitor', color: 'text-cyan-400', border: 'border-cyan-600/30'
    },
  ]

  const howItWorks = [
    { step: '01', title: 'Upload Network Topology', desc: 'Define your network as a YAML file — hosts, services, vulnerabilities, and connections.' },
    { step: '02', title: 'AI Agents Train', desc: 'Red (attacker) and Blue (defender) agents learn optimal strategies using Deep Q-Networks (DQN).' },
    { step: '03', title: 'Run Simulations', desc: 'Pit the trained agents against each other. Watch each step — scans, exploits, patches, and isolations.' },
    { step: '04', title: 'Analyse & Report', desc: 'Get a full security report with defense effectiveness scores, vulnerability analysis, and recommendations.' },
  ]

  return (
    <div className="space-y-12 pb-12">
      {/* Hero Section */}
      <div className="text-center py-16 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/10 to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex items-center justify-center gap-3 mb-6">
            <FaShieldAlt className="text-green-400 text-4xl animate-pulse" />
            <h1 className="text-5xl md:text-6xl font-bold text-green-100" style={font}>
              CyberDrill
            </h1>
          </div>
          <p className="text-xl md:text-2xl text-green-200/80 max-w-3xl mx-auto mb-2" style={font}>
            AI-Powered Cyber Drill System
          </p>
          <p className="text-lg text-green-300/60 max-w-2xl mx-auto h-8" style={font}>
            {typedText}<span className="animate-pulse">|</span>
          </p>

          <div className="flex items-center justify-center gap-4 mt-10">
            <button
              onClick={() => navigate('/ai-orchestrator')}
              className="flex items-center gap-2 px-8 py-4 bg-green-900/40 border-2 border-green-500 text-green-100 hover:bg-green-900/60 transition-all text-lg"
              style={font}
            >
              <FaRocket /> Get Started
            </button>
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-2 px-8 py-4 border-2 border-green-900/50 text-green-200/70 hover:bg-green-900/20 transition-all text-lg"
              style={font}
            >
              Learn More <FaChevronDown />
            </button>
          </div>
        </div>
      </div>

      {/* What is CyberDrill */}
      <div
        id="about"
        className={`fade-section bg-gray-800/30 border-2 border-green-900/40 p-8 shadow-xl transition-all duration-700 ${visibleSections['about'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <h2 className="text-2xl font-bold text-green-100 mb-4" style={font}>What is CyberDrill?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-green-200/70 space-y-3 text-sm leading-relaxed" style={font}>
            <p>
              CyberDrill is an AI-powered cyber security drill platform that uses reinforcement learning
              to simulate realistic attack and defense scenarios on virtual network topologies.
            </p>
            <p>
              The system trains two AI agents — a <span className="text-red-400 font-bold">Red Agent</span> (attacker)
              and a <span className="text-blue-400 font-bold">Blue Agent</span> (defender) — using
              Deep Q-Network (DQN) algorithms from Stable Baselines3.
            </p>
            <p>
              Organizations can use this platform to test their network security, identify vulnerabilities,
              and get AI-generated recommendations to strengthen their defenses.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Reinforcement Learning', desc: 'SB3 DQN agents that learn over thousands of episodes', icon: FaBrain },
              { label: 'YAML Topologies', desc: 'Define any network structure with hosts, services, and CVEs', icon: FaNetworkWired },
              { label: 'Security Reports', desc: 'Auto-generated reports with risk scores and action items', icon: FaLock },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-900/30 border border-green-900/30">
                  <Icon className="text-green-400 text-lg mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-green-100 font-semibold text-sm" style={font}>{item.label}</p>
                    <p className="text-green-200/50 text-xs" style={font}>{item.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div
        id="how-it-works"
        className={`fade-section transition-all duration-700 ${visibleSections['how-it-works'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <h2 className="text-2xl font-bold text-green-100 mb-6 text-center" style={font}>How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {howItWorks.map((item, i) => (
            <div key={i} className="bg-gray-800/30 border-2 border-green-900/40 p-6 shadow-xl relative group hover:border-green-700/50 transition-all">
              <div className="text-4xl font-bold text-green-900/40 mb-3" style={font}>{item.step}</div>
              <h3 className="text-lg font-bold text-green-100 mb-2" style={font}>{item.title}</h3>
              <p className="text-green-200/60 text-sm" style={font}>{item.desc}</p>
              {i < howItWorks.length - 1 && (
                <FaArrowRight className="hidden lg:block absolute right-[-20px] top-1/2 -translate-y-1/2 text-green-700/40 text-xl z-10" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Features Grid */}
      <div
        id="features"
        className={`fade-section transition-all duration-700 ${visibleSections['features'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <h2 className="text-2xl font-bold text-green-100 mb-6 text-center" style={font}>System Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feat, i) => {
            const Icon = feat.icon
            return (
              <button
                key={i}
                onClick={() => navigate(feat.path)}
                className={`bg-gray-800/30 border-2 ${feat.border} p-6 shadow-xl text-left hover:bg-gray-800/50 hover:scale-[1.02] transition-all group`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Icon className={`${feat.color} text-2xl group-hover:scale-110 transition-transform`} />
                  <h3 className="text-lg font-bold text-green-100" style={font}>{feat.title}</h3>
                </div>
                <p className="text-green-200/60 text-sm leading-relaxed" style={font}>{feat.desc}</p>
                <div className="flex items-center gap-1 mt-4 text-green-300/40 group-hover:text-green-300/70 transition-colors text-xs" style={font}>
                  Open <FaArrowRight className="text-[10px]" />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Quick Start CTA */}
      <div
        id="cta"
        className={`fade-section bg-gradient-to-r from-green-900/30 to-blue-900/20 border-2 border-green-800/40 p-8 text-center shadow-xl transition-all duration-700 ${visibleSections['cta'] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <h2 className="text-2xl font-bold text-green-100 mb-3" style={font}>Ready to drill?</h2>
        <p className="text-green-200/60 mb-6 max-w-xl mx-auto" style={font}>
          Head to the AI Orchestrator to upload a network topology, run simulations, and train your agents.
        </p>
        <button
          onClick={() => navigate('/ai-orchestrator')}
          className="flex items-center gap-2 px-8 py-4 bg-green-900/40 border-2 border-green-500 text-green-100 hover:bg-green-900/60 transition-all text-lg mx-auto"
          style={font}
        >
          <FaBrain /> Launch Orchestrator
        </button>
      </div>
    </div>
  )
}

export default Home
