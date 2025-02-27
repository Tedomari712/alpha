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
  const [error, setError] = useState(null);
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

  // Format percentage helper as multiplier
  const formatMultiplier = (num) => {
    if (num === null || num === undefined || !isFinite(num)) return 'N/A';
    // Convert percentage to multiplier, e.g., 20 becomes 1.2x
    return (1 + num / 100).toFixed(1) + 'x';
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
        setError(null);
        
        // Define currencies used throughout the app
        const currencies = ['KES', 'UGX', 'NGN', 'USD', 'CNY'];
        
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

        const workbook = XLSX.read(response, { type: 'array' });

        // Extract sheet data helper function
        const extractSheetData = (sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return XLSX.utils.sheet_to_json(sheet, {raw: false});
        };

        // Get data from key sheets - ONLY USING MONTHLY SHEETS AND BASE DATA
        const userStats = extractSheetData('User_Statistics');
        const walletBalances = extractSheetData('Wallet_Balances');
        const currencySummary = extractSheetData('Currency_Summary');
        
        // MONTHLY SHEETS - These are our primary data sources now
        const monthlyTransactionCount = extractSheetData('Monthly_Transaction_Count');
        const monthlyRevenue = extractSheetData('Monthly_Revenue');
        const monthlyActiveUsers = extractSheetData('Monthly_Active_Users');
        const monthlyVolume = extractSheetData('Monthly_Transaction_Volume');

        // Calculate active users (transactions in the last 30 days) from Wallet_Balances
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        // Get all active users
        const activeUsers = walletBalances.filter(user => {
          if (!user['Last Transaction']) return false;
          const lastTransactionDate = new Date(user['Last Transaction']);
          return lastTransactionDate >= thirtyDaysAgo;
        });
        
        const activeUsersCount = activeUsers.length;
        
        // Initialize active users by currency object - count users who have transactions in each currency
        const activeUsersByCurrency = {};
        currencies.forEach(currency => {
          activeUsersByCurrency[currency] = 0;
        });
        
        // For each active user, check which currencies they have had transactions in
        // This is a more accurate way to count active users by currency than just checking balances
        activeUsers.forEach(user => {
          // Check transaction counts (this is a proxy for determining which currencies they've used)
          // A better approach would be to check actual transaction history if available
          if (user['Transaction Count'] && parseInt(user['Transaction Count']) > 0) {
            // For simplicity, we'll count a user as active in KES if they have any transactions
            // In a real implementation, you'd check transaction history by currency
            activeUsersByCurrency.KES++;
            
            // This is a simplified approach - in reality, you would determine which currencies
            // were actually used in transactions by this user in the last 30 days
            if (user.KES && user.KES !== '0.00 KES' && user.KES !== '0.00') {
              activeUsersByCurrency.KES++;
            }
            if (user.UGX && user.UGX !== '0.00 UGX' && user.UGX !== '0.00') {
              activeUsersByCurrency.UGX++;
            }
            if (user.NGN && user.NGN !== '0.00 NGN' && user.NGN !== '0.00') {
              activeUsersByCurrency.NGN++;
            }
            if (user.USD && user.USD !== '0.00 USD' && user.USD !== '0.00') {
              activeUsersByCurrency.USD++;
            }
            if (user.CNY && user.CNY !== '0.00 CNY' && user.CNY !== '0.00') {
              activeUsersByCurrency.CNY++;
            }
          }
        });
        
        // Also get previous month active users if possible
        // For this, we'd need data from 30-60 days ago, but since we only have last transaction date,
        // we'll use the Monthly_Active_Users sheet for the previous month data
        const previousActiveUsersByCurrency = {};
        const janActiveUsers = monthlyActiveUsers.find(m => m.YearMonth === '2025-01');
        if (janActiveUsers) {
          currencies.forEach(currency => {
            previousActiveUsersByCurrency[currency] = parseInt(janActiveUsers[currency] || 0);
          });
        }

        // Use fixed exchange rates correctly
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

        // Get total transactions directly from the most recent month in Monthly_Transaction_Count
        const febTransactions = monthlyTransactionCount.find(m => m.YearMonth === '2025-02');
        if (febTransactions && febTransactions.Total) {
          keyMetrics.totalTransactions = parseInt(febTransactions.Total);
        }
        
        // Get the total revenue - sum the last month (February 2025) from Monthly_Revenue
        const febData = monthlyRevenue.find(m => m.YearMonth === '2025-02');
        if (febData) {
          let totalKesRevenue = 0;
          
          // KES is already in KES
          if (febData.KES && febData.KES !== "") {
            totalKesRevenue += parseFloat(febData.KES);
          }
          
          // Convert other currencies to KES using the provided exchange rates
          if (febData.NGN && febData.NGN !== "") {
            // 1 KES = 11.59 NGN, so 1 NGN = 1/11.59 KES
            totalKesRevenue += parseFloat(febData.NGN) / 11.59;
          }
          
          if (febData.UGX && febData.UGX !== "") {
            // 1 KES = 28.4659 UGX, so 1 UGX = 1/28.4659 KES
            totalKesRevenue += parseFloat(febData.UGX) / 28.4659;
          }
          
          if (febData.USD && febData.USD !== "") {
            // 1 USD = 129.3827 KES
            totalKesRevenue += parseFloat(febData.USD) * 129.3827;
          }
          
          if (febData.CNY && febData.CNY !== "") {
            // 1 CNY = 17.80 KES
            totalKesRevenue += parseFloat(febData.CNY) * 17.80;
          }
          
          keyMetrics.totalRevenue = totalKesRevenue;
        }
        
        // Get total users
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
              if (revenueRow.KES && revenueRow.KES !== '') 
                totalKESRevenue += parseFloat(revenueRow.KES || 0);
              
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

        // Calculate MTD Growth directly from monthly data
        // Find Jan and Feb data for direct comparison
        const febRevenueData = monthlyRevenue.find(m => m.YearMonth === '2025-02');
        const janRevenueData = monthlyRevenue.find(m => m.YearMonth === '2025-01');
        const febTransactionData = monthlyTransactionCount.find(m => m.YearMonth === '2025-02');
        const janTransactionData = monthlyTransactionCount.find(m => m.YearMonth === '2025-01');
        const febVolumeData = monthlyVolume.find(m => m.YearMonth === '2025-02');
        const janVolumeData = monthlyVolume.find(m => m.YearMonth === '2025-01');
        
        // Calculate growth metrics for each currency
        const mtdGrowthData = currencies.map(currency => {
          // Get current and previous revenue
          const currentRevenue = febRevenueData && febRevenueData[currency] ? 
            parseFloat(febRevenueData[currency]) : 0;
          const previousRevenue = janRevenueData && janRevenueData[currency] ? 
            parseFloat(janRevenueData[currency]) : 0;
          
          // Get current and previous transaction counts
          const currentTransCount = febTransactionData && febTransactionData[currency] ? 
            parseFloat(febTransactionData[currency]) : 0;
          const previousTransCount = janTransactionData && janTransactionData[currency] ? 
            parseFloat(janTransactionData[currency]) : 0;
          
          // Get current and previous volume
          const currentVolume = febVolumeData && febVolumeData[currency] ? 
            parseFloat(febVolumeData[currency]) : 0;
          const previousVolume = janVolumeData && janVolumeData[currency] ? 
            parseFloat(janVolumeData[currency]) : 0;
          
          // Convert volumes to KES using exchange rates
          let currentVolumeKES = currentVolume;
          let previousVolumeKES = previousVolume;
          
          if (currency !== 'KES') {
            if (currency === 'UGX') {
              // 1 KES = 28.4659 UGX, so 1 UGX = 1/28.4659 KES
              currentVolumeKES = currentVolume / 28.4659;
              previousVolumeKES = previousVolume / 28.4659;
            } else if (currency === 'NGN') {
              // 1 KES = 11.59 NGN, so 1 NGN = 1/11.59 KES
              currentVolumeKES = currentVolume / 11.59;
              previousVolumeKES = previousVolume / 11.59;
            } else if (currency === 'USD') {
              // 1 USD = 129.3827 KES
              currentVolumeKES = currentVolume * 129.3827;
              previousVolumeKES = previousVolume * 129.3827;
            } else if (currency === 'CNY') {
              // 1 CNY = 17.80 KES
              currentVolumeKES = currentVolume * 17.80;
              previousVolumeKES = previousVolume * 17.80;
            }
          }
          
          // Calculate growth rates
          let revenueGrowth = 0;
          if (previousRevenue > 0) {
            revenueGrowth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
          } else if (currentRevenue > 0) {
            revenueGrowth = 100; // If previous was 0 but current is not, show as 100% growth
          }
          
          let transactionCountGrowth = 0;
          if (previousTransCount > 0) {
            transactionCountGrowth = ((currentTransCount - previousTransCount) / previousTransCount) * 100;
          } else if (currentTransCount > 0) {
            transactionCountGrowth = 100;
          }
          
          let transactionVolumeGrowth = 0;
          if (previousVolume > 0) {
            transactionVolumeGrowth = ((currentVolume - previousVolume) / previousVolume) * 100;
          } else if (currentVolume > 0) {
            transactionVolumeGrowth = 100;
          }
          
          // Get active users by currency data
          const currentActiveUsers = activeUsersByCurrency[currency] || 0;
          const previousActiveUsers = previousActiveUsersByCurrency[currency] || 0;
          
          // Calculate user growth rate
          let userGrowth = 0;
          if (previousActiveUsers > 0) {
            userGrowth = ((currentActiveUsers - previousActiveUsers) / previousActiveUsers) * 100;
          } else if (currentActiveUsers > 0) {
            userGrowth = 100;
          }
          
          return {
            currency,
            revenueGrowth,
            transactionCountGrowth,
            transactionVolumeGrowth,
            userGrowth,
            currentRevenue,
            previousRevenue,
            currentTransactionCount: currentTransCount,
            previousTransactionCount: previousTransCount,
            currentTransactionVolume: currentVolume,
            previousTransactionVolume: previousVolume,
            currentActiveUsers,
            previousActiveUsers,
            volumeKES: currentVolumeKES,
            previousVolumeKES,
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
        setError(error);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Add error handling
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative m-4">
        <strong className="font-bold">Error loading data:</strong>
        <span className="block sm:inline"> {error.message || "Failed to load dashboard data"}</span>
        <p className="mt-2">Please check that your Excel file is properly uploaded to the public folder.</p>
      </div>
    );
  }

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
                  console.error("Logo failed to load");
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
                  {data.mtdGrowth[1] ? formatMultiplier(data.mtdGrowth[1].userGrowth) : 'N/A'}
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
                  {data.mtdGrowth[1] ? formatMultiplier(data.mtdGrowth[1].revenueGrowth) : 'N/A'}
                </div>
                <div className="mt-4">
                  <div className="text-sm text-gray-500">Current Revenue</div>
                  <div className="text-xl font-semibold text-gray-800">KES {formatNumber(data.keyMetrics.totalRevenue)}</div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">MTD Transaction Volume Growth</h3>
                <div className="text-3xl font-bold text-gray-900">
                  {data.mtdGrowth[1] ? formatMultiplier(data.mtdGrowth[1].transactionVolumeGrowth) : 'N/A'}
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
                        <Tooltip formatter={(value) => formatMultiplier(value)} />
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
                        <Tooltip formatter={(value) => formatMultiplier(value)} />
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
                  ({formatMultiplier((data.keyMetrics.activeUsers / data.keyMetrics.totalUsers) * 100)} of total)
                </div>
                <div className="text-xs text-gray-500 mt-1 italic">
                  Users with transactions in the last 30 days
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-gray-500 text-sm font-medium mb-1">MTD User Growth</h3>
                <div className="text-3xl font-bold text-gray-900" style={{ color: getGrowthColor(data.mtdGrowth[1]?.userGrowth) }}>
                  {data.mtdGrowth[1] ? formatMultiplier(data.mtdGrowth[1].userGrowth) : 'N/A'}
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Active Users</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Previous Month</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Growth</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.mtdGrowth.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{item.currency}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatNumber(item.currentActiveUsers)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatNumber(item.previousActiveUsers)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{formatMultiplier(item.userGrowth)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${item.userGrowth > 10 ? 'bg-green-100 text-green-800' : 
                              item.userGrowth < 0 ? 'bg-red-100 text-red-800' : 
                              'bg-yellow-100 text-yellow-800'}`}>
                            {item.userGrowth > 10 ? 'Strong Growth' : 
                             item.userGrowth < 0 ? 'Declining' : 'Stable'}
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
                        ? formatMultiplier(currency.revenueGrowth) 
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Previous Month</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Growth</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.mtdGrowth.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{item.currency}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {formatNumber(item.currentRevenue)} {item.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {formatNumber(item.previousRevenue)} {item.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {item.revenueGrowth !== null && isFinite(item.revenueGrowth) ? formatMultiplier(item.revenueGrowth) : 'N/A'}
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
                  {data.mtdGrowth[1] ? formatMultiplier(data.mtdGrowth[1].transactionCountGrowth) : 'N/A'}
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Previous Month</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KES Equivalent</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Growth</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.mtdGrowth.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{item.currency}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {formatNumber(item.currentTransactionVolume)} {item.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {formatNumber(item.previousTransactionVolume)} {item.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          KES {formatNumber(item.volumeKES)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                          {formatMultiplier(item.transactionVolumeGrowth)}
                        </td>
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
