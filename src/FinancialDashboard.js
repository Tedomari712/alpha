import React, { useState, useEffect } from 'react';
import {
  LineChart, BarChart, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
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
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    
    // For very large numbers (millions+)
    if (Math.abs(num) >= 1_000_000) {
      return (num / 1_000_000).toFixed(2) + 'M';
    }
    // For large numbers (thousands)
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return parseFloat(num).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Format percentage helper as multiplier
  const formatMultiplier = (num) => {
    // e.g., 20 => 1.2x
    if (num === null || num === undefined || !isFinite(num)) return 'N/A';
    return (1 + num / 100).toFixed(1) + 'x';
  };
  
  // Helper for log scale data transformation
  const transformForLogScale = (dataArray, keys) => {
    return dataArray.map(item => {
      const newItem = { ...item };
      keys.forEach(key => {
        if (newItem[key] <= 0) {
          newItem[key] = 0.1; // ensure positive for log scale
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

  // Helper: calculate growth %
  const calcGrowth = (current, previous) => {
    if (previous > 0) {
      return ((current - previous) / previous) * 100;
    } else if (current > 0) {
      return 100; // if previous was 0 but current is not
    }
    return 0;
  };

  // Compute active users by currency for a given date range
  const getActiveUsersByCurrencyInRange = (walletBalances, startDate, endDate) => {
    const activeByCurrency = { KES: 0, UGX: 0, NGN: 0, USD: 0, CNY: 0 };
    walletBalances.forEach(user => {
      const lastTx = user['Last Transaction'];
      if (!lastTx) return;
      const lastTxDate = new Date(lastTx);

      // Check if user is active in this date range
      if (lastTxDate >= startDate && lastTxDate <= endDate) {
        // For each currency, if they hold a non-zero balance, increment
        if (user.KES && parseFloat(user.KES) > 0) {
          activeByCurrency.KES++;
        }
        if (user.UGX && parseFloat(user.UGX) > 0) {
          activeByCurrency.UGX++;
        }
        if (user.NGN && parseFloat(user.NGN) > 0) {
          activeByCurrency.NGN++;
        }
        if (user.USD && parseFloat(user.USD) > 0) {
          activeByCurrency.USD++;
        }
        if (user.CNY && parseFloat(user.CNY) > 0) {
          activeByCurrency.CNY++;
        }
      }
    });
    return activeByCurrency;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Exchange rates (to KES)
        const exchangeRates = {
          UGX: 1 / 28.4659,  // 1 UGX => ~0.035 KES
          NGN: 1 / 11.59,    // 1 NGN => ~0.086 KES
          USD: 129.3827,     // 1 USD => 129.3827 KES
          CNY: 17.80         // 1 CNY => 17.8 KES
        };

        // Fetch Excel file
        const response = await fetch('/financial_analysis_20250227_115233.xlsx');
        if (!response.ok) {
          throw new Error(`Failed to fetch Excel file (${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        // Helper to parse a sheet
        const extractSheetData = (sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return XLSX.utils.sheet_to_json(sheet, { raw: false });
        };

        // Load ONLY the monthly sheets + wallet balances + optional userStats for total users
        const walletBalances = extractSheetData('Wallet_Balances');
        const monthlyTransactionCount = extractSheetData('Monthly_Transaction_Count');
        const monthlyRevenue = extractSheetData('Monthly_Revenue');
        const monthlyVolume = extractSheetData('Monthly_Transaction_Volume');
        const userStats = extractSheetData('User_Statistics'); // If you still want total user count

        // 1) Compute current active users (last 30 days) and previous active users (30-60 days ago)
        const endDateCurrent = new Date(); // "now"
        const startDateCurrent = new Date();
        startDateCurrent.setDate(startDateCurrent.getDate() - 30);

        const endDatePrevious = new Date(startDateCurrent); // previous window ends right before current window starts
        const startDatePrevious = new Date();
        startDatePrevious.setDate(startDatePrevious.getDate() - 60);

        const currentActiveByCurrency = getActiveUsersByCurrencyInRange(walletBalances, startDateCurrent, endDateCurrent);
        const previousActiveByCurrency = getActiveUsersByCurrencyInRange(walletBalances, startDatePrevious, endDatePrevious);

        // Summed total active users across all currencies in current period
        // (If a user is active in multiple currencies, they might be counted multiple times. If you want distinct user count, you need a different approach.)
        let sumCurrentActive = 0;
        let sumPreviousActive = 0;
        Object.keys(currentActiveByCurrency).forEach(cur => {
          sumCurrentActive += currentActiveByCurrency[cur];
        });
        Object.keys(previousActiveByCurrency).forEach(cur => {
          sumPreviousActive += previousActiveByCurrency[cur];
        });

        // Distinct active user count can also be taken from the filter approach (without currency breakdown).
        // If you want distinct *overall* active users, just do:
        const distinctActiveUsers = walletBalances.filter(user => {
          const lastTxDate = new Date(user['Last Transaction'] || '');
          return lastTxDate >= startDateCurrent && lastTxDate <= endDateCurrent;
        }).length;

        // 2) Key metrics: total revenue, total transactions, total users
        //    For "total users," you can either use userStats or walletBalances.length
        let totalUsers = 0;
        const userStatRow = userStats.find(item => item.Metric === 'Total Users');
        if (userStatRow) {
          totalUsers = parseInt(userStatRow.Value.replace(/,/g, ''), 10);
        } else {
          // fallback
          totalUsers = walletBalances.length;
        }

        // total transactions => from the most recent month in Monthly_Transaction_Count (2025-02)
        const febCountRow = monthlyTransactionCount.find(m => m.YearMonth === '2025-02');
        const totalTransactions = febCountRow ? parseInt(febCountRow.Total || 0, 10) : 0;

        // total revenue => from the most recent month in Monthly_Revenue (2025-02), converting all to KES
        const febRevenueRow = monthlyRevenue.find(m => m.YearMonth === '2025-02');
        let totalKesRevenue = 0;
        if (febRevenueRow) {
          if (febRevenueRow.KES) totalKesRevenue += parseFloat(febRevenueRow.KES);
          if (febRevenueRow.NGN) totalKesRevenue += parseFloat(febRevenueRow.NGN) * exchangeRates.NGN;
          if (febRevenueRow.UGX) totalKesRevenue += parseFloat(febRevenueRow.UGX) * exchangeRates.UGX;
          if (febRevenueRow.USD) totalKesRevenue += parseFloat(febRevenueRow.USD) * exchangeRates.USD;
          if (febRevenueRow.CNY) totalKesRevenue += parseFloat(febRevenueRow.CNY) * exchangeRates.CNY;
        }

        // 3) Build monthlyTrends for multi-month charts
        //    For each row in Monthly_Transaction_Count, find matching row in revenue & volume
        const monthlyTrendsRaw = monthlyTransactionCount
          .filter(item => item.YearMonth !== 'Total')
          .map(item => {
            const ym = item.YearMonth;
            const revRow = monthlyRevenue.find(r => r.YearMonth === ym) || {};
            const volRow = monthlyVolume.find(v => v.YearMonth === ym) || {};

            // Sum revenue (KES + conversions)
            let revKES = 0;
            if (revRow.KES) revKES += parseFloat(revRow.KES);
            if (revRow.NGN) revKES += parseFloat(revRow.NGN) * exchangeRates.NGN;
            if (revRow.UGX) revKES += parseFloat(revRow.UGX) * exchangeRates.UGX;
            if (revRow.USD) revKES += parseFloat(revRow.USD) * exchangeRates.USD;
            if (revRow.CNY) revKES += parseFloat(revRow.CNY) * exchangeRates.CNY;

            const txCount = parseInt(item.Total || 0, 10);
            const vol = parseFloat(volRow.Total || 0);

            return {
              month: ym,
              transactions: txCount,
              revenue: revKES,
              // We are *not* using monthlyActiveUsers; let's treat "users" as 0 or some placeholder
              // If you want a chart of total distinct active users monthly, you'd need a different approach
              users: 0,
              volume: vol
            };
          });

        // 4) Month-over-month growth rates (for user, revenue, volume).
        //    Because we no longer have monthly user data, we can just set user growth = 0 for the chart,
        //    or remove that chart. For demonstration, we'll keep it with 0 or null.
        const growthRatesRaw = { user: [], revenue: [], volume: [] };
        for (let i = 1; i < monthlyTrendsRaw.length; i++) {
          const prev = monthlyTrendsRaw[i - 1];
          const curr = monthlyTrendsRaw[i];

          const userGrowth = (prev.users > 0)
            ? ((curr.users - prev.users) / prev.users) * 100
            : null;
          const revGrowth = (prev.revenue > 0)
            ? ((curr.revenue - prev.revenue) / prev.revenue) * 100
            : null;
          const volGrowth = (prev.volume > 0)
            ? ((curr.volume - prev.volume) / prev.volume) * 100
            : null;

          growthRatesRaw.user.push({
            month: curr.month,
            growth: userGrowth,
            users: curr.users
          });
          growthRatesRaw.revenue.push({
            month: curr.month,
            growth: revGrowth,
            revenue: curr.revenue
          });
          growthRatesRaw.volume.push({
            month: curr.month,
            growth: volGrowth,
            volume: curr.volume
          });
        }

        // 5) Calculate MTD Growth for each currency (Jan vs Feb) for transactionCount, volume, revenue
        //    Also incorporate user growth from walletBalances for each currency
        const currencies = ['KES','UGX','NGN','USD','CNY'];
        const janTxRow = monthlyTransactionCount.find(m => m.YearMonth === '2025-01') || {};
        const febTxRow = monthlyTransactionCount.find(m => m.YearMonth === '2025-02') || {};
        const janVolRow = monthlyVolume.find(m => m.YearMonth === '2025-01') || {};
        const febVolRow = monthlyVolume.find(m => m.YearMonth === '2025-02') || {};
        const janRevRow = monthlyRevenue.find(m => m.YearMonth === '2025-01') || {};
        const febRevRow = monthlyRevenue.find(m => m.YearMonth === '2025-02') || {};

        const mtdGrowthData = currencies.map(currency => {
          // transaction count
          const currentTx = parseFloat(febTxRow[currency] || 0);
          const prevTx = parseFloat(janTxRow[currency] || 0);
          const txGrowth = calcGrowth(currentTx, prevTx);

          // volume
          const currentVol = parseFloat(febVolRow[currency] || 0);
          const prevVol = parseFloat(janVolRow[currency] || 0);
          const volGrowth = calcGrowth(currentVol, prevVol);

          // convert currentVol to KES
          let currentVolKES = currentVol;
          if (currency !== 'KES') {
            if (exchangeRates[currency]) {
              // If currency = NGN => multiply by (1/11.59)? Actually we do `currentVol * exchangeRate`
              // But note your code does the inverse for NGN, UGX. Double-check your earlier logic to keep consistent.
              // For consistency, let's do: if 1 KES = 11.59 NGN, then 1 NGN = 1/11.59 KES
              // exchangeRates.NGN = 1/11.59 => multiply currentVol by (1/11.59)
              currentVolKES = currentVol * exchangeRates[currency];
            }
          }
          let prevVolKES = prevVol;
          if (currency !== 'KES') {
            if (exchangeRates[currency]) {
              prevVolKES = prevVol * exchangeRates[currency];
            }
          }

          // revenue
          const currentRev = parseFloat(febRevRow[currency] || 0);
          const prevRev = parseFloat(janRevRow[currency] || 0);
          const revGrowth = calcGrowth(currentRev, prevRev);

          // user growth from wallet balances
          const currActive = currentActiveByCurrency[currency] || 0;
          const prevActive = previousActiveByCurrency[currency] || 0;
          const userGrowth = calcGrowth(currActive, prevActive);

          return {
            currency,
            transactionCountGrowth: txGrowth,
            currentTransactionCount: currentTx,
            previousTransactionCount: prevTx,

            transactionVolumeGrowth: volGrowth,
            currentTransactionVolume: currentVol,
            previousTransactionVolume: prevVol,
            volumeKES: currentVolKES,
            previousVolumeKES: prevVolKES,

            revenueGrowth: revGrowth,
            currentRevenue: currentRev,
            previousRevenue: prevRev,

            userGrowth,
            currentActiveUsers: currActive,
            previousActiveUsers: prevActive
          };
        });

        // Prepare data for log scale charts
        const monthlyTrends = transformForLogScale(monthlyTrendsRaw, ['transactions','revenue','users','volume']);
        const growthRates = {
          user: transformForLogScale(growthRatesRaw.user, ['users']),
          revenue: transformForLogScale(growthRatesRaw.revenue, ['revenue']),
          volume: transformForLogScale(growthRatesRaw.volume, ['volume'])
        };

        // Final key metrics
        const keyMetrics = {
          totalRevenue: totalKesRevenue,
          totalTransactions,
          totalUsers,
          // distinct active users across the last 30 days (all currencies)
          activeUsers: distinctActiveUsers
        };

        setData({
          keyMetrics,
          currencyData: [], // if you want to fill from some other summary
          monthlyTrends,
          mtdGrowth: mtdGrowthData,
          growthRates,
          exchangeRates
        });

        setLoading(false);
      } catch (err) {
        console.error('Error loading data:', err);
        setError(err);
        setLoading(false);
      }
    };

    loadData();
  }, []);

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
