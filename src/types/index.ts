import { z } from "zod"

export interface FileType {
    type: "file" | "directory"
    content?: string
    children?: FileType[]
    path:   string
}

export const startType = z.object({
    image: z.string(),
    name: z.string().optional(),
    ports: z.array(z.string()).optional(),
    volumes: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    command: z.string().optional(),
})

export const containerIdType = z.object({
    containerId: z.string(),
});

export const exacType = z.object({
    containerId: z.string(),
    command: z.string(),
    workdir: z.string()
});

export const fileCreateType = z.object({
    containerId: z.string(),
    files: z.array(z.object({
        name: z.string(),
        content: z.string()
    })),
    workdir: z.string()
});

export const getFileType = z.object({
    containerId: z.string(),
    path: z.string(),
})