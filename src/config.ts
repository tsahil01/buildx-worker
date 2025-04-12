import { exec } from "child_process";
import { promisify } from "util";

export const execAsync = promisify(exec);

export async function isRunning(containerId: string): Promise<boolean> {
    const { stdout } = await execAsync(`docker inspect -f '{{.State.Running}}' ${containerId}`);
    const isRunning = stdout.trim() === 'true';
    return isRunning;
}