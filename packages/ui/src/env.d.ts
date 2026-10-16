declare module '*?raw' {
  const content: string;
  export default content;
}
interface FileSystemDirectoryHandle {
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
}
