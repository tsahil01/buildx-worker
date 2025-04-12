import * as pty from "node-pty";
import ws from "ws";
import { IncomingMessage } from "http";

export async function wsSetup(ws: ws, req: IncomingMessage) {
    const clientIP = req.socket.remoteAddress || "unknown";

    let shell: pty.IPty | null = null;
    let containerId: string | null = null;

    ws.on("message", (rawMsg) => {
        try {
            const msg = rawMsg.toString();
            if (!shell) {
                const data = JSON.parse(msg);

                if (data.type === "start" && data.containerId) {
                    containerId = data.containerId;

                    if (!containerId) {
                        ws.send("Container ID is required");
                        ws.close();
                        return;
                    }
                    shell = pty.spawn("docker", ["exec", "-it", containerId, "/bin/sh"], {
                        name: "xterm-color",
                        cols: 500,
                        rows: 100,
                    });

                    shell.onData((chunk: string) => {
                        ws.send(chunk);
                    });

                    shell.onExit(() => {
                        ws.send("\r\n[process exited]");
                        ws.close();
                    });

                    return;
                } else {
                    ws.send("Invalid start message or missing containerId");
                    ws.close();
                    return;
                }
            }

            shell.write(msg);

        } catch (err) {
            console.error("Error processing WebSocket message:", err);
            ws.send("Error processing the message. Please check the format.");
        }
    });

    ws.on("close", () => {
        if (shell) {
            console.log(`WebSocket closed by ${clientIP}, killing shell process for container ${containerId}`);
            shell.kill();
        } else {
            console.log(`WebSocket closed by ${clientIP}, but no shell was active.`);
        }
    });

    ws.on("error", (err) => {
        console.error(`WebSocket error from ${clientIP}:`, err);
    });
}
