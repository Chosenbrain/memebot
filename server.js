import dotenv from "dotenv";
dotenv.config();

import express from "express";

export function init(sharedTelegramBot, sharedIo) {
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
  
  console.log("Server module initialized.");
}
