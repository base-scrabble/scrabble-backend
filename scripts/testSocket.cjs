const { io } = require("socket.io-client");

const SOCKET_URL = "http://localhost:8000";

console.log("🔌 Connecting to socket:", SOCKET_URL);

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: false,
  timeout: 5000,
});

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
  socket.disconnect();
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket connection error:", err.message);
  process.exit(1);
});

socket.on("error", (err) => {
  console.error("❌ Socket general error:", err);
  process.exit(1);
});
