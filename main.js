// main.js
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import TelegramBot from 'node-telegram-bot-api';

// Import your modules (make sure to include file extensions)
import * as serverModule from './server.js';  // Optional: if you have a separate server module
import * as listenerModule from './listener.js';

const app = express();
app.use(express.static("public"));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://ladirectmodel.com/", // Replace with your actual URL
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

// Create the Telegram bot instance using your TELEGRAM_BOT_TOKEN from .env.
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize your modules with the shared Telegram bot and Socket.IO instance.
if (serverModule && typeof serverModule.init === "function") {
  serverModule.init(telegramBot, io);
}
listenerModule.init(telegramBot, io);

console.log("Main process started with shared Telegram bot and Socket.IO instance.");

// (Optional) Send a test Telegram notification to ensure everything works.
async function testTelegramNotification() {
  console.log("Sending test Telegram message...");
  try {
    await listenerModule.sendTelegram("🚀 Test Notification: Your advanced bot is live and working!");
    console.log("Test Telegram message sent successfully.");
  } catch (error) {
    console.error("Error sending test Telegram message:", error);
  }
}

testTelegramNotification();
