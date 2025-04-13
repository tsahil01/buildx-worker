import { Router } from 'express';
import { execAsync, isRunning } from '../config';
import { fileCreateType, getFileType } from '../types';

export const fileRouter = Router();

fileRouter.post("/create", async (req: any, res: any) => {
    try {
        const parsedBody = fileCreateType.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                error: "Invalid request body",
                details: parsedBody.error.errors
            });
        }
        const { containerId, files, workdir } = parsedBody.data;

        // Check if the container is running
        const containerRunning = await isRunning(containerId);
        if (!containerRunning) {
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
                // Create the file path
                const filePath = `${workdir}/${file.name}`;

                // Get the directory part of the file path
                const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));

                // Ensure the directory exists
                await execAsync(`docker exec ${containerId} mkdir -p ${dirPath}`);

                // Write file content to container
                // We encode the content to handle special characters and new lines
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
        const parsedQuery = getFileType.safeParse(req.query);
        if (!parsedQuery.success) {
            return res.status(400).json({
                error: "Invalid request query",
                details: parsedQuery.error.errors
            });
        }
        const { containerId, path } = parsedQuery.data;

        const filePath = path.toString();

        // Check if the container is running
        const containerRunning = await isRunning(containerId);
        if (!containerRunning) {
            return res.status(400).json({ error: "Container is not running" });
        }

        const { stdout: lsStdout, stderr: lsStderr } = await execAsync(`docker exec ${containerId} ls -l "${filePath}"`);
        if (lsStderr) {
            if (lsStderr.includes("No such file or directory")) {
                return res.status(404).json({ error: "Path not found", path: filePath });
            }
            return res.status(500).json({ error: "Failed to list files", details: lsStderr });
        }

        const { stdout: fileContentStdout, stderr: fileContentStderr } = await execAsync(`docker exec ${containerId} cat "${filePath}"`);
        if (fileContentStderr) {
            if (fileContentStderr.includes("No such file or directory")) {
                return res.status(404).json({ error: "File not found", path: filePath });
            }
            return res.status(500).json({ error: "Failed to read file", details: fileContentStderr });
        }
        const fileContent = fileContentStdout.trim();
        const fileType = lsStdout.startsWith("d") ? "directory" : "file";
        const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
        const fileDir = filePath.substring(0, filePath.lastIndexOf("/"));
        return res.json({
            containerId,
            fileName,
            fileDir,
            fileType,
            fileContent,
            success: true
        })

    } catch (error) {
        console.error("Error retrieving files from container:", error);

        if ((error as Error).message.includes("No such container")) {
            return res.status(404).json({
                error: "Container not found",
                containerId: req.query.containerId
            });
        }

        res.status(500).json({
            error: "Failed to retrieve files from container",
            details: (error as Error).message,
            success: false
        });
    }
});

fileRouter.get('/structure', async (req: any, res: any) => {
    try {
        const parsedQuery = getFileType.safeParse(req.query);
        if (!parsedQuery.success) {
            return res.status(400).json({
                error: "Invalid request query",
                details: parsedQuery.error.errors
            });
        }
        const { containerId, path } = parsedQuery.data;

        // Check if the container is running
        const containerRunning = await isRunning(containerId);
        if (!containerRunning) {
            return res.status(400).json({ error: "Container is not running" });
        }
        const { stdout, stderr } = await execAsync(`docker exec ${containerId} ls "${path}"`);
        if (stderr) {
            if (stderr.includes("No such file or directory")) {
                return res.status(404).json({ error: "Path not found", path });
            }
            return res.status(500).json({ error: "Failed to list files", details: stderr });
        }
        const files = stdout.split('\n');

        return res.json({
            containerId,
            path,
            files
        });
    } catch (error) {
        console.error("Error retrieving directory structure from container:", error);
        if ((error as Error).message.includes("No such container")) {
            return res.status(404).json({
                error: "Container not found",
                containerId: req.query.containerId
            });
        }
        res.status(500).json({
            error: "Failed to retrieve directory structure from container",
            details: (error as Error).message,
            success: false
        });
    }
})

fileRouter.delete("/", async (req: any, res: any) => {
    try {
        const parsedBody = getFileType.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                error: "Invalid request body",
                details: parsedBody.error.errors
            });
        }
        const { containerId, path } = parsedBody.data;

        // Check if the container is running
        const containerRunning = await isRunning(containerId);
        if (!containerRunning) {
            return res.status(400).json({ error: "Container is not running" });
        }

        // Delete the file or directory
        await execAsync(`docker exec ${containerId} rm -rf "${path}"`);

        res.json({
            containerId,
            path,
            success: true
        });
    } catch (error) {
        console.error("Error deleting files in container:", error);

        if ((error as Error).message.includes("No such container")) {
            return res.status(404).json({
                error: "Container not found",
                containerId: req.body.containerId
            });
        }

        res.status(500).json({
            error: "Failed to delete files in container",
            details: (error as Error).message,
            success: false
        });
    }
})