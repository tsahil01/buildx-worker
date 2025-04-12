export interface FileType {
    type: "file" | "directory"
    content?: string
    children?: FileType[]
    path:   string
}

