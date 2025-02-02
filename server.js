require("dotenv").config();
const express = require("express");

/**
 * Initializes the server module.
 * This module sets up Socket.IO connection handling and serves static files from the "public" folder.
 *
 * @param {TelegramBot} sharedTelegramBot - The shared Telegram bot instance.
 * @param {SocketIO.Server} sharedIo - The shared Socket.IO instance.
 */
module.exports.init = function (sharedTelegramBot, sharedIo) {
  // Handle Socket.IO connections
  sharedIo.on("connection", (socket) => {
    console.log("New client connected");
    socket.emit("log", "Connected to Meme Coin Bot Dashboard");
    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  const PORT = process.env.PORT || 3000;
  console.log(`Server running on port ${PORT}`);
  sharedIo.emit("log", `Server running on port ${PORT}`);
  if (sharedTelegramBot) {
    sharedTelegramBot.sendMessage(process.env.TELEGRAM_CHAT_ID, `Server running on port ${PORT}`);
  }
};
