import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

dotenv.config();
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Hello from BuildX Worker");
});

app.post("/start", async (req: any, res: any) => {
    try {
        const { image, name, ports, volumes, env } = req.body;

        if (!image) {
            return res.status(400).json({ error: "Container image is required" });
        }

        let command = `docker run -d`;

        if (name) {
            command += ` --name ${name}`;
        }

        if (ports && Array.isArray(ports)) {
            ports.forEach(port => {
                command += ` -p ${port}`;
            });
        }

        if (volumes && Array.isArray(volumes)) {
            volumes.forEach(volume => {
                command += ` -v ${volume}`;
            });

            const volume = process.env.VOLUME;
            if (volume) {
                command += ` -v ${volume}`;
            }
        }

        if (env && typeof env === 'object') {
            Object.entries(env).forEach(([key, value]) => {
                command += ` -e ${key}=${value}`;
            });
        }

        command += ` ${image}`;
        console.log("Executing command:", command);

        const { stdout } = await execAsync(command);
        const containerId = stdout.trim();

        console.log("Container started with ID:", containerId);

        res.status(201).json({
            containerId,
            status: "running",
            message: "Container started successfully"
        });
    } catch (error) {
        console.error("Error starting container:", error);
        res.status(500).json({
            error: "Failed to start container",
            details: error
        });
    }
});

app.post("/stop", async (req: any, res: any) => {
    try {
        const { containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        await execAsync(`docker stop ${containerId}`);
        await execAsync(`docker rm ${containerId}`);

        res.json({
            containerId,
            status: "stopped",
            message: "Container stopped and removed successfully"
        });
    } catch (error) {
        console.error("Error stopping container:", error);
        res.status(500).json({
            error: "Failed to stop container",
            details: error
        });
    }
});

app.post("/ping", async (req: any, res: any) => {
    try {
        const { containerId } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }
        
        const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerId}`);
        const isRunning = stdout.trim() === 'true';

        if (isRunning) {
            res.json({
                containerId,
                status: "running",
                message: "Container is running"
            });
        } else {
            res.json({
                containerId,
                status: "not_running",
                message: "Container exists but is not running"
            });
        }
    } catch (error) {
        if ((error as Error).message?.includes("No such container")) {
            res.status(404).json({
                error: "Container not found",
                containerId: req.body.containerId
            });
        } else {
            console.error("Error pinging container:", error);
            res.status(500).json({
                error: "Failed to ping container",
                details: error
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});