import express from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { spawn } from 'child_process';

const execAsync = promisify(exec);
const router = express.Router();

router.post("/start", async (req: any, res: any) => {
    try {
        const { image, name, ports, volumes, env, command } = req.body;

        if (!image) {
            return res.status(400).json({ error: "Container image is required" });
        }

        let dockerCommand = `docker run -d`;

        if (name) {
            dockerCommand += ` --name ${name}`;
        }

        if (ports && Array.isArray(ports)) {
            ports.forEach(port => {
                dockerCommand += ` -p ${port}`;
            });
        }

        if (volumes && Array.isArray(volumes)) {
            volumes.forEach(volume => {
                dockerCommand += ` -v ${volume}`;
            });
        }

        if (env && typeof env === 'object') {
            Object.entries(env).forEach(([key, value]) => {
                dockerCommand += ` -e ${key}=${value}`;
            });
        }

        dockerCommand += ` ${image}`;

        // Add command if provided, otherwise default to tail -f /dev/null to keep container running
        if (command) {
            dockerCommand += ` ${command}`;
        } else {
            dockerCommand += ` tail -f /dev/null`;
        }

        const { stdout } = await execAsync(dockerCommand);
        const containerId = stdout.trim();

        res.status(201).json({
            containerId,
            status: "running",
            message: "Container started successfully"
        });
    } catch (error) {
        console.error("Error starting container:", error);
        res.status(500).json({
            error: "Failed to start container",
            details: (error as Error).message
        });
    }
});

router.post("/stop", async (req: any, res: any) => {
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
            details: (error as Error).message
        });
    }
});

router.post("/ping", async (req: any, res: any) => {
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
        if ((error as Error).message.includes("No such container")) {
            res.status(404).json({
                error: "Container not found",
                containerId: req.body.containerId
            });
        } else {
            console.error("Error pinging container:", error);
            res.status(500).json({
                error: "Failed to ping container",
                details: (error as Error).message
            });
        }
    }
});

router.post("/exec", async (req: any, res: any) => {
    try {
        const { containerId, command, workdir } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        if (!command) {
            return res.status(400).json({ error: "Command is required" });
        }
        let execCommand = `docker exec`;
        if (workdir) {
            execCommand += ` -w ${workdir}`;
        }
        execCommand += ` ${containerId} /bin/sh -c "${command.replace(/"/g, '\\"')}"`;

        const { stdout, stderr } = await execAsync(execCommand);

        res.json({
            containerId,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            success: true
        });
    } catch (error) {
        console.error("Error executing command in container:", error);

        if ((error as Error).message.includes("No such container")) {
            return res.status(404).json({
                error: "Container not found",
                containerId: req.body.containerId
            });
        }

        res.status(500).json({
            error: "Failed to execute command in container",
            details: (error as Error).message,
            stdout: (error as any)?.stdout?.trim(),
            stderr: (error as any)?.stderr?.trim(),
            success: false
        });
    }
});

router.post("/exec-stream", (req: any, res: any) => {
    try {
        const { containerId, command, workdir } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        if (!command) {
            return res.status(400).json({ error: "Command is required" });
        }

        let execCommand = `docker exec`;

        if (workdir) {
            execCommand += ` -w ${workdir}`;
        }

        execCommand += ` ${containerId} /bin/sh -c "${command.replace(/"/g, '\\"')}"`;

        res.writeHead(200, {
            'Content-Type': 'text/plain',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Transfer-Encoding': 'chunked'
        });

        const childProcess = spawn('sh', ['-c', execCommand], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        childProcess.stdout.on('data', (data: any) => {
            res.write(data);
            if (res.flush && typeof res.flush === 'function') {
                res.flush();
            }
        });

        childProcess.stderr.on('data', (data: any) => {
            res.write(`${data}`);
            if (res.flush && typeof res.flush === 'function') {
                res.flush();
            }
        });

        childProcess.on('close', (code: any) => {
            res.write(`\nProcess exited with code ${code}`);
            res.end();
        });

        childProcess.on('error', (error: any) => {
            res.write(`\nError: ${error.message}`);
            res.end();
        });

    } catch (error) {
        console.error("Error executing streaming command in container:", error);
        res.status(500).json({
            error: "Failed to execute streaming command in container",
            details: (error as Error).message
        });
    }
});

export { router };