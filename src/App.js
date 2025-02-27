import React, { useState, useEffect } from 'react';
import { LineChart, BarChart, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, Cell } from 'recharts';
import * as XLSX from 'xlsx';

const FinancialDashboard = () => {
  const [data, setData] = useState({
    keyMetrics: {
      totalRevenue: 0,
      totalTransactions: 0,
      totalUsers: 0,
      activeUsers: 0
    },
    currencyData: [],
    monthlyTrends: [],
    mtdGrowth: [],
    growthRates: {
      user: [],
      revenue: [],
      volume: []
    },
    exchangeRates: {}
  });
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Format numbers helper function
  const formatNumber = (num, decimals = 0) => {
    if (num === null || num === undefined) return 'N/A';
    
    // For very large numbers (millions+)
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    }
    // For large numbers (thousands)
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    
    return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Format percentage helper
  const formatPercent = (num) => {
    if (num === null || num === undefined || !isFinite(num)) return 'N/A';
    return num.toFixed(1) + '%';
  };
  
  // Helper for log scale data transformation
  const transformForLogScale = (dataArray, keys) => {
    return dataArray.map(item => {
      const newItem = {...item};
      keys.forEach(key => {
        // Replace zeros and negative values with a small positive number
        if (newItem[key] <= 0) {
          newItem[key] = 0.1; // Small value that works with log scale
        }
      });
      return newItem;
    });
  };

  // Colors for charts
  const COLORS = {
    users: '#8884d8',
    revenue: '#FF8042',
    volume: '#00C49F',
    positive: '#4CAF50',
    neutral: '#FFD700',
    negative: '#F44336'
  };

  // Get color based on growth value
  const getGrowthColor = (value) => {
    if (value > 10) return COLORS.positive;
    if (value < 0) return COLORS.negative;
    return COLORS.neutral;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Read Excel file using fetch for browser environment
        const response = await fetch('/financial_analysis_20250227_115233.xlsx')
          .then(res => {
            if (!res.ok) {
              throw new Error(`Failed to fetch Excel file (${res.status})`);
            }
            return res.arrayBuffer();
          })
          .catch(err => {
            console.error("Error loading Excel file:", err);
            throw err;
          });

        // Extract sheet data helper function
        const extractSheetData = (sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return XLSX.utils.sheet_to_json(sheet, {raw: false});
        };

        // Get data from key sheets
        const revenueSummary = extractSheetData('Revenue_Summary');
        const currencySummary = extractSheetData('Currency_Summary');
        const userStats = extractSheetData('User_Statistics');
        const mtdSummary = extractSheetData('MTD_Summary');
        const walletBalances = extractSheetData('Wallet_Balances');
        const monthlyTransactionCount = extractSheetData('Monthly_Transaction_Count');
        const monthlyRevenue = extractSheetData('Monthly_Revenue');
        const monthlyActiveUsers = extractSheetData('Monthly_Active_Users');
        const monthlyVolume = extractSheetData('Monthly_Transaction_Volume');

        // Calculate active users (transactions in the last 30 days) from Wallet_Balances
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        const activeUsers = walletBalances.filter(user => {
          if (!user['Last Transaction']) return false;
          const lastTransactionDate = new Date(user['Last Transaction']);
          return lastTransactionDate >= thirtyDaysAgo;
        });
        
        const activeUsersCount = activeUsers.length;

        // Use fixed exchange rates instead of calculating from data
        const exchangeRates = {
          'UGX': 1/28.4659,  // 1 UGX to KES
          'USD': 129.3827,   // 1 USD to KES
          'NGN': 1/11.59,    // 1 NGN to KES
          'CNY': 17.80       // 1 CNY to KES
        };

        // Build key metrics
        const keyMetrics = {
          totalRevenue: 0,
          totalTransactions: 0,
          totalUsers: 0,
          activeUsers: activeUsersCount
        };

        // Calculate total revenue in KES using fixed exchange rates
        let totalRevenueKES = 0;
        currencySummary.forEach(row => {
          const currency = row.Currency;
          const feeOriginal = parseFloat(row.Total_Fees_Original.replace(/,/g, ''));
          
          if (currency === 'KES') {
            totalRevenueKES += feeOriginal;
          } else if (exchangeRates[currency]) {
            totalRevenueKES += feeOriginal * exchangeRates[currency];
          }
        });

        // From Revenue Summary
        revenueSummary.forEach(item => {
          if (item.Metric === 'Total Successful Transactions') {
            keyMetrics.totalTransactions = parseInt(item.Value.replace(/,/g, ''));
          }
        });
        
        // Use our calculated KES total
        keyMetrics.totalRevenue = totalRevenueKES;

        // From User Statistics
        userStats.forEach(item => {
          if (item.Metric === 'Total Users') {
            keyMetrics.totalUsers = parseInt(item.Value.replace(/,/g, ''));
          }
        });

        // Build monthly trends data (exclude the "Total" row)
        const rawMonthlyTrends = monthlyTransactionCount
          .filter(item => item.YearMonth !== 'Total')
          .map(item => {
            const yearMonth = item.YearMonth;
            const revenueRow = monthlyRevenue.find(r => r.YearMonth === yearMonth);
            const users = monthlyActiveUsers.find(u => u.YearMonth === yearMonth) || {};
            const volume = monthlyVolume.find(v => v.YearMonth === yearMonth) || {};
            
            // Convert all currency revenues to KES and sum them
            let totalKESRevenue = 0;
            if (revenueRow) {
              // KES is already in KES, no conversion needed
              if (revenueRow.KES) totalKESRevenue += parseFloat(revenueRow.KES || 0);
              
              // Convert other currencies to KES
              if (revenueRow.NGN && revenueRow.NGN !== '') 
                totalKESRevenue += parseFloat(revenueRow.NGN) * exchangeRates.NGN;
              
              if (revenueRow.UGX && revenueRow.UGX !== '') 
                totalKESRevenue += parseFloat(revenueRow.UGX) * exchangeRates.UGX;
              
              if (revenueRow.USD && revenueRow.USD !== '') 
                totalKESRevenue += parseFloat(revenueRow.USD) * exchangeRates.USD;
              
              if (revenueRow.CNY && revenueRow.CNY !== '') 
                totalKESRevenue += parseFloat(revenueRow.CNY) * exchangeRates.CNY;
            }
            
            return {
              month: yearMonth,
              transactions: parseInt(item.Total || 0),
              revenue: totalKESRevenue,
              users: parseInt(users.Total || 0),
              volume: parseFloat(volume.Total || 0)
            };
          });

        // Calculate month-over-month growth rates
        const rawGrowthRates = {
          user: [],
          revenue: [],
          volume: []
        };

        for (let i = 1; i < rawMonthlyTrends.length; i++) {
          const prevMonth = rawMonthlyTrends[i - 1];
          const currentMonth = rawMonthlyTrends[i];
          
          // User growth
          const userGrowth = prevMonth.users > 0 
            ? ((currentMonth.users - prevMonth.users) / prevMonth.users) * 100 
            : null;
          
          // Revenue growth
          const revenueGrowth = prevMonth.revenue > 0 
            ? ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100 
            : null;
          
          // Volume growth
          const volumeGrowth = prevMonth.volume > 0 
            ? ((currentMonth.volume - prevMonth.volume) / prevMonth.volume) * 100 
            : null;
          
          rawGrowthRates.user.push({
            month: currentMonth.month,
            growth: userGrowth,
            users: currentMonth.users
          });
          
          rawGrowthRates.revenue.push({
            month: currentMonth.month,
            growth: revenueGrowth,
            revenue: currentMonth.revenue
          });
          
          rawGrowthRates.volume.push({
            month: currentMonth.month,
            growth: volumeGrowth,
            volume: currentMonth.volume
          });
        }

        // Fix MTD Growth metrics with original currency revenue from Monthly_Revenue
        const mtdGrowthData = mtdSummary.map(item => {
          const currency = item.Currency;
          
          // Get the correct current month and previous month revenue from Monthly_Revenue
          const currentMonthData = monthlyRevenue.find(m => m.YearMonth === '2025-02');
          const previousMonthData = monthlyRevenue.find(m => m.YearMonth === '2025-01');
          
          // Access the correct currency column and parse to float
          const currentRevenue = currentMonthData && currentMonthData[currency] ? 
            parseFloat(currentMonthData[currency]) : 0;
            
          const previousRevenue = previousMonthData && previousMonthData[currency] ? 
            parseFloat(previousMonthData[currency]) : 0;
          
          // Calculate growth correctly
          let revenueGrowth = 0;
          if (previousRevenue > 0) {
            revenueGrowth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
          } else if (currentRevenue > 0) {
            revenueGrowth = 100; // If previous was 0 but current is not, show as 100% growth
          }
          
          return {
            currency,
            transactionCountGrowth: parseFloat(item.Transaction_Count_MTD_Growth || 0),
            transactionVolumeGrowth: parseFloat(item.Transaction_Volume_MTD_Growth || 0),
            currentRevenue,
            previousRevenue,
            revenueGrowth,
            currentTransactionCount: parseFloat(item.Current_Transaction_Count || 0),
            currentTransactionVolume: parseFloat(item.Current_Transaction_Volume || 0),
            exchangeRate: currency === 'KES' ? 1 : (exchangeRates[currency] || 1)
          };
        });

        // Get transaction data from Currency_Summary for Volume tab
        const transactionData = currencySummary.map(item => ({
          currency: item.Currency,
          transactions: parseInt(item.Transactions.replace(/,/g, '')),
          volume: parseFloat(item.Total_Volume.replace(/,/g, '')),
          fees: parseFloat(item.Total_Fees_Original.replace(/,/g, ''))
        }));

        // Prepare data for log scale charts
        const preparedMonthlyTrends = transformForLogScale(rawMonthlyTrends, ['transactions', 'revenue', 'users', 'volume']);
        const preparedGrowthRates = {
          user: transformForLogScale(rawGrowthRates.user, ['users']),
          revenue: transformForLogScale(rawGrowthRates.revenue, ['revenue']),
          volume: transformForLogScale(rawGrowthRates.volume, ['volume'])
        };
        
        // Set all the dashboard data
        setData({
          keyMetrics,
          currencyData: transactionData,
          monthlyTrends: preparedMonthlyTrends,
          mtdGrowth: mtdGrowthData,
          growthRates: preparedGrowthRates,
          exchangeRates
        });
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl font-semibold">Loading financial data...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header with Logo */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-4" style={{ height: "50px" }}>
              {/* The logo image needs to be hosted somewhere or imported in your project */}
              <img 
                src="/alpha-tribe-logo.png" 
                alt="Alpha Tribe Performance Logo" 
                className="h-full"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.style.display = 'none';
                }}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Alpha Tribe Performance</h1>
              <p className="text-gray-600">Data as of February 27, 2025</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex mb-6 bg-white rounded-lg shadow overflow-hidden">
          <button 
            className={`px-4 py-3 font-medium ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('overview')}
          >
            Growth Overview
          </button>
          <button 
            className={`px-4 py-3 font-medium ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('users')}
          >
            User Growth
          </button>
          <button 
            className={`px-4 py-3 font-medium ${activeTab === 'revenue' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('revenue')}
          >
            Revenue Growth
          </button>
          <button 
            className={`px-4 py-3 font-medium ${activeTab === 'volume' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setActiveTab('volume')}
          >
            Volume Growth
          </button>
        </div>

        {/* Growth Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* MTD Growth Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">MTD User Growth</h3>
                <div className="text-3xl font-bold text-gray-900">
                  {data.mtdGrowth[1] ? formatPercent(data.mtdGrowth[1].transactionCountGrowth) : 'N/A'}
                </div>
                <div className="mt-4">
                  <div className="text-sm text-gray-500">Current Active Users</div>
                  <div className="text-xl font-semibold text-gray-800">{formatNumber(data.keyMetrics.activeUsers)}</div>
                  <div className="text-xs text-gray-500 mt-1 italic">
                    Users with transactions in the last 30 days
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">MTD Revenue Growth</h3>
                <div className="text-3xl font-bold text-gray-900">
                  {data.mtdGrowth[1] ? formatPercent(data.mtdGrowth[1].revenueGrowth) : 'N/A'}
                </div>
                <div className="mt-4">
                  <div className="text-sm text-gray-500">Current Revenue</div>
                  <div className="text-xl font-semibold text-gray-800">KES {formatNumber(data.keyMetrics.totalRevenue)}</div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">MTD Transaction Volume Growth</h3>
                <div className="text-3xl font-bold text-gray-900">
                  {data.mtdGrowth[1] ? formatPercent(data.mtdGrowth[1].transactionVolumeGrowth) : 'N/A'}
                </div>
                <div className="mt-4">
                  <div className="text-sm text-gray-500">Current Transaction Volume</div>
                  <div className="text-xl font-semibold text-gray-800">
                    {data.mtdGrowth[1] ? formatNumber(data.mtdGrowth[1].currentTransactionVolume) : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Combined Growth Trends Chart */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Monthly Growth Trends</h3>
              <p className="text-xs text-gray-500 mb-2 italic">Using logarithmic scale for better visualization of growth patterns</p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.monthlyTrends}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" orientation="left" scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                    <YAxis yAxisId="right" orientation="right" scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="users" name="Users" fill={COLORS.users} />
                    <Line yAxisId="right" type="monotone" dataKey="transactions" name="Transactions" stroke="#0088FE" />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.revenue} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Growth by Currency */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">MTD Growth by Currency</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-md font-medium text-gray-700 mb-3">Transaction Volume Growth</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.mtdGrowth}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="currency" />
                        <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                        <Tooltip formatter={(value) => formatPercent(value)} />
                        <Legend />
                        <Bar dataKey="transactionVolumeGrowth" name="Volume Growth" fill={COLORS.volume}>
                          {data.mtdGrowth.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getGrowthColor(entry.transactionVolumeGrowth)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-md font-medium text-gray-700 mb-3">Revenue Growth</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.mtdGrowth.filter(item => item.revenueGrowth !== null && isFinite(item.revenueGrowth))}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="currency" />
                        <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                        <Tooltip formatter={(value) => formatPercent(value)} />
                        <Legend />
                        <Bar dataKey="revenueGrowth" name="Revenue Growth" fill={COLORS.revenue}>
                          {data.mtdGrowth.filter(item => item.revenueGrowth !== null && isFinite(item.revenueGrowth)).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getGrowthColor(entry.revenueGrowth)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* User Growth Tab */}
        {activeTab === 'users' && (
          <>
            {/* User Growth Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">Total Users</h3>
                <div className="text-3xl font-bold text-gray-900">{formatNumber(data.keyMetrics.totalUsers)}</div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">Active Users</h3>
                <div className="text-3xl font-bold text-gray-900">{formatNumber(data.keyMetrics.activeUsers)}</div>
                <div className="text-sm text-gray-500 mt-1">
                  ({formatPercent((data.keyMetrics.activeUsers / data.keyMetrics.totalUsers) * 100)} of total)
                </div>
                <div className="text-xs text-gray-500 mt-1 italic">
                  Users with transactions in the last 30 days
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">MTD User Growth</h3>
                <div className="text-3xl font-bold text-gray-900" style={{ color: getGrowthColor(data.mtdGrowth[1]?.transactionCountGrowth) }}>
                  {data.mtdGrowth[1] ? formatPercent(data.mtdGrowth[1].transactionCountGrowth) : 'N/A'}
                </div>
              </div>
            </div>

            {/* Monthly User Growth Trend */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Monthly User Growth</h3>
              <p className="text-xs text-gray-500 mb-2 italic">Using logarithmic scale for better visualization of growth patterns</p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.monthlyTrends}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="users" name="Active Users" fill={COLORS.users} />
                    <Line type="monotone" dataKey="users" name="User Trend" stroke="#8884d8" dot={true} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* User Growth Rate */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly User Growth Rate</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.growthRates.user}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" orientation="left" scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="users" name="Users" fill={COLORS.users} />
                    <Line yAxisId="right" type="monotone" dataKey="growth" name="Growth Rate (%)" stroke="#FF8042" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* User Growth by Currency */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">User Growth by Currency (MTD)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Users</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transaction Count Growth</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Growth Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.mtdGrowth.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{item.currency}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatNumber(item.currentTransactionCount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatPercent(item.transactionCountGrowth)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${item.transactionCountGrowth > 10 ? 'bg-green-100 text-green-800' : 
                              item.transactionCountGrowth < 0 ? 'bg-red-100 text-red-800' : 
                              'bg-yellow-100 text-yellow-800'}`}>
                            {item.transactionCountGrowth > 10 ? 'Strong Growth' : 
                             item.transactionCountGrowth < 0 ? 'Declining' : 'Stable'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Revenue Growth Tab */}
        {activeTab === 'revenue' && (
          <>
            {/* Revenue Growth Stats */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Revenue Growth by Currency</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {data.mtdGrowth.map((currency, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-gray-600 text-sm font-medium mb-1">{currency.currency} Revenue Growth</h4>
                    <div className="text-2xl font-bold" style={{ color: getGrowthColor(currency.revenueGrowth) }}>
                      {currency.revenueGrowth !== null && isFinite(currency.revenueGrowth) 
                        ? formatPercent(currency.revenueGrowth) 
                        : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Current: {formatNumber(currency.currentRevenue)} {currency.currency}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Previous: {formatNumber(currency.previousRevenue)} {currency.currency}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {currency.currency === 'KES' ? 'Base currency' :
                       currency.currency === 'UGX' ? '1 KES = 28.4659 UGX' :
                       currency.currency === 'USD' ? '1 USD = 129.3827 KES' :
                       currency.currency === 'NGN' ? '1 KES = 11.59 NGN' :
                       currency.currency === 'CNY' ? '1 CNY = 17.80 KES' : ''}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-gray-600 text-sm font-medium mb-1">Total Revenue (KES Equivalent)</h3>
                  <div className="text-2xl font-bold text-gray-900">KES {formatNumber(data.keyMetrics.totalRevenue)}</div>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-gray-600 text-sm font-medium mb-1">Current Month Revenue (KES Equivalent)</h3>
                  <div className="text-2xl font-bold text-gray-900">
                    KES {formatNumber(data.monthlyTrends[data.monthlyTrends.length - 1]?.revenue || 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Revenue Trend */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Monthly Revenue Trend</h3>
              <p className="text-xs text-gray-500 mb-2 italic">Using logarithmic scale for better visualization of growth patterns</p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.monthlyTrends}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                    <Tooltip formatter={(value) => `KES ${formatNumber(value)}`} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill={COLORS.revenue} />
                    <Line type="monotone" dataKey="revenue" name="Revenue Trend" stroke="#FF8042" dot={true} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue Growth Rate */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly Revenue Growth Rate</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.growthRates.revenue}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" orientation="left" scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue (KES)" fill={COLORS.revenue} />
                    <Line yAxisId="right" type="monotone" dataKey="growth" name="Growth Rate (%)" stroke="#00C49F" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue Growth by Currency */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Revenue Growth by Currency (MTD)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Revenue</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue Growth</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Growth Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.mtdGrowth.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{item.currency}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {item.currentRevenue} {item.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {item.revenueGrowth !== null && isFinite(item.revenueGrowth) ? formatPercent(item.revenueGrowth) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.revenueGrowth !== null && isFinite(item.revenueGrowth) && (
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                              ${item.revenueGrowth > 10 ? 'bg-green-100 text-green-800' : 
                                item.revenueGrowth < 0 ? 'bg-red-100 text-red-800' : 
                                'bg-yellow-100 text-yellow-800'}`}>
                              {item.revenueGrowth > 10 ? 'Strong Growth' : 
                              item.revenueGrowth < 0 ? 'Declining' : 'Stable'}
                            </span>
                          )}
                          {(item.revenueGrowth === null || !isFinite(item.revenueGrowth)) && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              Insufficient Data
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Volume Growth Tab */}
        {activeTab === 'volume' && (
          <>
            {/* Volume Growth Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">Total Transactions</h3>
                <div className="text-3xl font-bold text-gray-900">
                  {formatNumber(data.keyMetrics.totalTransactions)}
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">Current Month Transactions</h3>
                <div className="text-3xl font-bold text-gray-900">
                  {formatNumber(data.monthlyTrends[data.monthlyTrends.length - 1]?.transactions || 0)}
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">Transaction Count Growth</h3>
                <div className="text-3xl font-bold text-gray-900" style={{ color: getGrowthColor(data.mtdGrowth[1]?.transactionCountGrowth) }}>
                  {data.mtdGrowth[1] ? formatPercent(data.mtdGrowth[1].transactionCountGrowth) : 'N/A'}
                </div>
              </div>
            </div>

            {/* Monthly Volume Trend */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Monthly Transaction Volume Trend</h3>
              <p className="text-xs text-gray-500 mb-2 italic">Using logarithmic scale for better visualization of growth patterns</p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.monthlyTrends}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                    <Tooltip formatter={(value) => formatNumber(value)} />
                    <Legend />
                    <Bar dataKey="volume" name="Transaction Volume" fill={COLORS.volume} />
                    <Line type="monotone" dataKey="volume" name="Volume Trend" stroke="#00C49F" dot={true} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Volume Growth Rate */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly Volume Growth Rate</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.growthRates.volume}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" orientation="left" scale="log" domain={['auto', 'auto']} allowDataOverflow={true} />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="volume" name="Volume" fill={COLORS.volume} />
                    <Line yAxisId="right" type="monotone" dataKey="growth" name="Growth Rate (%)" stroke="#8884d8" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Volume Growth by Currency */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Volume Growth by Currency (MTD)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Volume</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Volume Growth</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Growth Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.mtdGrowth.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{item.currency}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatNumber(item.currentTransactionVolume)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatPercent(item.transactionVolumeGrowth)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${item.transactionVolumeGrowth > 10 ? 'bg-green-100 text-green-800' : 
                              item.transactionVolumeGrowth < 0 ? 'bg-red-100 text-red-800' : 
                              'bg-yellow-100 text-yellow-800'}`}>
                            {item.transactionVolumeGrowth > 10 ? 'Strong Growth' : 
                             item.transactionVolumeGrowth < 0 ? 'Declining' : 'Stable'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FinancialDashboard;
