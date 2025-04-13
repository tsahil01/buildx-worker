import { spawn } from "child_process";
import { Router } from "express";
import { tunnelType } from "../types";
import { isRunning } from "../config";

export const tunnelRouter = Router();

tunnelRouter.post('/', async (req: any, res: any) => {
    try {
        const parsedData = tunnelType.safeParse(req.body);
        if (!parsedData.success) {
            return res.status(400).json({ error: parsedData.error.errors });
        }
        const { containerId, port } = parsedData.data;

        const containerRunning = await isRunning(containerId);
        if (!containerRunning) {
            return res.status(404).json({ error: "Container not found or not running" });
        }

        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                res.status(504).json({ error: "Timeout waiting for tunnel URL" });
            }
            if (tunnelProcess && !tunnelProcess.killed) {
                tunnelProcess.kill();
            }
        }, 15000)

        let tunnelUrl: string | null = null;
        const tunnelProcess = spawn("docker", [
            "exec",
            containerId,
            "cloudflared",
            "tunnel",
            "--url",
            `http://localhost:${port}`
        ]);

        tunnelProcess.stderr.on("data", (data) => {
            console.error(`[cloudflared stderr]: ${data}`);
            
            // Sometimes cloudflared outputs the URL to stderr
            const stderrOutput = data.toString();
            const stderrMatch = stderrOutput.match(/https:\/\/[-a-zA-Z0-9@:%._\+~#=]+\.trycloudflare\.com/);
            if (stderrMatch && !tunnelUrl && !res.headersSent) {
                tunnelUrl = stderrMatch[0];
                clearTimeout(timeout);
                res.json({ url: tunnelUrl });
                
                // Keep the tunnel process running but don't need to continue processing output
                tunnelProcess.stdout.removeAllListeners('data');
                tunnelProcess.stderr.removeAllListeners('data');
            }
        });

        tunnelProcess.stdout.on("data", (data) => {
            const output = data.toString();
            const match = output.match(/https:\/\/[-a-zA-Z0-9@:%._\+~#=]+\.trycloudflare\.com/);
            if (match && !tunnelUrl && !res.headersSent) {
                tunnelUrl = match[0];
                clearTimeout(timeout);
                res.json({ url: tunnelUrl });
                
                // Keep the tunnel process running but don't need to continue processing output
                tunnelProcess.stdout.removeAllListeners('data');
                tunnelProcess.stderr.removeAllListeners('data');
            }
        });

        tunnelProcess.on("error", (err) => {
            console.error("Failed to start cloudflared:", err);
            clearTimeout(timeout);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to start tunnel" });
            }
        });

        tunnelProcess.on("close", (code) => {
            clearTimeout(timeout);
            console.log(`cloudflared process exited with code ${code}`);
            if (!tunnelUrl && !res.headersSent) {
                res.status(500).json({ error: "Tunnel closed before URL was obtained" });
            }
        });

    } catch (error) {
        console.error("Error in /tunnel route:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});
