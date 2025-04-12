import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import ws from "ws";

import { router } from "./routes";

dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new ws.Server({ server });

app.use(cors());
app.use(express.json());

app.use('/api', router);

app.get("/", (req, res) => {
    res.send("Hello from BuildX Worker");
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});