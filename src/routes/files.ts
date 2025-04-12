
import { Router } from "express";
import { execAsync } from "../config";

export const fileRouter = Router();

fileRouter.post("/", async (req: any, res: any) => {
    try {
        const { containerId, files, workdir } = req.body;

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: "Files array is required" });
        }

        if (!workdir) {
            return res.status(400).json({ error: "Workdir is required" });
        }

        // Check if the container is running
        const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerId}`);
        const isRunning = stdout.trim() === 'true';

        if (!isRunning) {
            return res.status(400).json({ error: "Container is not running" });
        }

        // Ensure base workdir exists
        await execAsync(`docker exec ${containerId} mkdir -p ${workdir}`);

        // Process each file
        const results = [];

        for (const file of files) {
            if (!file.name || !file.content) {
                results.push({
                    name: file.name || "unnamed",
                    success: false,
                    error: "File name and content are required"
                });
                continue;
            }

            try {
                const filePath = `${workdir}/${file.name}`;

                const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));

                await execAsync(`docker exec ${containerId} mkdir -p ${dirPath}`);

                const encodedContent = Buffer.from(file.content).toString('base64');
                await execAsync(`docker exec ${containerId} /bin/sh -c "echo '${encodedContent}' | base64 -d > ${filePath}"`);

                results.push({
                    name: file.name,
                    path: filePath,
                    success: true
                });
            } catch (fileError) {
                results.push({
                    name: file.name,
                    success: false,
                    error: (fileError as Error).message
                });
            }
        }

        res.json({
            containerId,
            workdir,
            results,
            success: results.some(r => r.success)
        });

    } catch (error) {
        console.error("Error creating files in container:", error);

        if ((error as Error).message.includes("No such container")) {
            return res.status(404).json({
                error: "Container not found",
                containerId: req.body.containerId
            });
        }

        res.status(500).json({
            error: "Failed to create files in container",
            details: (error as Error).message,
            stdout: (error as any).stdout?.trim(),
            stderr: (error as any).stderr?.trim(),
            success: false
        });
    }
});

fileRouter.get("/", async (req: any, res: any) => {
    try {
        const { containerId, workdir } = req.query;
        console.log("Request query:", req.query);

        if (!containerId) {
            return res.status(400).json({ error: "Container ID is required" });
        }

        if (!workdir) {
            return res.status(400).json({ error: "Workdir is required" });
        }

        // Check if the container is running
        const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerId}`);
        const isRunning = stdout.trim() === 'true';

        if (!isRunning) {
            return res.status(400).json({ error: "Container is not running" });
        }

        const { stdout: files } = await execAsync(`docker exec ${containerId} ls -1 ${workdir}`);

        res.json({
            containerId,
            workdir,
            files: files.trim().split('\n'),
            success: true
        });

    } catch (error) {
        console.error("Error listing files in container:", error);

        if ((error as Error).message.includes("No such container")) {
            return res.status(404).json({
                error: "Container not found",
                containerId: req.query.containerId
            });
        }

        res.status(500).json({
            error: "Failed to list files in container",
            details: (error as Error).message,
            success: false
        });
    }
})