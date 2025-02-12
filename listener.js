// listener.js
import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import nodemailer from 'nodemailer';
import moment from 'moment';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import schedule from 'node-schedule';

// ================= Global Error Handling =================
process.on('uncaughtException', (err) => {
  console.error("Uncaught Exception:", err);
  logError("Uncaught Exception: " + err.stack);
  // Optionally add graceful shutdown/restart logic.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
  logError("Unhandled Rejection: " + reason);
});

// ================= Logger Function =================
function logError(message) {
  const logMessage = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync("error.log", logMessage);
  } catch (err) {
    console.error("Failed to write error log:", err);
  }
}

// ================= Constants & Globals =================
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
// TRADE_AMOUNT now represents $10 worth of ETH (default 0.01 ETH)
const TRADE_AMOUNT = process.env.TRADE_AMOUNT || "0.01";
let botRunning = true;

// ================= Provider & Signer =================
// Use both Infura and Alchemy via FallbackProvider
let provider;
try {
  const alchemyProvider = new ethers.providers.WebSocketProvider(
    `wss://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  );
  const infuraProvider = new ethers.providers.WebSocketProvider(
    `wss://mainnet.infura.io/ws/v3/${process.env.INFURA_PROJECT_ID}`
  );
  provider = new ethers.providers.FallbackProvider([alchemyProvider, infuraProvider]);
  console.log("FallbackProvider created using Alchemy and Infura.");
} catch (err) {
  console.error("Error initializing provider:", err);
  logError("Error initializing provider: " + err.stack);
  process.exit(1);
}
const signer = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

// ================= Contract Setup =================
const factoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const factoryABI = ["event PairCreated(address indexed token0, address indexed token1, address pair, uint)"];
const factoryContract = new ethers.Contract(factoryAddress, factoryABI, provider);

const pairABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

const routerAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const routerABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256)"
];

// ================= Notification Setup =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASSWORD }
});

// ================= Shared Instances (Injected via main.js) =================
let telegramBot; // Will be set via the init() function.
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
let io; // Shared Socket.IO instance (if applicable).

// ================= Trade Log Setup =================
const tradeLogPath = path.join(process.cwd(), "tradeLog.json");
if (!fs.existsSync(tradeLogPath)) {
  fs.writeFileSync(tradeLogPath, JSON.stringify([]));
}

// ================= Helper Functions =================

async function sendEmail(subject, text) {
  try {
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.NOTIFICATION_EMAIL,
      subject,
      text
    });
    console.log("Email sent:", info.response);
    if (io) io.emit("log", `Email sent: ${subject}`);
  } catch (err) {
    console.error("Email error:", err.message);
    logError("Email error: " + err.stack);
    if (io) io.emit("log", `Email error: ${err.message}`);
  }
}

async function sendTelegram(message) {
  try {
    await telegramBot.sendMessage(telegramChatId, message);
    console.log("Telegram message sent.");
    if (io) io.emit("log", `Telegram: ${message}`);
  } catch (err) {
    console.error("Telegram error:", err.message);
    logError("Telegram error: " + err.stack);
    if (io) io.emit("log", `Telegram error: ${err.message}`);
  }
}

async function sendTelegramInteractive(message, keyboard) {
  try {
    await telegramBot.sendMessage(telegramChatId, message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard }
    });
    console.log("Interactive Telegram message sent.");
  } catch (err) {
    console.error("Telegram interactive error:", err.message);
    logError("Telegram interactive error: " + err.stack);
  }
}

function logTrade(trade) {
  try {
    const trades = JSON.parse(fs.readFileSync(tradeLogPath, "utf8"));
    trades.push({ ...trade, timestamp: new Date().toISOString(), status: "open", currentValue: null, profitLoss: null });
    fs.writeFileSync(tradeLogPath, JSON.stringify(trades, null, 2));
    if (io) io.emit("trade", trade);
  } catch (err) {
    console.error("Log trade error:", err.message);
    logError("Log trade error: " + err.stack);
    if (io) io.emit("log", `Log trade error: ${err.message}`);
  }
}

async function getTokenPrice(tokenAddress) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`;
    const response = await axios.get(url);
    return response.data[tokenAddress.toLowerCase()]?.usd || 0;
  } catch (err) {
    console.error("Token price error:", err.message);
    logError("Token price error: " + err.stack);
    return 0;
  }
}

async function updateMetrics() {
  try {
    const trades = JSON.parse(fs.readFileSync(tradeLogPath, "utf8"));
    for (const trade of trades.filter((t) => t.status === "open")) {
      const price = await getTokenPrice(trade.tokenAddress);
      trade.currentValue = price * trade.amountInvested;
      trade.profitLoss = trade.currentValue - trade.valueAtTrade;
      if (trade.profitLoss < -0.2 * trade.valueAtTrade) trade.status = "closed";
    }
    fs.writeFileSync(tradeLogPath, JSON.stringify(trades, null, 2));
    if (io) io.emit("update", trades);
  } catch (err) {
    console.error("Metrics error:", err.message);
    logError("Metrics error: " + err.stack);
  }
}
setInterval(updateMetrics, 60000);

function generateSummary() {
  try {
    const trades = JSON.parse(fs.readFileSync(tradeLogPath, "utf8"));
    const total = trades.length;
    const profitable = trades.filter((t) => t.profitLoss > 0).length;
    const unprofitable = total - profitable;
    const net = trades.reduce((acc, t) => acc + (t.profitLoss || 0), 0);
    return `📊 Summary (${moment().format("YYYY-MM-DD")}): Total: ${total}, Profitable: ${profitable}, Unprofitable: ${unprofitable}, Net: ${net.toFixed(4)} USD`;
  } catch (err) {
    console.error("Summary error:", err.message);
    logError("Summary error: " + err.stack);
    return "Summary error";
  }
}

// ================= Token Validation Functions =================

async function checkLiquidity(pairAddress) {
  try {
    const pair = new ethers.Contract(pairAddress, pairABI, provider);
    const [reserve0, reserve1] = await pair.getReserves();
    const token0 = await pair.token0();
    const token1 = await pair.token1();
    let wethReserve = ethers.BigNumber.from(0);
    if (token0.toLowerCase() === WETH.toLowerCase()) wethReserve = reserve0;
    else if (token1.toLowerCase() === WETH.toLowerCase()) wethReserve = reserve1;
    const minLiquidity = process.env.MIN_LIQUIDITY
      ? ethers.utils.parseEther(process.env.MIN_LIQUIDITY)
      : ethers.utils.parseEther("0.1");
    return wethReserve.gte(minLiquidity);
  } catch (err) {
    console.error("Liquidity error:", err.message);
    logError("Liquidity error: " + err.stack);
    return false;
  }
}

async function isHoneypot(tokenAddress) {
  try {
    const router = new ethers.Contract(routerAddress, routerABI, signer);
    const recipient = await signer.getAddress();
    const deadline = Math.floor(Date.now() / 1000) + 120;
    const amountIn = ethers.utils.parseEther(TRADE_AMOUNT.toString());
    const buyParams = {
      tokenIn: WETH,
      tokenOut: tokenAddress,
      fee: 3000,
      recipient,
      deadline,
      amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    };

    const buyOut = await router.callStatic.exactInputSingle(buyParams, { value: amountIn, gasLimit: 300000 });
    const sellParams = {
      tokenIn: tokenAddress,
      tokenOut: WETH,
      fee: 3000,
      recipient,
      deadline,
      amountIn: buyOut,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    };

    await router.callStatic.exactInputSingle(sellParams, { gasLimit: 300000 });
    return false;
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes("missing revert data")) {
      return false;
    }
    console.error("Honeypot error:", err.message);
    logError("Honeypot error: " + err.stack);
    return true;
  }
}

async function checkContractVerification(tokenAddress) {
  try {
    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${tokenAddress}&apikey=${process.env.ETHERSCAN_API_KEY}`;
    const res = await axios.get(url);
    return res.data.status === "1" && res.data.result[0]?.SourceCode;
  } catch (err) {
    console.error("Contract verification error:", err.message);
    logError("Contract verification error: " + err.stack);
    return false;
  }
}

async function isOwnershipRenounced(tokenAddress) {
  try {
    const token = new ethers.Contract(tokenAddress, ["function owner() public view returns (address)"], signer);
    return (await token.owner()) === ethers.constants.AddressZero;
  } catch (err) {
    console.error("Ownership error:", err.message);
    logError("Ownership error: " + err.stack);
    return false;
  }
}

async function checkSupplyDistribution(tokenAddress) {
  try {
    const token = new ethers.Contract(
      tokenAddress,
      ["function totalSupply() public view returns (uint256)", "function balanceOf(address account) public view returns (uint256)"],
      signer
    );
    const totalSupply = await token.totalSupply();
    const balance = await token.balanceOf(await signer.getAddress());
    return parseFloat(ethers.utils.formatEther(balance)) / parseFloat(ethers.utils.formatEther(totalSupply)) <= 0.1;
  } catch (err) {
    console.error("Supply distribution error:", err.message);
    logError("Supply distribution error: " + err.stack);
    return false;
  }
}

async function getGoogleSentiment(tokenSymbol) {
  try {
    const query = `${tokenSymbol} memecoin`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CX}&q=${encodeURIComponent(query)}`;
    const res = await axios.get(url);
    const items = res.data.items || [];
    const positives = ["moon", "rocket", "gain", "bull", "up"];
    let count = 0;
    for (const item of items) {
      const text = (item.title + " " + item.snippet).toLowerCase();
      if (positives.some((k) => text.includes(k))) count++;
    }
    return count >= 2;
  } catch (err) {
    console.error("Google sentiment error:", err.message);
    logError("Google sentiment error: " + err.stack);
    return false;
  }
}

async function validateToken(tokenAddress, pairAddress) {
  try {
    if (!(await checkLiquidity(pairAddress))) {
      console.error(`Token ${tokenAddress} failed liquidity check.`);
      return false;
    }
    if (await isHoneypot(tokenAddress)) {
      console.error(`Token ${tokenAddress} appears to be a honeypot.`);
      return false;
    }
    if (!(await checkContractVerification(tokenAddress))) {
      console.error(`Token ${tokenAddress} failed contract verification.`);
      return false;
    }
    if (!(await isOwnershipRenounced(tokenAddress))) {
      console.error(`Token ${tokenAddress} did not have renounced ownership.`);
      return false;
    }
    if (!(await checkSupplyDistribution(tokenAddress))) {
      console.error(`Token ${tokenAddress} failed supply distribution check.`);
      return false;
    }
    let symbol = tokenAddress;
    try {
      const token = new ethers.Contract(tokenAddress, ["function symbol() public view returns (string)"], signer);
      symbol = await token.symbol();
    } catch (err) {
      console.error("Symbol fetch error:", err.message);
      logError("Symbol fetch error: " + err.stack);
    }
    if (!(await getGoogleSentiment(symbol))) {
      console.error(`Token ${tokenAddress} failed Google sentiment check.`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Validation error for token", tokenAddress, ":", err.message);
    logError("Validation error for token " + tokenAddress + ": " + err.stack);
    return false;
  }
}

async function executeTrade(tokenAddress) {
  try {
    const router = new ethers.Contract(routerAddress, routerABI, signer);
    const recipient = await signer.getAddress();
    const deadline = Math.floor(Date.now() / 1000) + 120;
    const amountIn = ethers.utils.parseEther(TRADE_AMOUNT.toString());
    const params = {
      tokenIn: WETH,
      tokenOut: tokenAddress,
      fee: 3000,
      recipient,
      deadline,
      amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    };
    const tx = await router.exactInputSingle(params, { value: amountIn, gasLimit: 300000 });
    const receipt = await tx.wait();
    const price = await getTokenPrice(tokenAddress);
    const tradeData = {
      tokenAddress,
      txHash: receipt.transactionHash,
      amountInvested: parseFloat(TRADE_AMOUNT),
      valueAtTrade: price * parseFloat(TRADE_AMOUNT)
    };
    logTrade(tradeData);
    await sendEmail(`Trade Executed: ${tokenAddress}`, `Transaction: https://etherscan.io/tx/${receipt.transactionHash}`);
    await sendTelegram(`Trade Executed: ${tokenAddress}\nTx: https://etherscan.io/tx/${receipt.transactionHash}`);
    if (io) io.emit("log", `Trade executed for ${tokenAddress}`);
    return { success: true, txHash: receipt.transactionHash };
  } catch (err) {
    console.error("Trade error:", err.message);
    logError("Trade error: " + err.stack);
    if (io) io.emit("log", `Trade error: ${err.message}`);
    return { success: false };
  }
}

// ================= Event Listener for Uniswap PairCreated =================
factoryContract.on("PairCreated", async (token0, token1, pair) => {
  try {
    if (!botRunning) return;
    if (io) io.emit("log", `New Pair Detected: token0: ${token0}, token1: ${token1}, pair: ${pair}`);
    let candidate = null;
    if (token0.toLowerCase() === WETH.toLowerCase()) candidate = token1;
    else if (token1.toLowerCase() === WETH.toLowerCase()) candidate = token0;
    if (!candidate) return;
    if (io) io.emit("log", `Candidate token: ${candidate}`);
    const valid = await validateToken(candidate, pair);
    if (io) io.emit("log", `Validation for ${candidate}: ${valid}`);
    if (valid) {
      if (io) io.emit("log", `Executing trade for ${candidate}`);
      await executeTrade(candidate);
    } else {
      if (io) io.emit("log", `Token ${candidate} failed validation.`);
      console.log("Token invalid:", candidate);
    }
  } catch (err) {
    console.error("Error handling PairCreated event:", err.message);
    logError("Error handling PairCreated event: " + err.stack);
    if (io) io.emit("log", `PairCreated event error: ${err.message}`);
  }
});

// ================= Telegram Command Handlers & Callback Query Handling =================
function setupTelegramCommands() {
  telegramBot.onText(/\/menu/, (msg) => {
    if (msg.chat.id.toString() === telegramChatId) {
      const menuKeyboard = [
        [
          { text: "Start Bot", callback_data: "start_bot" },
          { text: "Stop Bot", callback_data: "stop_bot" }
        ],
        [
          { text: "Set Trade Amount", callback_data: "set_trade" },
          { text: "Trade Info", callback_data: "trade_info" }
        ],
        [{ text: "Show Summary", callback_data: "show_summary" }]
      ];
      telegramBot.sendMessage(telegramChatId, "🔹 *Main Menu* 🔹\nChoose an option:", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: menuKeyboard }
      });
    }
  });

  telegramBot.onText(/\/startbot/, (msg) => {
    if (msg.chat.id.toString() === telegramChatId) {
      botRunning = true;
      telegramBot.sendMessage(telegramChatId, "✅ Bot started.");
    }
  });
  telegramBot.onText(/\/stopbot/, (msg) => {
    if (msg.chat.id.toString() === telegramChatId) {
      botRunning = false;
      telegramBot.sendMessage(telegramChatId, "⛔ Bot stopped.");
    }
  });
  telegramBot.onText(/\/status/, (msg) => {
    if (msg.chat.id.toString() === telegramChatId) {
      telegramBot.sendMessage(telegramChatId, botRunning ? "✅ Bot running." : "⛔ Bot stopped.");
    }
  });
  telegramBot.onText(/\/trades/, (msg) => {
    if (msg.chat.id.toString() === telegramChatId) {
      try {
        const trades = JSON.parse(fs.readFileSync(tradeLogPath, "utf8"));
        const recent = trades.slice(-5).map(t => `*Token:* ${t.tokenAddress}\n*Status:* ${t.status}\n*P/L:* ${t.profitLoss || 0}`).join("\n\n");
        telegramBot.sendMessage(telegramChatId, `*Recent Trades:*\n\n${recent}`, { parse_mode: "Markdown" });
      } catch (err) {
        telegramBot.sendMessage(telegramChatId, "⚠️ Trade log error.");
      }
    }
  });
  telegramBot.onText(/\/settradeamount (.+)/, (msg, match) => {
    if (msg.chat.id.toString() === telegramChatId) {
      process.env.TRADE_AMOUNT = match[1];
      telegramBot.sendMessage(telegramChatId, `Trade amount set to ${match[1]} ETH.`);
    }
  });
  telegramBot.onText(/\/summary/, (msg) => {
    if (msg.chat.id.toString() === telegramChatId) {
      telegramBot.sendMessage(telegramChatId, generateSummary());
    }
  });

  telegramBot.on("callback_query", async (callbackQuery) => {
    const data = callbackQuery.data;
    if (data === "start_bot") {
      botRunning = true;
      await telegramBot.answerCallbackQuery(callbackQuery.id, { text: "Bot started." });
      telegramBot.sendMessage(telegramChatId, "✅ Bot started via menu.");
    } else if (data === "stop_bot") {
      botRunning = false;
      await telegramBot.answerCallbackQuery(callbackQuery.id, { text: "Bot stopped." });
      telegramBot.sendMessage(telegramChatId, "⛔ Bot stopped via menu.");
    } else if (data === "set_trade") {
      await telegramBot.answerCallbackQuery(callbackQuery.id, { text: "Use /settradeamount <amount> to update." });
    } else if (data === "trade_info") {
      await telegramBot.answerCallbackQuery(callbackQuery.id, { text: "Use /trades to view trade info." });
    } else if (data === "show_summary") {
      await telegramBot.answerCallbackQuery(callbackQuery.id, { text: "Fetching summary..." });
      telegramBot.sendMessage(telegramChatId, generateSummary());
    } else if (data === "increase_trade") {
      let currentAmount = parseFloat(process.env.TRADE_AMOUNT);
      currentAmount = (currentAmount + 0.0005).toFixed(4);
      process.env.TRADE_AMOUNT = currentAmount;
      await telegramBot.answerCallbackQuery(callbackQuery.id, { text: `Trade amount increased to ${currentAmount} ETH` });
      console.log(`Trade amount increased to ${currentAmount} ETH`);
    } else if (data === "decrease_trade") {
      let currentAmount = parseFloat(process.env.TRADE_AMOUNT);
      currentAmount = (currentAmount - 0.0005).toFixed(4);
      if (currentAmount <= 0) currentAmount = 0.0005;
      process.env.TRADE_AMOUNT = currentAmount;
      await telegramBot.answerCallbackQuery(callbackQuery.id, { text: `Trade amount decreased to ${currentAmount} ETH` });
      console.log(`Trade amount decreased to ${currentAmount} ETH`);
    } else if (data.startsWith("trade_info_")) {
      const txHash = data.split("trade_info_")[1];
      await telegramBot.answerCallbackQuery(callbackQuery.id, { text: `Trade info for ${txHash}` });
      telegramBot.sendMessage(telegramChatId, `Detailed info for trade ${txHash} can be found in the logs or dashboard.`);
    }
  });
}

function setupDashboard() {
  const screen = blessed.screen({ smartCSR: true, title: "Meme Coin Bot" });
  const grid = new contrib.grid({ rows: 12, cols: 12, screen });
  const tradesTable = grid.set(0, 0, 8, 8, contrib.table, {
    keys: true,
    fg: "white",
    selectedFg: "black",
    selectedBg: "green",
    interactive: true,
    label: "Trades",
    columnWidth: [20, 15, 10, 10, 10, 10]
  });
  const logBox = grid.set(8, 0, 4, 12, contrib.log, { fg: "cyan", label: "Logs" });
  
  function updateTable() {
    try {
      const trades = JSON.parse(fs.readFileSync(tradeLogPath, "utf8"));
      const data = trades.slice(-10).map(t => [
        t.tokenAddress,
        t.txHash ? t.txHash.slice(0, 10) + "..." : "N/A",
        t.amountInvested.toFixed(4),
        t.currentValue ? t.currentValue.toFixed(4) : "N/A",
        t.profitLoss ? t.profitLoss.toFixed(4) : "N/A",
        t.status
      ]);
      tradesTable.setData({ headers: ["Token", "Tx", "Invested", "Value", "P/L", "Status"], data });
      screen.render();
    } catch (err) {
      logBox.log("Table error: " + err.message);
    }
  }
  setInterval(updateTable, 5000);
  screen.key(["q", "C-c"], () => process.exit(0));
}

// ================= Initialization Function =================
function init(sharedTelegramBot, sharedIo) {
  telegramBot = sharedTelegramBot;
  io = sharedIo;
  setupTelegramCommands();
  setupDashboard();
  console.log("Listener initialized with shared Telegram bot instance and Socket.IO.");
}

// ================= Exports =================
export {
  init,
  getTokenPrice,
  checkLiquidity,
  isHoneypot,
  checkContractVerification,
  isOwnershipRenounced,
  checkSupplyDistribution,
  getGoogleSentiment,
  validateToken,
  executeTrade,
  signer,
  logTrade,
  sendEmail,
  sendTelegram
};
