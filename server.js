require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

/**
 * Initializes the HTTP server and Socket.IO.
 * This module serves static files from the "public" folder (your dashboard)
 * and sets up real-time updates via Socket.IO.
 *
 * @param {TelegramBot} sharedTelegramBot - (Optional) The shared Telegram bot instance.
 * @param {SocketIO.Server} sharedIo - The shared Socket.IO instance.
 */
module.exports.init = function (sharedTelegramBot, sharedIo) {
  // Setup Socket.IO connection event handling
  sharedIo.on("connection", (socket) => {
    console.log("New client connected");
    socket.emit("log", "Connected to Meme Coin Bot Dashboard");
    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  const PORT = process.env.PORT || 3000;
  console.log(`Bot running on port ${PORT}`);
  sharedIo.emit("log", `Server running on port ${PORT}`);
  if (sharedTelegramBot) {
    sharedTelegramBot.sendMessage(process.env.TELEGRAM_CHAT_ID, `Server running on port ${PORT}`);
  }
};
