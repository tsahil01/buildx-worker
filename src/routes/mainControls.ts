import { Router } from "express";
import { execAsync, isRunning } from "../config";
import { containerIdType, startType, SubdomainType } from "../types";
import { nanoid } from 'nanoid';

export const mainRouter = Router();

mainRouter.post("/start", async (req: any, res: any) => {
    try {
        const parsedBody = startType.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                error: "Invalid request body",
                details: parsedBody.error.errors
            });
        }
        const { image, name, ports, volumes, env, command } = parsedBody.data;

        let subdomains: SubdomainType[] = [];
        let dockerCommand = `docker run -d`;
        if (name) dockerCommand += ` --name ${name}`;

        dockerCommand += ` --network traefik-proxy-net`;
        dockerCommand += ` --label "traefik.enable=true"`;

        if (ports && ports.length > 0) {
            for (let i = 0; i < ports.length; i++) {
                const uniqueId = name ? `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${nanoid(8)}` : `app-${nanoid(8)}`;
                const subdomain = `${uniqueId}.worker.buildx.website`;
                dockerCommand += ` --label "traefik.http.routers.${uniqueId}.rule=Host(\\"${subdomain}\\")"`;
                dockerCommand += ` --label "traefik.http.routers.${uniqueId}.entrypoints=websecure"`;
                dockerCommand += ` --label "traefik.http.routers.${uniqueId}.tls.certresolver=le_resolver"`;
                dockerCommand += ` --label "traefik.http.services.${uniqueId}.loadbalancer.server.port=${ports[i]}"`;
                subdomains.push({ [ports[i]]: subdomain });
            }
        } else {
            const uniqueId = name ? `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${nanoid(8)}` : `app-${nanoid(8)}`;
            const subdomain = `${uniqueId}.worker.buildx.website`;
            dockerCommand += ` --label "traefik.http.routers.${uniqueId}.rule=Host(\\"${subdomain}\\")"`;
            dockerCommand += ` --label "traefik.http.routers.${uniqueId}.entrypoints=websecure"`;
            dockerCommand += ` --label "traefik.http.routers.${uniqueId}.tls.certresolver=le_resolver"`;
            dockerCommand += ` --label "traefik.http.services.${uniqueId}.loadbalancer.server.port=80"`; // Default to port 3000 if no ports are specified
            subdomains.push({ 80: subdomain });
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
            message: "Container started successfully",
            urls: subdomains   
        });
    } catch (error) {
        console.error("Error starting container:", error);
        res.status(500).json({
            error: "Failed to start container",
            details: (error as Error).message
        });
    }
});


mainRouter.post("/stop", async (req: any, res: any) => {
    try {
        const parsedBody = containerIdType.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                error: "Invalid request body",
                details: parsedBody.error.errors
            });
        }
        const { containerId } = parsedBody.data;

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

mainRouter.get("/ping", async (req: any, res: any) => {
    try {
        const parsedQuery = containerIdType.safeParse(req.query);
        if (!parsedQuery.success) {
            return res.status(400).json({
                error: "Invalid request query",
                details: parsedQuery.error.errors
            });
        }
        const { containerId } = parsedQuery.data;

        const containerRunning = await isRunning(containerId);
        if (containerRunning) {
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