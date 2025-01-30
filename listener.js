require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const axios = require('axios'); // For Etherscan API requests
const nodemailer = require('nodemailer'); // For email notifications

console.log('Ethers:', ethers);
console.log('Ethers Utils:', ethers.utils);
console.log('Parse Ether Test:', ethers.utils.parseEther('10').toString());

console.log("Starting the listener...");

// Ethereum provider setup
const provider = new ethers.providers.JsonRpcProvider(
  `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
);
console.log("Connected to Ethereum Mainnet");

// Uniswap V2 Factory contract setup
const factoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const factoryABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
];
const factoryContract = new ethers.Contract(factoryAddress, factoryABI, provider);

const minLiquidity = ethers.utils.parseEther('10'); // $10,000 equivalent

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD
  }
});

// Send email notifications
async function sendEmailNotification(subject, message) {
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: process.env.NOTIFICATION_EMAIL,
    subject,
    text: message
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.response}`);
  } catch (error) {
    console.error(`Failed to send email: ${error.message}`);
  }
}

// Notify trade success
async function notifyTradeSuccess(tokenAddress, txHash) {
  const subject = `Trade Success: ${tokenAddress}`;
  const message = `Successfully traded token ${tokenAddress}.\nTransaction Hash: ${txHash}`;
  await sendEmailNotification(subject, message);
}

// Validate token legitimacy
async function validateToken(tokenAddress, signer) {
  console.log(`Validating token: ${tokenAddress}`);
  return (
    await checkLiquidity(tokenAddress) &&
    await isHoneypot(tokenAddress, 1, signer) &&
    await checkContractVerification(tokenAddress) &&
    await isOwnershipRenounced(tokenAddress, signer) &&
    await checkTokenSupplyAndDistribution(tokenAddress, signer)
  );
}

// Check liquidity
async function checkLiquidity(tokenAddress) {
  try {
    const balance = await provider.getBalance(tokenAddress);
    return balance.gte(minLiquidity);
  } catch (err) {
    console.error(`Error checking liquidity for ${tokenAddress}:`, err);
    return false;
  }
}

// Detect honeypots
async function isHoneypot(tokenAddress, amountIn, signer) {
  if (!ethers.utils.isAddress(tokenAddress)) {
      console.error(`Invalid token address: ${tokenAddress}`);
      return false;
  }

  const uniswapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564'; // Uniswap v3 Router
  const router = new ethers.Contract(
      uniswapRouterAddress,
      [
          "function exactInputSingle(tuple(address,address,uint24,address,uint256,uint256,uint160)) external payable returns (uint256)"
      ],
      signer
  );

  try {
      const recipient = await signer.getAddress();
      if (!ethers.utils.isAddress(recipient)) {
          console.error(`Invalid recipient address: ${recipient}`);
          return false;
      }

      const path = {
          tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
          tokenOut: tokenAddress,
          fee: 3000,
          recipient: recipient,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20,
          amountIn: ethers.utils.parseEther(amountIn.toString()),
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0
      };

      console.log(`Simulating buy/sell for token: ${tokenAddress}`);
      const tx = await router.exactInputSingle(path, {
          value: ethers.utils.parseEther(amountIn.toString()),
          gasLimit: 200000
      });
      await tx.wait();

      const reversePath = { ...path, tokenIn: tokenAddress, tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' };
      const sellTx = await router.exactInputSingle(reversePath, { gasLimit: 200000 });
      await sellTx.wait();

      console.log(`Token ${tokenAddress} passed honeypot detection.`);
      return true;
  } catch (error) {
      console.error(`Token ${tokenAddress} is a honeypot: ${error.message}`);
      return false;
  }
}

// Check contract verification
async function checkContractVerification(tokenAddress) {
  try {
    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${process.env.ETHERSCAN_API_KEY}`;
    const response = await axios.get(url);
    return response.data.status === "1" && response.data.result[0].ABI !== "Contract source code not verified";
  } catch (err) {
    console.error(`Error checking contract verification for ${tokenAddress}:`, err);
    return false;
  }
}

// Check if ownership is renounced
async function isOwnershipRenounced(tokenAddress, signer) {
  const token = new ethers.Contract(tokenAddress, ["function owner() public view returns (address)"], signer);
  try {
    const owner = await token.owner();
    return owner === ethers.constants.AddressZero;
  } catch (error) {
    console.error(`Error checking ownership for ${tokenAddress}: ${error.message}`);
    return false;
  }
}

// Check token supply and distribution
async function checkTokenSupplyAndDistribution(tokenAddress, signer) {
  const token = new ethers.Contract(
    tokenAddress,
    ["function totalSupply() public view returns (uint256)", "function balanceOf(address account) public view returns (uint256)"],
    signer
  );

  try {
    const totalSupply = await token.totalSupply();
    const ownerBalance = await token.balanceOf(await signer.getAddress());
    return ethers.utils.formatEther(ownerBalance) / ethers.utils.formatEther(totalSupply) <= 0.1;
  } catch (error) {
    console.error(`Error checking supply/distribution for ${tokenAddress}: ${error.message}`);
    return false;
  }
}

// Execute trades
async function executeTrade(tokenAddress) {
    const signer = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);
    const uniswapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
    const router = new ethers.Contract(uniswapRouterAddress, ["function exactInputSingle(tuple(address,address,uint24,address,uint256,uint256,uint160)) external payable returns (uint256)"], signer);
  
    const tradeDetails = {
      tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      tokenOut: tokenAddress,
      fee: 3000,
      recipient: await signer.getAddress(),
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      amountIn: ethers.utils.parseEther('0.001'),
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    };
  
    try {
      const tx = await router.exactInputSingle(tradeDetails, { value: ethers.utils.parseEther('0.001'), gasLimit: 200000 });
      const receipt = await tx.wait();
      const valueAtTrade = await getTokenPrice(tokenAddress) * parseFloat(ethers.utils.formatEther(tradeDetails.amountIn));
  
      // Log the trade
      logTrade({
        tokenAddress,
        txHash: receipt.transactionHash,
        amountInvested: parseFloat(ethers.utils.formatEther(tradeDetails.amountIn)),
        valueAtTrade,
      });
  
      console.log(`Trade executed! Transaction Hash: ${receipt.transactionHash}`);
      return { success: true, transactionHash: receipt.transactionHash };
    } catch (error) {
      console.error(`Trade failed: ${error.message}`);
      return { success: false };
    }
  }
  

// Listen for real-time PairCreated events
factoryContract.on('PairCreated', async (token0, token1, pair) => {
  if (!botRunning) {
    console.log(`Bot is stopped. Ignoring new token: ${token0}`);
    return;
  }

  console.log(`Live Event Detected! New Pair:\nToken 0: ${token0}\nToken 1: ${token1}\nPair: ${pair}`);
  try {
    const signer = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);
    if (await validateToken(token0, signer)) {
      const tradeResult = await executeTrade(token0);
      if (tradeResult.success) await notifyTradeSuccess(token0, tradeResult.transactionHash);
    } else {
      console.log(`Token ${token0} failed the legitimacy check.`);
    }
  } catch (error) {
    console.error(`Error processing PairCreated event: ${error.message}`);
  }
});

const { TwitterApi } = require('twitter-api-v2');

const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

// Function to get trending topics
async function getTwitterTrends(woeid = 1) { // 1 is for Worldwide trends
  try {
    const response = await twitterClient.v1.trendsByPlace(woeid);

    
    const trends = response[0].trends.map(trend => ({
      name: trend.name,
      tweetVolume: trend.tweet_volume || 0,
    }));

    // Filter trends with significant tweet volume
    return trends.filter(t => t.tweetVolume > 10000);
  } catch (error) {
    console.error("Error fetching Twitter trends:", error.message);
    return [];
  }
}

// Example: Get Worldwide Trends
getTwitterTrends().then(trends => {
  console.log("Trending Topics on Twitter:", trends);
});


async function getPastEvents() {
    try {
        const step = 1000;
        const latestBlock = await provider.getBlockNumber();
        const startBlock = latestBlock - 5000;

        for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += step) {
            const toBlock = Math.min(fromBlock + step - 1, latestBlock);
            const logs = await provider.getLogs({
                address: factoryAddress,
                fromBlock,
                toBlock,
                topics: [ethers.utils.id("PairCreated(address,address,address,uint256)")]
            });

            for (const log of logs) {
                const parsedLog = factoryContract.interface.parseLog(log);
                console.log(`Historical Pair Detected:
                  Token 0: ${parsedLog.args.token0}
                  Token 1: ${parsedLog.args.token1}
                  Pair: ${parsedLog.args.pair}`);
            }
        }
    } catch (err) {
        console.error("Error fetching historical events:", err);
    }
}

// Import Telegram Bot API
const TelegramBot = require('node-telegram-bot-api');

// Telegram Bot Configuration
const telegramToken = process.env.TELEGRAM_BOT_TOKEN; // Set this in your .env file
const telegramChatId = process.env.TELEGRAM_CHAT_ID; // Set this in your .env file

// Initialize the Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
// Global state to manage bot status
let botRunning = true;

// Command Handlers
bot.onText(/\/startbot/, (msg) => {
  if (msg.chat.id.toString() === telegramChatId) {
    botRunning = true;
    bot.sendMessage(telegramChatId, "✅ Bot has been started and is monitoring new tokens.");
  } else {
    bot.sendMessage(msg.chat.id, "You are not authorized to use this bot.");
  }
});

bot.onText(/\/stopbot/, (msg) => {
  if (msg.chat.id.toString() === telegramChatId) {
    botRunning = false;
    bot.sendMessage(telegramChatId, "⛔ Bot has been stopped. It is no longer monitoring tokens.");
  } else {
    bot.sendMessage(msg.chat.id, "You are not authorized to use this bot.");
  }
});

bot.onText(/\/status/, (msg) => {
  if (msg.chat.id.toString() === telegramChatId) {
    const status = botRunning ? "🟢 Bot is running and monitoring tokens." : "🔴 Bot is stopped.";
    bot.sendMessage(telegramChatId, status);
  } else {
    bot.sendMessage(msg.chat.id, "You are not authorized to use this bot.");
  }
});

bot.onText(/\/trades/, (msg) => {
  if (msg.chat.id.toString() === telegramChatId) {
    try {
      const tradeData = JSON.parse(fs.readFileSync('tradeLog.json', 'utf8'));
      const recentTrades = tradeData.slice(-5).map(trade => {
        return `Token: ${trade.tokenAddress}\nStatus: ${trade.status}\nProfit/Loss: ${trade.profitLoss || 0}`;
      }).join("\n\n");
      const message = recentTrades || "No recent trades available.";
      bot.sendMessage(telegramChatId, `📊 Recent Trades:\n\n${message}`);
    } catch (error) {
      bot.sendMessage(telegramChatId, "⚠️ Error reading trade data. Make sure 'tradeLog.json' exists and is accessible.");
    }
  } else {
    bot.sendMessage(msg.chat.id, "You are not authorized to use this bot.");
  }
});

bot.onText(/\/settradeamount (.+)/, (msg, match) => {
  if (msg.chat.id.toString() === telegramChatId) {
    const amount = parseFloat(match[1]);
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(telegramChatId, "❌ Invalid trade amount. Please provide a valid number greater than 0.");
    } else {
      process.env.TRADE_AMOUNT = amount.toString();
      bot.sendMessage(telegramChatId, `✅ Trade amount has been updated to: ${amount} ETH.`);
    }
  } else {
    bot.sendMessage(msg.chat.id, "You are not authorized to use this bot.");
  }
});

// Notify commands availability on bot start
bot.sendMessage(telegramChatId, `🤖 Bot is online! Use the following commands:\n
/startbot - Start the bot
/stopbot - Stop the bot
/status - Get the bot status
/trades - View recent trades
/settradeamount <amount> - Update the trade amount in ETH`);

// Function to send Telegram notification
async function sendTelegramNotification(message) {
  try {
    await bot.sendMessage(telegramChatId, message);
    console.log("Telegram notification sent successfully.");
  } catch (error) {
    console.error("Failed to send Telegram notification:", error.message);
  }
}

async function getSocialMediaSentiment(tokenSymbol) {
  try {
    const twitterResponse = await axios.get(`https://api.twitter.com/2/tweets/search/recent`, {
      params: {
        query: tokenSymbol,
        "tweet.fields": "public_metrics",
        max_results: 50
      },
      headers: {
        Authorization: `Bearer ${process.env.TWITTER_API_KEY}`
      }
    });

    const tweets = twitterResponse.data.data || [];
    const positiveMentions = tweets.filter(tweet => tweet.text.includes("🚀") || tweet.text.includes("moon"));

    return positiveMentions.length > 50; // Adjust threshold based on market conditions
  } catch (error) {
    console.error("Error fetching social media sentiment:", error.message);
    return false;
  }
}

async function checkLiquidity(tokenAddress) {
  try {
    const balance = await provider.getBalance(tokenAddress);
    const minLiquidity = ethers.utils.parseEther('10'); // Dynamic liquidity threshold

    return balance.gte(minLiquidity); 
  } catch (err) {
    console.error(`Error checking liquidity for ${tokenAddress}:`, err.message);
    return false;
  }
}

async function getSocialMediaSentiment(tokenSymbol) {
  try {
    const trends = await getTwitterTrends();

    // Check if token name or symbol is in trending topics
    const isTrending = trends.some(trend => trend.name.includes(tokenSymbol));

    return isTrending;
  } catch (error) {
    console.error("Error checking social media sentiment:", error.message);
    return false;
  }
}


async function checkTokenSupplyAndDistribution(tokenAddress, signer) {
  const token = new ethers.Contract(
    tokenAddress,
    ["function totalSupply() public view returns (uint256)", "function balanceOf(address account) public view returns (uint256)"],
    signer
  );

  try {
    const totalSupply = await token.totalSupply();
    const ownerBalance = await token.balanceOf(await signer.getAddress());

    const centralizationThreshold = 0.15; // Allow up to 15% ownership in one wallet
    return ethers.utils.formatEther(ownerBalance) / ethers.utils.formatEther(totalSupply) <= centralizationThreshold;
  } catch (error) {
    console.error(`Error checking supply/distribution for ${tokenAddress}: ${error.message}`);
    return false;
  }
}

async function getTokenPerformance(tokenAddress) {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`
    );

    const priceChange = response.data[tokenAddress.toLowerCase()]?.usd || 0;
    return priceChange > 10; // Invest only if 24h price change > 10%
  } catch (error) {
    console.error(`Error fetching token performance: ${error.message}`);
    return false;
  }
}

async function validateToken(tokenAddress, signer) {
  console.log(`Validating token: ${tokenAddress}`);

  const passesLiquidity = await checkLiquidity(tokenAddress);
  const passesHoneypot = await isHoneypot(tokenAddress, 1, signer);
  const passesOwnership = await checkTokenSupplyAndDistribution(tokenAddress, signer);
  const hasPositiveSentiment = await getSocialMediaSentiment(tokenAddress);
  const hasGoodPerformance = await getTokenPerformance(tokenAddress);

  return passesLiquidity && passesHoneypot && passesOwnership && hasPositiveSentiment && hasGoodPerformance;
}

function logMissedOpportunity(tokenAddress) {
  fs.appendFileSync(
    'missed_opportunities.json',
    JSON.stringify({ tokenAddress, timestamp: new Date().toISOString() }, null, 2)
  );
}

const RISK_LEVELS = {
  LOW: { minLiquidity: 50, sentimentThreshold: 100 },
  MEDIUM: { minLiquidity: 20, sentimentThreshold: 50 },
  HIGH: { minLiquidity: 10, sentimentThreshold: 20 }
};

let currentRiskLevel = RISK_LEVELS.MEDIUM; // Default

function setRiskLevel(level) {
  if (RISK_LEVELS[level]) {
    currentRiskLevel = RISK_LEVELS[level];
    console.log(`Risk level updated to: ${level}`);
  } else {
    console.log("Invalid risk level.");
  }
}

// Example usage: Notify about successful trade
async function notifyTradeSuccessTelegram(tokenAddress, txHash) {
  const message = `🚀 *Trade Success!*\n\n` +
                  `Token: ${tokenAddress}\n` +
                  `Transaction Hash: [${txHash}](https://etherscan.io/tx/${txHash})\n` +
                  `Check the transaction on Etherscan for details.`;
  await sendTelegramNotification(message);
}

// Replace this with your existing trade notification logic
async function notifyTradeSuccess(tokenAddress, txHash) {
  // Send Gmail notification
  await sendEmailNotification(
    `Trade Success: ${tokenAddress}`,
    `Successfully traded token ${tokenAddress}.\nTransaction Hash: ${txHash}`
  );

  // Send Telegram notification
  await notifyTradeSuccessTelegram(tokenAddress, txHash);
}


// Fetch historical events
getPastEvents().catch(err => console.error("Error fetching historical events:", err));

const path = require('path');

const tradeLogPath = path.join(__dirname, 'tradeLog.json');

// Initialize trade log file
if (!fs.existsSync(tradeLogPath)) {
  fs.writeFileSync(tradeLogPath, JSON.stringify([]));
}

// Log trade details
function logTrade({ tokenAddress, txHash, amountInvested, valueAtTrade }) {
  const tradeData = JSON.parse(fs.readFileSync(tradeLogPath, 'utf8'));
  tradeData.push({
    tokenAddress,
    txHash,
    amountInvested,
    valueAtTrade,
    timestamp: new Date().toISOString(),
    status: 'open',
    currentValue: null,
    profitLoss: null,
  });
  fs.writeFileSync(tradeLogPath, JSON.stringify(tradeData, null, 2));
}

// Update trade metrics
async function updateTradeMetrics() {
  const tradeData = JSON.parse(fs.readFileSync(tradeLogPath, 'utf8'));
  for (const trade of tradeData.filter((t) => t.status === 'open')) {
    const currentValue = await getTokenPrice(trade.tokenAddress) * trade.amountInvested;
    trade.currentValue = currentValue;
    trade.profitLoss = currentValue - trade.valueAtTrade;

    // Mark trade as closed if conditions are met
    if (trade.profitLoss < -0.2 * trade.valueAtTrade) { // Example stop-loss threshold
      trade.status = 'closed';
    }
  }
  fs.writeFileSync(tradeLogPath, JSON.stringify(tradeData, null, 2));
}

// Periodically update trade metrics
setInterval(updateTradeMetrics, 60000); // Update every minute

async function getTokenPrice(tokenAddress) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`;
      const response = await axios.get(url);
      return response.data[tokenAddress.toLowerCase()]?.usd || 0;
    } catch (error) {
      console.error(`Failed to fetch price for ${tokenAddress}: ${error.message}`);
      return 0;
    }
  }
  
  const blessed = require('blessed');
  const contrib = require('blessed-contrib');
  
  // Create a screen object
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Meme Coin Bot Dashboard'
  });
  
  // Create a grid layout
  const grid = new contrib.grid({ rows: 12, cols: 12, screen });
  
  // Create widgets
  const tradesTable = grid.set(0, 0, 8, 8, contrib.table, {
    keys: true,
    fg: 'white',
    selectedFg: 'black',
    selectedBg: 'green',
    interactive: true,
    label: 'Recent Trades',
    columnWidth: [20, 15, 20, 10, 15, 15]
  });
  
  const tradeMetrics = grid.set(0, 8, 6, 4, contrib.log, {
    fg: 'green',
    label: 'Trade Metrics'
  });
  
  const logs = grid.set(6, 8, 6, 4, contrib.log, {
    fg: 'cyan',
    label: 'Logs'
  });
  
  // Function to update trades table
  function updateTradesTable() {
    try {
      const tradeData = JSON.parse(fs.readFileSync(tradeLogPath, 'utf8'));
      const tableData = tradeData.slice(-10).map(trade => [
        trade.tokenAddress,
        trade.txHash.slice(0, 10) + '...',
        trade.amountInvested.toFixed(4),
        trade.currentValue ? trade.currentValue.toFixed(4) : 'N/A',
        trade.profitLoss ? trade.profitLoss.toFixed(4) : 'N/A',
        trade.status
      ]);
      tradesTable.setData({
        headers: ['Token', 'Tx Hash', 'Invested', 'Value', 'P/L', 'Status'],
        data: tableData
      });
      screen.render();
    } catch (err) {
      logs.log(`Error updating trades table: ${err.message}`);
    }
  }
  
  // Function to update trade metrics
  function updateTradeMetricsLog() {
    try {
      const tradeData = JSON.parse(fs.readFileSync(tradeLogPath, 'utf8'));
      const totalTrades = tradeData.length;
      const openTrades = tradeData.filter(trade => trade.status === 'open').length;
      const closedTrades = tradeData.filter(trade => trade.status === 'closed').length;
      const totalProfitLoss = tradeData.reduce((acc, trade) => acc + (trade.profitLoss || 0), 0);
  
      tradeMetrics.log(`Total Trades: ${totalTrades}`);
      tradeMetrics.log(`Open Trades: ${openTrades}`);
      tradeMetrics.log(`Closed Trades: ${closedTrades}`);
      tradeMetrics.log(`Net Profit/Loss: ${totalProfitLoss.toFixed(4)}`);
    } catch (err) {
      logs.log(`Error updating trade metrics: ${err.message}`);
    }
  }
  
  // Periodic updates
  setInterval(() => {
    updateTradesTable();
    updateTradeMetricsLog();
  }, 5000);
  
  // Quit on 'q', 'Ctrl+C'
  screen.key(['q', 'C-c'], function () {
    return process.exit(0);
  });
  
  // Initial render
  screen.render();

  const blacklist = require('./blacklist.json'); // Load blacklist file

  // Check if the token is blacklisted
  function isBlacklisted(tokenAddress) {
    if (blacklist.includes(tokenAddress.toLowerCase())) {
      console.log(`Token ${tokenAddress} is blacklisted.`);
      return true;
    }
    return false;
  }
  async function checkTokenMetadata(tokenAddress) {
    try {
      const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${process.env.ETHERSCAN_API_KEY}`;
      const response = await axios.get(url);
  
      if (response.data.status === "1" && response.data.result[0]) {
        const { ContractName, Symbol } = response.data.result[0];
        const suspiciousPatterns = [/test/i, /shiba/i, /x100/i, /fake/i];
  
        if (suspiciousPatterns.some(pattern => pattern.test(ContractName) || pattern.test(Symbol))) {
          console.log(`Token ${tokenAddress} has suspicious metadata: Name: ${ContractName}, Symbol: ${Symbol}`);
          return false;
        }
        console.log(`Token ${tokenAddress} metadata looks clean: Name: ${ContractName}, Symbol: ${Symbol}`);
        return true;
      }
    } catch (err) {
      console.error(`Error checking token metadata for ${tokenAddress}:`, err.message);
      return false;
    }
  }
  async function analyzeTokenSupply(tokenAddress, signer) {
    const token = new ethers.Contract(
      tokenAddress,
      [
        "function totalSupply() public view returns (uint256)",
        "function balanceOf(address account) public view returns (uint256)"
      ],
      signer
    );
  
    try {
      const totalSupply = await token.totalSupply();
      const topWalletBalance = await token.balanceOf(await signer.getAddress());
  
      const totalSupplyInEther = ethers.utils.formatEther(totalSupply);
      const topWalletInEther = ethers.utils.formatEther(topWalletBalance);
  
      if (parseFloat(totalSupplyInEther) > 1e12 || parseFloat(topWalletInEther) / parseFloat(totalSupplyInEther) > 0.1) {
        console.log(`Token ${tokenAddress} has a suspicious supply pattern.`);
        return false;
      }
      console.log(`Token ${tokenAddress} supply patterns look acceptable.`);
      return true;
    } catch (err) {
      console.error(`Error analyzing supply for token ${tokenAddress}:`, err.message);
      return false;
    }
  }
  async function validateToken(tokenAddress, signer) {
    console.log(`Validating token: ${tokenAddress}`);
  
    // Check if the token is blacklisted
    if (isBlacklisted(tokenAddress)) return false;
  
    // Check metadata for suspicious patterns
    if (!(await checkTokenMetadata(tokenAddress))) return false;
  
    // Perform other checks
    return (
      await checkLiquidity(tokenAddress) &&
      await isHoneypot(tokenAddress, 1, signer) &&
      await checkContractVerification(tokenAddress) &&
      await isOwnershipRenounced(tokenAddress, signer) &&
      await analyzeTokenSupply(tokenAddress, signer)
    );
  }
  const moment = require('moment');

  function generateTradeSummary() {
    try {
      const tradeData = JSON.parse(fs.readFileSync(tradeLogPath, 'utf8'));
  
      const totalTrades = tradeData.length;
      const profitableTrades = tradeData.filter((trade) => trade.profitLoss > 0).length;
      const unprofitableTrades = totalTrades - profitableTrades;
      const netProfitLoss = tradeData.reduce((acc, trade) => acc + (trade.profitLoss || 0), 0);
      const topTrades = tradeData
        .filter((trade) => trade.profitLoss > 0)
        .sort((a, b) => b.profitLoss - a.profitLoss)
        .slice(0, 5)
        .map((trade) => `Token: ${trade.tokenAddress}, Profit: ${trade.profitLoss.toFixed(4)}`);
  
      const report = `
  📊 Weekly Trade Summary (${moment().format('YYYY-MM-DD')}):
  - Total Trades: ${totalTrades}
  - Profitable Trades: ${profitableTrades}
  - Unprofitable Trades: ${unprofitableTrades}
  - Net Profit/Loss: ${netProfitLoss.toFixed(4)} ETH
  - Top Tokens:
  ${topTrades.length > 0 ? topTrades.join("\n") : "None"}
      `;
  
      return report;
    } catch (error) {
      console.error("Error generating trade summary:", error.message);
      return "⚠️ Error generating trade summary.";
    }
  }
  const schedule = require('node-schedule');

  // Schedule report generation every Sunday at 6 PM
  schedule.scheduleJob('0 18 * * 0', async () => {
    console.log("Generating weekly trade summary...");
    const summary = generateTradeSummary();
  
    // Send summary via email
    await sendEmailNotification("Weekly Trade Summary", summary);
  
    // Send summary via Telegram
    await sendTelegramNotification(summary);
  });
  bot.onText(/\/summary/, (msg) => {
    if (msg.chat.id.toString() === telegramChatId) {
      const summary = generateTradeSummary();
      bot.sendMessage(telegramChatId, summary);
    } else {
      bot.sendMessage(msg.chat.id, "You are not authorized to use this bot.");
    }
  });
    