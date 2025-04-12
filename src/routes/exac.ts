import { Router } from "express";
import { execAsync } from "../config";
import { spawn } from 'child_process';

export const exacRouter = Router();

exacRouter.post("/", async (req: any, res: any) => {
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

exacRouter.post("/stream", (req: any, res: any) => {
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