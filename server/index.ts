import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { addFriend, getCities, searchUsers } from "./routes/vk";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // VK proxy routes
  app.get("/api/vk/cities", getCities);
  app.post("/api/vk/search", searchUsers);
  app.post("/api/vk/add-friend", addFriend);

  return app;
}
